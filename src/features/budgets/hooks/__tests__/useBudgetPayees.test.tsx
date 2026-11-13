import { waitFor } from "@testing-library/react";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, test } from "vitest";

import { budgetKeys } from "../../lib/keys";
import { payeeSummary } from "../../lib/__tests__/fixtures";
import { useBudgetPayees } from "../useBudgetPayees";
import { ok, renderHookInApp, route, testClient } from "./helpers";

const network = setupServer();
beforeAll(() => network.listen({ onUnhandledFrame: "error" }));
afterEach(() => network.resetHandlers());
afterAll(() => network.close());

const wait = () => new Promise((resolve) => setTimeout(resolve, 20));

describe("useBudgetPayees (BR-F04-30)", () => {
	test("reads F03's summary of the category's month by payee", async () => {
		const seen = route(network, "get", "/api/transactions/summary", () =>
			ok(payeeSummary()),
		);
		const { result } = renderHookInApp(() =>
			useBudgetPayees("food", "2026-10", "INR"),
		);
		await waitFor(() => expect(result.current.isSuccess).toBe(true));
		expect(seen.map((each) => each.path)).toEqual([
			"/api/transactions/summary?from=2026-10-01&to=2026-10-31&cat=food&by=payee",
		]);
	});

	// F04 section 5, "The October page"
	test("gives the top 3 payees, largest first, and the count for See 4 Transactions", async () => {
		route(network, "get", "/api/transactions/summary", () => ok(payeeSummary()));
		const { result } = renderHookInApp(() =>
			useBudgetPayees("food", "2026-10", "INR"),
		);
		await waitFor(() => expect(result.current.isSuccess).toBe(true));
		expect(
			result.current.data?.payees.map(({ label, outMinor }) => [
				label,
				outMinor,
			]),
		).toEqual([
			["BigBasket", 290000],
			["Zomato", 230000],
			["Swiggy", 102000],
		]);
		expect(result.current.data?.count).toBe(4);
	});

	test("fewer than 3 payees are all shown", async () => {
		const one = payeeSummary({
			count: 1,
			byPayee: [
				{ key: "netflix", label: "Netflix", count: 1, outMinor: 64900 },
			],
		});
		route(network, "get", "/api/transactions/summary", () => ok(one));
		const { result } = renderHookInApp(() =>
			useBudgetPayees("entertainment", "2026-09", "INR"),
		);
		await waitFor(() => expect(result.current.isSuccess).toBe(true));
		expect(result.current.data?.payees).toHaveLength(1);
		expect(result.current.data?.count).toBe(1);
	});

	test("a month with no spending gives no payees", async () => {
		const none = payeeSummary({ count: 0, spendingMinor: 0, byPayee: [] });
		route(network, "get", "/api/transactions/summary", () => ok(none));
		const { result } = renderHookInApp(() =>
			useBudgetPayees("health", "2026-10", "INR"),
		);
		await waitFor(() => expect(result.current.isSuccess).toBe(true));
		expect(result.current.data).toEqual({ payees: [], count: 0 });
	});

	test("an answer without a payee breakdown gives no payees", async () => {
		const bare = payeeSummary();
		delete bare.byPayee;
		route(network, "get", "/api/transactions/summary", () => ok(bare));
		const { result } = renderHookInApp(() =>
			useBudgetPayees("food", "2026-10", "INR"),
		);
		await waitFor(() => expect(result.current.isSuccess).toBe(true));
		expect(result.current.data?.payees).toEqual([]);
	});

	test("with no category selected it asks for nothing, and shows no other category's payees", async () => {
		const seen = route(network, "get", "/api/transactions/summary", () =>
			ok(payeeSummary()),
		);
		const queryClient = testClient();
		queryClient.setQueryData(
			budgetKeys.payees("food", "2026-10"),
			payeeSummary(),
		);
		const { result } = renderHookInApp(
			() => useBudgetPayees(null, "2026-10", "INR"),
			{
				queryClient,
			},
		);
		await wait();
		expect(seen).toHaveLength(0);
		expect(result.current.data).toBeUndefined();
	});
});
