import { waitFor } from "@testing-library/react";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, test } from "vitest";

import { subscriptionKeys } from "../../lib/keys";
import { subscriptionItem } from "../../lib/__tests__/fixtures";
import { useSubscriptions } from "../useSubscriptions";
import { ok, refuse, renderHookInApp, route, testClient } from "./helpers";

const network = setupServer();
beforeAll(() => network.listen({ onUnhandledFrame: "error" }));
afterEach(() => network.resetHandlers());
afterAll(() => network.close());

// AC-F05-02: golden at 2 November.
const LIST = {
	items: [subscriptionItem("netflix"), subscriptionItem("cultGym")],
	totals: { monthlyMinor: 2027392, yearlyMinor: 24328700, count: 4 },
	upcoming: [
		{
			subscriptionId: subscriptionItem("netflix").id,
			dueOn: "2026-11-05",
			amountMinor: 64900,
		},
	],
	upcomingTotalMinor: 2014900,
	thisMonth: { chargedMinor: 1800000, toComeMinor: 214900 },
	currency: "INR",
};

describe("useSubscriptions (F05 section 11)", () => {
	test("reads the list and caches it under the Subscriptions root", async () => {
		const seen = route(network, "get", "/api/subscriptions", () => ok(LIST));
		const { result, queryClient } = renderHookInApp(() => useSubscriptions());
		await waitFor(() => expect(result.current.isSuccess).toBe(true));
		expect(result.current.data).toEqual(LIST);
		expect(seen).toHaveLength(1);
		expect(seen[0]?.path).toBe("/api/subscriptions");
		expect(queryClient.getQueryData(subscriptionKeys.list())).toEqual(LIST);
	});

	test("a read sends no idempotency key or version", async () => {
		const seen = route(network, "get", "/api/subscriptions", () => ok(LIST));
		const { result } = renderHookInApp(() => useSubscriptions());
		await waitFor(() => expect(result.current.isSuccess).toBe(true));
		expect(seen[0]?.headers.get("idempotency-key")).toBeNull();
		expect(seen[0]?.headers.get("if-match")).toBeNull();
	});

	test("two components share one request", async () => {
		const seen = route(network, "get", "/api/subscriptions", () => ok(LIST));
		const queryClient = testClient();
		const first = renderHookInApp(() => useSubscriptions(), { queryClient });
		const second = renderHookInApp(() => useSubscriptions(), { queryClient });
		await waitFor(() => expect(first.result.current.isSuccess).toBe(true));
		await waitFor(() => expect(second.result.current.isSuccess).toBe(true));
		expect(seen).toHaveLength(1);
	});

	test("an empty list is a success with no items", async () => {
		const empty = {
			...LIST,
			items: [],
			upcoming: [],
			totals: { monthlyMinor: 0, yearlyMinor: 0, count: 0 },
		};
		route(network, "get", "/api/subscriptions", () => ok(empty));
		const { result } = renderHookInApp(() => useSubscriptions());
		await waitFor(() => expect(result.current.isSuccess).toBe(true));
		expect(result.current.data?.items).toEqual([]);
	});

	test("a 500 is an error, never an empty list", async () => {
		route(network, "get", "/api/subscriptions", () => refuse(500, "internal"));
		const { result } = renderHookInApp(() => useSubscriptions());
		await waitFor(() => expect(result.current.isError).toBe(true));
		expect(result.current.data).toBeUndefined();
	});

	test("a 403 profile_required is an error for the app to answer", async () => {
		route(network, "get", "/api/subscriptions", () =>
			refuse(403, "profile_required"),
		);
		const { result } = renderHookInApp(() => useSubscriptions());
		await waitFor(() => expect(result.current.isError).toBe(true));
		expect(result.current.error).toMatchObject({ code: "profile_required" });
	});
});
