import { waitFor } from "@testing-library/react";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, test } from "vitest";

import { parseAmount } from "@/lib/amount";
import { goldenBudget } from "@/lib/budgets/__tests__/golden";
import type { ExpenseCategory } from "@/lib/budgets/model";
import type { Month } from "@/lib/budgets/months";
import { historyAnswer } from "../../lib/__tests__/fixtures";
import { ok, renderHookInApp, route } from "./helpers";
import { type BudgetPreviewInput, useBudgetPreview } from "../useBudgetPreview";

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

const BASE: BudgetPreviewInput = {
	kind: "change",
	category: "food",
	typed: parseAmount("7000", IN),
	scope: "onward",
	month: "2026-11",
	record: goldenBudget("food"),
	current: "2026-11",
};

function serveHistory() {
	return route(network, "get", "/api/budgets/history", ({ path }) => {
		const query = new URL(path, "http://x").searchParams;
		return ok(
			historyAnswer(
				query.get("category") as ExpenseCategory,
				query.get("to") as Month,
				Number(query.get("months")),
			),
		);
	});
}

const setup = (input: Partial<BudgetPreviewInput> = {}) =>
	renderHookInApp(() => useBudgetPreview({ ...BASE, ...input }));

describe("useBudgetPreview (BR-F04-26)", () => {
	test("with a category and a limit, the change is as typed", () => {
		serveHistory();
		const { result } = setup();
		expect(result.current.limit).toBe(700000);
		expect(result.current.change).toEqual({
			scope: "from",
			month: "2026-11",
			limitMinor: 700000,
		});
	});

	test("a one-month scope is a one-month change", () => {
		serveHistory();
		const { result } = setup({ scope: "month" });
		expect(result.current.change?.scope).toBe("month");
	});

	test("a stop has no limit, which is null", () => {
		serveHistory();
		const { result } = setup({ kind: "stop", typed: parseAmount("", IN) });
		expect(result.current.limit).toBeNull();
		expect(result.current.change?.limitMinor).toBeNull();
	});

	test("without a category or a valid limit there is no change and no preview", () => {
		const reads = serveHistory();
		const none = setup({ category: null });
		expect(none.result.current.change).toBeNull();
		expect(none.result.current.preview).toBeNull();
		const bad = setup({ typed: parseAmount("abc", IN) });
		expect(bad.result.current.limit).toBeUndefined();
		expect(bad.result.current.change).toBeNull();
		expect(reads).toHaveLength(0);
	});

	test("the preview comes with the spending of the months it lists", async () => {
		const reads = serveHistory();
		const { result } = setup();
		expect(result.current.figures).toBe("loading");
		await waitFor(() => expect(result.current.figures).toBe("ready"));
		expect(reads.length).toBeGreaterThan(0);
		expect(result.current.preview).toMatchObject({ blocked: false });
	});
});
