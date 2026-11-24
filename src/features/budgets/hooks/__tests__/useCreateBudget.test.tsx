import { act, waitFor } from "@testing-library/react";
import { HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, test } from "vitest";

import { QUERY_ROOTS } from "@/lib/api/query-keys";
import type { BudgetCreateInput } from "@/lib/budgets/schemas";
import { budgetKeys } from "../../lib/keys";
import { budgetAnswer } from "../../lib/__tests__/fixtures";
import { readBudgetNoticeError, readBudgetWriteError } from "../../lib/write-errors";
import { useCreateBudget } from "../useCreateBudget";
import {
	offline,
	ok,
	refuse,
	renderHookInApp,
	route,
	settled,
	testClient,
	watched,
} from "./helpers";

const network = setupServer();
beforeAll(() => network.listen({ onUnhandledFrame: "error" }));
afterEach(() => network.resetHandlers());
afterAll(() => network.close());

const ID = "0192f0c4-7a1e-7c3b-9d2a-5b8e1f0a8005";
const KEY = "0192f0c4-7a1e-7c3b-9d2a-5b8e1f0a1cfe";

// Flow 7.1: Health, 1,500.00 from November.
const FROM: BudgetCreateInput = {
	id: ID,
	category: "health",
	from: "2026-11",
	limitMinor: 150000,
	currency: "INR",
};
const HEALTH = budgetAnswer("food", {
	id: ID,
	category: "health",
	schedule: [{ from: "2026-11", limitMinor: 150000 }],
	version: 1,
});

// BR-F04-33: Undo after deleting golden food.
const RESTORE: BudgetCreateInput = {
	id: ID,
	category: "food",
	schedule: [
		{ from: "2026-09", limitMinor: 600000 },
		{ from: "2026-10", limitMinor: 500000 },
	],
	overrides: [{ month: "2026-10", limitMinor: 800000 }],
	currency: "INR",
};

async function create(
	result: { current: ReturnType<typeof useCreateBudget> },
	body: BudgetCreateInput = FROM,
	idempotencyKey = KEY,
) {
	await act(async () => {
		await result.current
			.mutateAsync({ body, idempotencyKey })
			.catch(() => undefined);
	});
	await settled(result);
}

describe("useCreateBudget (F04 section 11)", () => {
	test("posts the Add body with the press's key and no version", async () => {
		const seen = route(network, "post", "/api/budgets", () => ok(HEALTH, 201));
		const { result } = renderHookInApp(() => useCreateBudget());
		await create(result);
		expect(seen).toHaveLength(1);
		expect(seen[0]?.body).toEqual(FROM);
		expect(seen[0]?.headers.get("idempotency-key")).toBe(KEY);
		expect(seen[0]?.headers.get("if-match")).toBeNull();
		expect(result.current.data).toEqual(HEALTH);
	});

	// AC-F04-25
	test("posts a restoring body for Undo after a delete", async () => {
		const seen = route(network, "post", "/api/budgets", () => ok(HEALTH, 201));
		const { result } = renderHookInApp(() => useCreateBudget());
		await create(result, RESTORE);
		expect(seen[0]?.body).toEqual(RESTORE);
	});

	test("a retry of the same press sends the same key, so the server answers it once (D-507)", async () => {
		const seen = route(network, "post", "/api/budgets", (_request, index) =>
			index === 0 ? HttpResponse.error() : ok(HEALTH, 201),
		);
		const { result } = renderHookInApp(() => useCreateBudget());
		await create(result);
		await create(result);
		expect(seen.map((each) => each.headers.get("idempotency-key"))).toEqual([
			KEY,
			KEY,
		]);
	});

	test("a repeated id answered 200 counts as created", async () => {
		route(network, "post", "/api/budgets", () => ok(HEALTH, 200));
		const { result } = renderHookInApp(() => useCreateBudget());
		await create(result);
		expect(result.current.isSuccess).toBe(true);
	});

	test("a confirmed create refreshes the Budgets reads and the profile (section 12, BR-F02-14)", async () => {
		route(network, "post", "/api/budgets", () => ok(HEALTH, 201));
		const queryClient = testClient();
		const month = watched(queryClient, budgetKeys.month("2026-11"), {
			seeded: true,
		});
		const profile = watched(queryClient, [QUERY_ROOTS.profile], {
			seeded: true,
		});
		const { result } = renderHookInApp(() => useCreateBudget(), { queryClient });
		await create(result);
		expect(month.fetches()).toBe(1);
		expect(profile.fetches()).toBe(1);
		month.stop();
		profile.stop();
	});

	test("the create settles only once the page's month view has refetched", async () => {
		route(network, "post", "/api/budgets", () => ok(HEALTH, 201));
		const queryClient = testClient();
		let release: () => void = () => {};
		const slow = new Promise<void>((resolve) => {
			release = resolve;
		});
		const month = watched(
			queryClient,
			budgetKeys.month("2026-11"),
			{ seeded: true },
			() => slow.then(() => ({ refetched: true })),
		);
		const { result } = renderHookInApp(() => useCreateBudget(), { queryClient });
		let done = false;
		let pending: Promise<unknown> = Promise.resolve();
		act(() => {
			pending = result.current
				.mutateAsync({ body: FROM, idempotencyKey: KEY })
				.then(() => {
					done = true;
				});
		});
		await waitFor(() => expect(month.fetches()).toBe(1));
		expect(done).toBe(false);
		expect(result.current.isPending).toBe(true);
		await act(async () => {
			release();
			await pending;
		});
		expect(done).toBe(true);
		expect(queryClient.getQueryData(budgetKeys.month("2026-11"))).toEqual({
			refetched: true,
		});
		month.stop();
	});

	// Flow 7.1
	test("budget_exists is the error, carrying the Budget another device made", async () => {
		const existing = budgetAnswer("shopping");
		route(network, "post", "/api/budgets", () =>
			refuse(409, "budget_exists", { details: { current: existing } }),
		);
		const { result } = renderHookInApp(() => useCreateBudget());
		await create(result);
		expect(readBudgetWriteError(result.current.error)).toEqual({
			kind: "exists",
			current: existing,
		});
	});

	test("from Undo, budget_exists opens the conflict view with that Budget", async () => {
		const existing = budgetAnswer("food", {
			id: "0192f0c4-7a1e-7c3b-9d2a-5b8e1f0a8099",
		});
		route(network, "post", "/api/budgets", () =>
			refuse(409, "budget_exists", { details: { current: existing } }),
		);
		const { result } = renderHookInApp(() => useCreateBudget());
		await create(result, RESTORE);
		expect(readBudgetNoticeError(result.current.error)).toEqual({
			kind: "conflict",
			current: existing,
		});
	});

	test("a 422 is the error, with each message under its field", async () => {
		route(network, "post", "/api/budgets", () =>
			refuse(422, "validation_failed", {
				fields: {
					category: "Choose a category.",
					limitMinor: "Enter a limit.",
				},
			}),
		);
		const { result } = renderHookInApp(() => useCreateBudget());
		await create(result);
		expect(readBudgetWriteError(result.current.error)).toEqual({
			kind: "fields",
			fields: { category: "Choose a category.", limitMinor: "Enter a limit." },
			message: null,
		});
	});

	test("a refused create refreshes nothing", async () => {
		route(network, "post", "/api/budgets", () => refuse(500, "internal"));
		const queryClient = testClient();
		const month = watched(queryClient, budgetKeys.month("2026-11"), {
			seeded: true,
		});
		const profile = watched(queryClient, [QUERY_ROOTS.profile], {
			seeded: true,
		});
		const { result } = renderHookInApp(() => useCreateBudget(), { queryClient });
		await create(result);
		expect(month.fetches()).toBe(0);
		expect(profile.fetches()).toBe(0);
		month.stop();
		profile.stop();
	});

	test("a failure is never retried by itself", async () => {
		const seen = route(network, "post", "/api/budgets", () =>
			refuse(503, "unavailable"),
		);
		const { result } = renderHookInApp(() => useCreateBudget());
		await create(result);
		expect(seen).toHaveLength(1);
	});

	// D-241
	test("offline before M5 it is tried at once and fails with the save message, never left waiting", async () => {
		const online = offline();
		try {
			route(network, "post", "/api/budgets", () => HttpResponse.error());
			const { result } = renderHookInApp(() => useCreateBudget());
			await create(result);
			expect(result.current.isPaused).toBe(false);
			expect(readBudgetWriteError(result.current.error)).toEqual({
				kind: "form",
				message:
					"The Budget could not be saved. Check your connection and try again. Your changes are still here.",
			});
		} finally {
			online();
		}
	});

	test("two presses at once each send their own key, and both settle", async () => {
		const seen = route(network, "post", "/api/budgets", ({ body }) =>
			ok({ ...HEALTH, id: (body as { id: string }).id }, 201),
		);
		const { result: first } = renderHookInApp(() => useCreateBudget());
		const { result: second } = renderHookInApp(() => useCreateBudget());
		await act(async () => {
			await Promise.all([
				first.current.mutateAsync({ body: FROM, idempotencyKey: KEY }),
				second.current.mutateAsync({
					body: { ...FROM, id: "0192f0c4-7a1e-7c3b-9d2a-5b8e1f0a8006" },
					idempotencyKey: "0192f0c4-7a1e-7c3b-9d2a-5b8e1f0a1cff",
				}),
			]);
		});
		await settled(first);
		await settled(second);
		expect(
			new Set(seen.map((each) => each.headers.get("idempotency-key"))).size,
		).toBe(2);
		expect(first.current.isSuccess && second.current.isSuccess).toBe(true);
	});
});
