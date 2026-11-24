import { waitFor } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import { subscriptionKeys } from "../../lib/keys";
import { useSubscriptionMonths } from "../useSubscriptionMonths";
import { ok, refuse, renderHookInApp, route, testNetwork } from "./helpers";

const network = testNetwork();

// AC-F05-24: section 5's figures for October to December.
const MONTHS = {
	months: [
		{ month: "2026-10", chargedMinor: 2014800, expectedMinor: 0 },
		{ month: "2026-11", chargedMinor: 1800000, expectedMinor: 214900 },
		{ month: "2026-12", chargedMinor: 0, expectedMinor: 2014900 },
	],
	currency: "INR",
};

describe("useSubscriptionMonths (BR-F05-36)", () => {
	test("reads the span and caches it under both months", async () => {
		const seen = route(network, "get", "/api/subscriptions/months", () =>
			ok(MONTHS),
		);
		const { result, queryClient } = renderHookInApp(() =>
			useSubscriptionMonths("2026-10", "2026-12"),
		);
		await waitFor(() => expect(result.current.isSuccess).toBe(true));
		expect(result.current.data).toEqual(MONTHS);
		expect(seen[0]?.path).toBe(
			"/api/subscriptions/months?from=2026-10&to=2026-12",
		);
		expect(
			queryClient.getQueryData(subscriptionKeys.months("2026-10", "2026-12")),
		).toEqual(MONTHS);
	});

	test("moving the span reads the new one and keeps the old", async () => {
		const seen = route(network, "get", "/api/subscriptions/months", () =>
			ok(MONTHS),
		);
		const { result, rerender, queryClient } = renderHookInApp(
			({ from, to }) => useSubscriptionMonths(from, to),
			{ initialProps: { from: "2026-10", to: "2026-12" } },
		);
		await waitFor(() => expect(result.current.isSuccess).toBe(true));
		rerender({ from: "2027-01", to: "2027-03" });
		await waitFor(() => expect(seen).toHaveLength(2));
		expect(seen[1]?.path).toBe(
			"/api/subscriptions/months?from=2027-01&to=2027-03",
		);
		expect(
			queryClient.getQueryData(subscriptionKeys.months("2026-10", "2026-12")),
		).toEqual(MONTHS);
	});

	// AC-F05-24: a span over 24 months returns 400.
	test("a 400 for a span over 24 months is an error", async () => {
		route(network, "get", "/api/subscriptions/months", () =>
			refuse(400, "bad_request", {
				message: "Ask for at most 24 months at a time.",
			}),
		);
		const { result } = renderHookInApp(() =>
			useSubscriptionMonths("2024-01", "2026-12"),
		);
		await waitFor(() => expect(result.current.isError).toBe(true));
		expect(result.current.error).toMatchObject({ status: 400 });
	});
});
