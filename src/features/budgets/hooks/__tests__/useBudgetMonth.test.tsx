import { waitFor } from "@testing-library/react";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, test } from "vitest";

import { budgetKeys } from "../../lib/keys";
import { monthAnswer } from "../../lib/__tests__/fixtures";
import { useBudgetMonth } from "../useBudgetMonth";
import { ok, refuse, renderHookInApp, route, testClient } from "./helpers";

const network = setupServer();
beforeAll(() => network.listen({ onUnhandledFrame: "error" }));
afterEach(() => network.resetHandlers());
afterAll(() => network.close());

describe("useBudgetMonth (F04 section 11)", () => {
	test("reads the month's view", async () => {
		const october = monthAnswer("2026-10");
		const seen = route(network, "get", "/api/budgets", () => ok(october));
		const { result } = renderHookInApp(() => useBudgetMonth("2026-10"));
		await waitFor(() => expect(result.current.isSuccess).toBe(true));
		expect(result.current.data).toEqual(october);
		expect(seen.map((each) => each.path)).toEqual([
			"/api/budgets?month=2026-10",
		]);
	});

	test("golden October arrives with its figures intact (F04 section 5)", async () => {
		route(network, "get", "/api/budgets", () => ok(monthAnswer("2026-10")));
		const { result } = renderHookInApp(() => useBudgetMonth("2026-10"));
		await waitFor(() => expect(result.current.isSuccess).toBe(true));
		expect(result.current.data?.overall).toEqual({
			limitMinor: 1100000,
			spentMinor: 1316800,
			utilizationTenths: 1197,
			state: "over",
		});
		expect(result.current.data?.unbudgetedMinor).toBe(1800000);
	});

	test("a new month asks again, and going back reuses the first answer", async () => {
		const seen = route(network, "get", "/api/budgets", ({ path }) =>
			ok(monthAnswer(path.endsWith("2026-09") ? "2026-09" : "2026-10")),
		);
		const { result, rerender } = renderHookInApp(
			({ month }: { month: string }) => useBudgetMonth(month),
			{ initialProps: { month: "2026-10" } },
		);
		await waitFor(() => expect(result.current.data?.month).toBe("2026-10"));
		rerender({ month: "2026-09" });
		await waitFor(() => expect(result.current.data?.month).toBe("2026-09"));
		rerender({ month: "2026-10" });
		await waitFor(() => expect(result.current.data?.month).toBe("2026-10"));
		expect(seen.map((each) => each.path)).toEqual([
			"/api/budgets?month=2026-10",
			"/api/budgets?month=2026-09",
		]);
	});

	test("an answer the server prefetched is used without asking again (STATE-5)", async () => {
		const seen = route(network, "get", "/api/budgets", () =>
			ok(monthAnswer("2026-10")),
		);
		const queryClient = testClient();
		queryClient.setQueryData(
			budgetKeys.month("2026-10"),
			monthAnswer("2026-10"),
		);
		const { result } = renderHookInApp(() => useBudgetMonth("2026-10"), {
			queryClient,
		});
		expect(result.current.data?.month).toBe("2026-10");
		// A stale query is fetching as soon as it mounts, so idle now means it was never going to.
		expect(result.current.fetchStatus).toBe("idle");
		expect(seen).toHaveLength(0);
	});

	test("a refusal is the error, and the page keeps no data", async () => {
		route(network, "get", "/api/budgets", () => refuse(400, "bad_request"));
		const { result } = renderHookInApp(() => useBudgetMonth("2030-01"));
		await waitFor(() => expect(result.current.isError).toBe(true));
		expect(result.current.data).toBeUndefined();
	});
});
