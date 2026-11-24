import { act } from "@testing-library/react";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, test, vi } from "vitest";

import { parseAmount } from "@/lib/amount";
import { goldenBudget } from "@/lib/budgets/__tests__/golden";
import { budgetAnswer } from "../../lib/__tests__/fixtures";
import { type DialogPlan, planOf } from "../../lib/dialog";
import { ok, refuse, renderHookInApp, route } from "./helpers";
import { type BudgetDialogConflict, useBudgetSave } from "../useBudgetSave";
import { useBudgetWrite } from "../useBudgetWrite";

const network = setupServer();
beforeAll(() => network.listen({ onUnhandledFrame: "error" }));
afterEach(() => network.resetHandlers());
afterAll(() => network.close());

const IN = {
	today: "2026-11-02",
	currency: "INR" as const,
	numberLocale: "hi-IN-u-nu-latn",
	dateLocale: "en-IN",
	timezone: "Asia/Kolkata",
};

const FOOD = goldenBudget("food");
const SAVED = budgetAnswer("food", { version: 2 });
const ID = "0192f0c4-7a1e-7c3b-9d2a-5b8e1f0a1c01";

const planFor = (amount: string) =>
	planOf({
		kind: "change",
		record: FOOD,
		category: "food",
		typed: parseAmount(amount, IN),
		scope: "onward",
		month: "2026-11",
		id: ID,
		currency: "INR",
	});

function setup(
	record: typeof FOOD | null = FOOD,
	plan: (amount: string) => DialogPlan | null = planFor,
) {
	const handlers = {
		onClose: vi.fn(),
		onSaved: vi.fn(),
		onDeleteInstead: vi.fn(),
		onExists: vi.fn(),
		onFieldsRefused: vi.fn(),
	};
	const view = renderHookInApp(() => {
		const write = useBudgetWrite<BudgetDialogConflict>(handlers.onClose);
		const saving = useBudgetSave<string>({
			write,
			record,
			scope: "onward",
			month: "2026-11",
			limit: 700000,
			locale: IN,
			planFor: plan,
			...handlers,
		});
		return { write, ...saving };
	});
	const save = (amount: string) =>
		act(async () => {
			await view.result.current.save(amount);
		});
	return { ...view, ...handlers, save };
}

describe("useBudgetSave (BR-F04-19 to BR-F04-21, D-561)", () => {
	test("patches the Budget at its version, reports it with its notice and closes", async () => {
		const patches = route(network, "patch", "/api/budgets/:id", () => ok(SAVED));
		const { save, onSaved, onClose } = setup();
		await save("7000");
		expect(patches).toHaveLength(1);
		expect(patches[0]?.headers.get("if-match")).toBeTruthy();
		expect(onSaved).toHaveBeenCalledWith(
			expect.objectContaining({ category: "food" }),
			expect.anything(),
		);
		expect(onClose).toHaveBeenCalledOnce();
	});

	test("posts for a category with no Budget record", async () => {
		const posts = route(network, "post", "/api/budgets", () => ok(SAVED, 201));
		const { result, onClose } = setup(null);
		const plan = planOf({
			kind: "add",
			record: null,
			category: "food",
			typed: parseAmount("7000", IN),
			scope: "onward",
			month: "2026-11",
			id: ID,
			currency: "INR",
		}) as DialogPlan;
		await act(async () => {
			await result.current.submit(plan, 0, null);
		});
		expect(posts).toHaveLength(1);
		expect(onClose).toHaveBeenCalledOnce();
	});

	test("a second press while one is out sends nothing", async () => {
		let release: () => void = () => {};
		const held = new Promise<void>((resolve) => {
			release = resolve;
		});
		const patches = route(network, "patch", "/api/budgets/:id", async () => {
			await held;
			return ok(SAVED);
		});
		const { result } = setup();
		let first: Promise<unknown> = Promise.resolve();
		await act(async () => {
			first = result.current.save("7000");
			await result.current.save("7000");
		});
		release();
		await act(async () => {
			await first;
		});
		expect(patches).toHaveLength(1);
	});

	test("a 409 opens the conflict view over the dialog, with the write to resend", async () => {
		const current = budgetAnswer("food", { version: 3 });
		route(network, "patch", "/api/budgets/:id", () =>
			refuse(409, "version_conflict", { details: { current } }),
		);
		const { save, result, onClose } = setup();
		await save("7000");
		expect(result.current.write.conflict?.current).toEqual(current);
		expect(result.current.write.conflict?.body).toBeDefined();
		expect(onClose).not.toHaveBeenCalled();
	});

	test("budget_exists is the dialog's to answer", async () => {
		const found = budgetAnswer("food", { version: 4 });
		route(network, "post", "/api/budgets", () =>
			refuse(409, "budget_exists", { details: { current: found } }),
		);
		const { result, onExists, onClose } = setup(null);
		const plan = planOf({
			kind: "add",
			record: null,
			category: "food",
			typed: parseAmount("7000", IN),
			scope: "onward",
			month: "2026-11",
			id: ID,
			currency: "INR",
		}) as DialogPlan;
		await act(async () => {
			await result.current.submit(plan, 0, null);
		});
		expect(onExists).toHaveBeenCalledWith(found);
		expect(onClose).not.toHaveBeenCalled();
	});

	test("a 422 naming fields asks for focus and keeps the dialog", async () => {
		route(network, "patch", "/api/budgets/:id", () =>
			refuse(422, "validation_failed", { fields: { limitMinor: "Too big." } }),
		);
		const { save, result, onFieldsRefused, onClose } = setup();
		await save("7000");
		expect(result.current.write.server.limitMinor).toBe("Too big.");
		expect(onFieldsRefused).toHaveBeenCalledOnce();
		expect(onClose).not.toHaveBeenCalled();
	});

	test("a stop that would remove every month asks to delete instead, and sends nothing", async () => {
		const patches = route(network, "patch", "/api/budgets/:id", () => ok(SAVED));
		const blocked = {
			kind: "edit",
			body: {},
			blocked: true,
			unchanged: false,
		} as unknown as DialogPlan;
		const { save, onDeleteInstead, onClose } = setup(FOOD, () => blocked);
		await save("");
		expect(onDeleteInstead).toHaveBeenCalledExactlyOnceWith(FOOD);
		expect(patches).toHaveLength(0);
		expect(onClose).not.toHaveBeenCalled();
	});
});
