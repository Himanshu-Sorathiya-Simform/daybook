import { act } from "@testing-library/react";
import { HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, test } from "vitest";

import { QUERY_ROOTS } from "@/lib/api/query-keys";
import type { BudgetEditInput } from "@/lib/budgets/schemas";
import { budgetKeys } from "../../lib/keys";
import { budgetAnswer } from "../../lib/__tests__/fixtures";
import { readBudgetNoticeError, readBudgetWriteError } from "../../lib/write-errors";
import { useEditBudget } from "../useEditBudget";
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

const FOOD = budgetAnswer("food");
const PATH = `/api/budgets/${FOOD.id}`;
const KEY = "0192f0c4-7a1e-7c3b-9d2a-5b8e1f0a1cfe";

// F04 section 5, "A retroactive change", flow 7.2.
const FROM: BudgetEditInput = {
	from: "2026-09",
	limitMinor: 700000,
	currency: "INR",
};
// Flow 7.3.
const ONE_MONTH: BudgetEditInput = {
	month: "2026-10",
	limitMinor: 800000,
	currency: "INR",
	scope: "month",
};
// Flow 7.4.
const STOP: BudgetEditInput = { from: "2026-11", limitMinor: null };
// BR-F04-24: stop for one month only.
const SKIP: BudgetEditInput = { month: "2026-10", limitMinor: null, scope: "month" };
// BR-F04-33: Undo after a change.
const RESTORE: BudgetEditInput = {
	schedule: [...FOOD.schedule],
	overrides: [],
	currency: "INR",
};

const CHANGED = budgetAnswer("food", {
	schedule: [{ from: "2026-09", limitMinor: 700000 }],
	version: 3,
});

async function edit(
	result: { current: ReturnType<typeof useEditBudget> },
	body: BudgetEditInput = FROM,
	version = 2,
) {
	await act(async () => {
		await result.current
			.mutateAsync({ id: FOOD.id, version, body, idempotencyKey: KEY })
			.catch(() => undefined);
	});
	await settled(result);
}

describe("useEditBudget (F04 section 11, D-561)", () => {
	test.each([
		["from a month onward", FROM],
		["one month only", ONE_MONTH],
		["a stop from a month", STOP],
		["a stop for one month only", SKIP],
		["a restoring body", RESTORE],
	])("patches %s at its version, with the press's key", async (_name, body) => {
		const seen = route(network, "patch", PATH, () => ok(CHANGED));
		const { result } = renderHookInApp(() => useEditBudget());
		await edit(result, body);
		expect(seen).toHaveLength(1);
		expect(seen[0]?.body).toEqual(body);
		expect(seen[0]?.headers.get("if-match")).toBe('"2"');
		expect(seen[0]?.headers.get("idempotency-key")).toBe(KEY);
		expect(result.current.data).toEqual(CHANGED);
	});

	test("sends the version it was given", async () => {
		const seen = route(network, "patch", PATH, () => ok(CHANGED));
		const { result } = renderHookInApp(() => useEditBudget());
		await edit(result, FROM, 7);
		expect(seen[0]?.headers.get("if-match")).toBe('"7"');
	});

	test("a confirmed change refreshes the Budgets reads, and leaves the profile alone", async () => {
		route(network, "patch", PATH, () => ok(CHANGED));
		const queryClient = testClient();
		const september = watched(queryClient, budgetKeys.month("2026-09"), {
			seeded: 1,
		});
		const history = watched(
			queryClient,
			budgetKeys.history("food", "2026-10", 6),
			{
				seeded: 1,
			},
		);
		const profile = watched(queryClient, [QUERY_ROOTS.profile], { seeded: 1 });
		const { result } = renderHookInApp(() => useEditBudget(), { queryClient });
		await edit(result);
		expect(september.fetches()).toBe(1);
		expect(history.fetches()).toBe(1);
		expect(profile.fetches()).toBe(0);
		for (const each of [september, history, profile]) each.stop();
	});

	test("a change that changes nothing still refreshes, and keeps the version the server answers (BR-F04-36)", async () => {
		route(network, "patch", PATH, () => ok(FOOD));
		const queryClient = testClient();
		const month = watched(queryClient, budgetKeys.month("2026-11"), {
			seeded: 1,
		});
		const { result } = renderHookInApp(() => useEditBudget(), { queryClient });
		await edit(result, { from: "2026-11", limitMinor: 500000, currency: "INR" });
		expect(result.current.data?.version).toBe(2);
		expect(month.fetches()).toBe(1);
		month.stop();
	});

	// BR-F04-23, AC-F04-09
	test("a stale version is the error, carrying the Budget as it is now", async () => {
		const current = budgetAnswer("food", { version: 3 });
		route(network, "patch", PATH, () =>
			refuse(409, "version_conflict", { details: { current } }),
		);
		const { result } = renderHookInApp(() => useEditBudget());
		await edit(result);
		expect(readBudgetWriteError(result.current.error)).toEqual({
			kind: "conflict",
			current,
		});
	});

	// AC-F04-25
	test("from Undo, a stale version opens the conflict view too", async () => {
		const current = budgetAnswer("food", { version: 4 });
		route(network, "patch", PATH, () =>
			refuse(409, "version_conflict", { details: { current } }),
		);
		const { result } = renderHookInApp(() => useEditBudget());
		await edit(result, RESTORE, 3);
		expect(readBudgetNoticeError(result.current.error)).toEqual({
			kind: "conflict",
			current,
		});
	});

	test("a 404 says the Budget was deleted on another device", async () => {
		route(network, "patch", PATH, () => refuse(404, "not_found"));
		const { result } = renderHookInApp(() => useEditBudget());
		await edit(result);
		expect(readBudgetWriteError(result.current.error)).toEqual({
			kind: "gone",
			message: "This Budget was deleted on another device.",
		});
	});

	// BR-F04-21, AC-F04-04
	test("a stop that would remove every month is the error, under the month", async () => {
		const text = "This would remove every month. Delete the Budget instead.";
		route(network, "patch", PATH, () =>
			refuse(422, "validation_failed", { fields: { from: text } }),
		);
		const { result } = renderHookInApp(() => useEditBudget());
		await edit(result, { from: "2026-09", limitMinor: null });
		expect(readBudgetWriteError(result.current.error)).toEqual({
			kind: "fields",
			fields: { month: text },
			message: null,
		});
	});

	test("a refused change refreshes nothing", async () => {
		route(network, "patch", PATH, () =>
			refuse(409, "version_conflict", { details: { current: CHANGED } }),
		);
		const queryClient = testClient();
		const month = watched(queryClient, budgetKeys.month("2026-10"), {
			seeded: 1,
		});
		const { result } = renderHookInApp(() => useEditBudget(), { queryClient });
		await edit(result);
		expect(month.fetches()).toBe(0);
		month.stop();
	});

	test("a failure is never retried by itself", async () => {
		const seen = route(network, "patch", PATH, () => refuse(500, "internal"));
		const { result } = renderHookInApp(() => useEditBudget());
		await edit(result);
		expect(seen).toHaveLength(1);
	});

	// D-241
	test("offline before M5 it is tried at once and fails, never left waiting", async () => {
		const online = offline();
		try {
			route(network, "patch", PATH, () => HttpResponse.error());
			const { result } = renderHookInApp(() => useEditBudget());
			await edit(result);
			expect(result.current.isPaused).toBe(false);
			expect(readBudgetNoticeError(result.current.error)).toEqual({
				kind: "failed",
				message:
					"The Budget could not be saved. Check your connection and try again.",
			});
		} finally {
			online();
		}
	});
});
