import { waitFor } from "@testing-library/react";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, test } from "vitest";

import { ok, refuse, renderHookInApp, route, testClient } from "./helpers";
import { useSubscriptionNames } from "../useSubscriptionNames";

const network = setupServer();
beforeAll(() => network.listen({ onUnhandledFrame: "error" }));
afterEach(() => network.resetHandlers());
afterAll(() => network.close());

const LIST = {
	items: [
		{ id: "a", name: "Netflix" },
		{ id: "b", name: "Cult Gym" },
	],
};

describe("useSubscriptionNames (D-541)", () => {
	test("reads the names from /api/subscriptions while enabled", async () => {
		const reads = route(network, "get", "/api/subscriptions", () => ok(LIST));
		const { result } = renderHookInApp(() => useSubscriptionNames(true));
		await waitFor(() => expect(result.current.data?.get("a")).toBe("Netflix"));
		expect(result.current.data?.get("b")).toBe("Cult Gym");
		expect(reads).toHaveLength(1);
	});

	test("asks nothing while disabled", async () => {
		const reads = route(network, "get", "/api/subscriptions", () => ok(LIST));
		const { result } = renderHookInApp(() => useSubscriptionNames(false));
		await new Promise((resolve) => setTimeout(resolve, 50));
		expect(reads).toHaveLength(0);
		expect(result.current.data).toBeUndefined();
	});

	test("a failed read leaves no names", async () => {
		route(network, "get", "/api/subscriptions", () =>
			refuse(400, "validation_failed"),
		);
		const { result } = renderHookInApp(() => useSubscriptionNames(true));
		await waitFor(() => expect(result.current.isError).toBe(true));
		expect(result.current.data).toBeUndefined();
	});

	test("an id the list does not hold has no name", async () => {
		route(network, "get", "/api/subscriptions", () => ok(LIST));
		const { result } = renderHookInApp(() => useSubscriptionNames(true));
		await waitFor(() => expect(result.current.data).toBeDefined());
		expect(result.current.data?.get("gone")).toBeUndefined();
	});

	// STATE-5: the Subscriptions page's own list answers it, with no second read.
	test("answers from the Subscriptions page's cached list without asking again", async () => {
		const reads = route(network, "get", "/api/subscriptions", () => ok(LIST));
		const queryClient = testClient();
		queryClient.setQueryData(["subscriptions", "list"], {
			...LIST,
			totals: { count: 2 },
		});
		const { result } = renderHookInApp(() => useSubscriptionNames(true), {
			queryClient,
		});
		await waitFor(() => expect(result.current.data?.get("a")).toBe("Netflix"));
		expect(reads).toHaveLength(0);
	});

	test("a disabled hook still shows names the cache holds", () => {
		const queryClient = testClient();
		queryClient.setQueryData(["subscriptions", "list"], LIST);
		const { result } = renderHookInApp(() => useSubscriptionNames(false), {
			queryClient,
		});
		expect(result.current.data?.get("b")).toBe("Cult Gym");
	});
});
