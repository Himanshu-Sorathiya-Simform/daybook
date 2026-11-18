import { act } from "@testing-library/react";
import { HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, test } from "vitest";

import { QUERY_ROOTS } from "@/lib/api/query-keys";
import { budgetKeys } from "../../lib/keys";
import { budgetAnswer } from "../../lib/__tests__/fixtures";
import { readBudgetNoticeError } from "../../lib/write-errors";
import { useRemoveMonthLimit } from "../useRemoveMonthLimit";
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

const FOOD = budgetAnswer("food", {
	overrides: [{ month: "2026-10", limitMinor: 800000 }],
	version: 3,
});
const PATH = `/api/budgets/${FOOD.id}/overrides/2026-10`;
const KEY = "0192f0c4-7a1e-7c3b-9d2a-5b8e1f0a1cfe";
const REMOVED = budgetAnswer("food", { version: 4 });

async function removeLimit(
	result: { current: ReturnType<typeof useRemoveMonthLimit> },
	version = 3,
) {
	await act(async () => {
		await result.current
			.mutateAsync({
				id: FOOD.id,
				month: "2026-10",
				version,
				idempotencyKey: KEY,
			})
			.catch(() => undefined);
	});
	await settled(result);
}

describe("useRemoveMonthLimit (BR-F04-25, flow 7.3)", () => {
	// AC-F04-17
	test("deletes the month's one-month limit at the Budget's version", async () => {
		const seen = route(network, "delete", PATH, () => ok(REMOVED));
		const { result } = renderHookInApp(() => useRemoveMonthLimit());
		await removeLimit(result);
		expect(seen).toHaveLength(1);
		expect(seen[0]?.path).toBe(PATH);
		expect(seen[0]?.body).toEqual({});
		expect(seen[0]?.headers.get("if-match")).toBe('"3"');
		expect(seen[0]?.headers.get("idempotency-key")).toBe(KEY);
		expect(result.current.data).toEqual(REMOVED);
	});

	test("a confirmed removal refreshes the Budgets reads, and leaves the profile alone", async () => {
		route(network, "delete", PATH, () => ok(REMOVED));
		const queryClient = testClient();
		const month = watched(queryClient, budgetKeys.month("2026-10"), {
			seeded: 1,
		});
		const profile = watched(queryClient, [QUERY_ROOTS.profile], { seeded: 1 });
		const { result } = renderHookInApp(() => useRemoveMonthLimit(), {
			queryClient,
		});
		await removeLimit(result);
		expect(month.fetches()).toBe(1);
		expect(profile.fetches()).toBe(0);
		month.stop();
		profile.stop();
	});

	// AC-F04-17
	test("a 404 (the Budget or its one-month limit is gone) shows in the notice", async () => {
		route(network, "delete", PATH, () => refuse(404, "not_found"));
		const { result } = renderHookInApp(() => useRemoveMonthLimit());
		await removeLimit(result);
		expect(readBudgetNoticeError(result.current.error)).toEqual({
			kind: "gone",
			message: "This Budget was deleted on another device.",
		});
	});

	// AC-F04-17
	test("a stale version opens the conflict view", async () => {
		const current = budgetAnswer("food", { version: 5 });
		route(network, "delete", PATH, () =>
			refuse(409, "version_conflict", { details: { current } }),
		);
		const { result } = renderHookInApp(() => useRemoveMonthLimit());
		await removeLimit(result);
		expect(readBudgetNoticeError(result.current.error)).toEqual({
			kind: "conflict",
			current,
		});
	});

	test("a refused removal refreshes nothing, and is never retried by itself", async () => {
		const seen = route(network, "delete", PATH, () => refuse(500, "internal"));
		const queryClient = testClient();
		const month = watched(queryClient, budgetKeys.month("2026-10"), {
			seeded: 1,
		});
		const { result } = renderHookInApp(() => useRemoveMonthLimit(), {
			queryClient,
		});
		await removeLimit(result);
		expect(seen).toHaveLength(1);
		expect(month.fetches()).toBe(0);
		month.stop();
	});

	// D-241
	test("offline before M5 it is tried at once and fails with the notice's message", async () => {
		const online = offline();
		try {
			route(network, "delete", PATH, () => HttpResponse.error());
			const { result } = renderHookInApp(() => useRemoveMonthLimit());
			await removeLimit(result);
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
