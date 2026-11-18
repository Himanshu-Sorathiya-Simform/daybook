import { act } from "@testing-library/react";
import { HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, test } from "vitest";

import { QUERY_ROOTS } from "@/lib/api/query-keys";
import { budgetKeys } from "../../lib/keys";
import { budgetAnswer } from "../../lib/__tests__/fixtures";
import { readBudgetDeleteError } from "../../lib/write-errors";
import { useDeleteBudget } from "../useDeleteBudget";
import {
	offline,
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
const DONE = () => new HttpResponse(null, { status: 204 });

async function remove(
	result: { current: ReturnType<typeof useDeleteBudget> },
	version = 2,
) {
	await act(async () => {
		await result.current
			.mutateAsync({ id: FOOD.id, version, idempotencyKey: KEY })
			.catch(() => undefined);
	});
	await settled(result);
}

describe("useDeleteBudget (BR-F04-06)", () => {
	test("deletes at its version with the press's key and an empty body", async () => {
		const seen = route(network, "delete", PATH, DONE);
		const { result } = renderHookInApp(() => useDeleteBudget());
		await remove(result);
		expect(seen).toHaveLength(1);
		expect(seen[0]?.body).toEqual({});
		expect(seen[0]?.headers.get("if-match")).toBe('"2"');
		expect(seen[0]?.headers.get("idempotency-key")).toBe(KEY);
		expect(result.current.isSuccess).toBe(true);
	});

	// AC-F04-25: Undo after a create deletes at version 1.
	test("sends the version it was given", async () => {
		const seen = route(network, "delete", PATH, DONE);
		const { result } = renderHookInApp(() => useDeleteBudget());
		await remove(result, 1);
		expect(seen[0]?.headers.get("if-match")).toBe('"1"');
	});

	test("a confirmed delete refreshes the Budgets reads and the profile (BR-F02-14)", async () => {
		route(network, "delete", PATH, DONE);
		const queryClient = testClient();
		const month = watched(queryClient, budgetKeys.month("2026-10"), {
			seeded: 1,
		});
		const year = watched(queryClient, budgetKeys.year(2026), { seeded: 1 });
		const profile = watched(queryClient, [QUERY_ROOTS.profile], { seeded: 1 });
		const { result } = renderHookInApp(() => useDeleteBudget(), { queryClient });
		await remove(result);
		expect(month.fetches()).toBe(1);
		expect(year.fetches()).toBe(1);
		expect(profile.fetches()).toBe(1);
		for (const each of [month, year, profile]) each.stop();
	});

	test("a 404 counts as done, and still refreshes, since the Budget is gone either way (D-239)", async () => {
		route(network, "delete", PATH, () => refuse(404, "not_found"));
		const queryClient = testClient();
		const month = watched(queryClient, budgetKeys.month("2026-10"), {
			seeded: 1,
		});
		const { result } = renderHookInApp(() => useDeleteBudget(), { queryClient });
		await remove(result);
		expect(result.current.isSuccess).toBe(true);
		expect(month.fetches()).toBe(1);
		month.stop();
	});

	test("a stale version is the error, carrying the Budget as it is now", async () => {
		const current = budgetAnswer("food", { version: 3 });
		route(network, "delete", PATH, () =>
			refuse(409, "version_conflict", { details: { current } }),
		);
		const { result } = renderHookInApp(() => useDeleteBudget());
		await remove(result);
		expect(readBudgetDeleteError(result.current.error)).toEqual({
			kind: "conflict",
			current,
		});
	});

	test("a refused delete refreshes nothing", async () => {
		route(network, "delete", PATH, () => refuse(500, "internal"));
		const queryClient = testClient();
		const month = watched(queryClient, budgetKeys.month("2026-10"), {
			seeded: 1,
		});
		const { result } = renderHookInApp(() => useDeleteBudget(), { queryClient });
		await remove(result);
		expect(result.current.isError).toBe(true);
		expect(month.fetches()).toBe(0);
		month.stop();
	});

	test("a failure is never retried by itself", async () => {
		const seen = route(network, "delete", PATH, () =>
			refuse(503, "unavailable"),
		);
		const { result } = renderHookInApp(() => useDeleteBudget());
		await remove(result);
		expect(seen).toHaveLength(1);
	});

	// D-241
	test("offline before M5 it is tried at once and fails with the delete message", async () => {
		const online = offline();
		try {
			route(network, "delete", PATH, () => HttpResponse.error());
			const { result } = renderHookInApp(() => useDeleteBudget());
			await remove(result);
			expect(result.current.isPaused).toBe(false);
			expect(readBudgetDeleteError(result.current.error)).toEqual({
				kind: "refused",
				message:
					"The Budget could not be deleted. Check your connection and try again.",
			});
		} finally {
			online();
		}
	});
});
