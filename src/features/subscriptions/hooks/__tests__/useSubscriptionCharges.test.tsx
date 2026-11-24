import { waitFor } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import { subscriptionKeys } from "../../lib/keys";
import { charge, listPage, subscriptionItem } from "../../lib/__tests__/fixtures";
import { useSubscriptionCharges } from "../useSubscriptionCharges";
import { ok, refuse, renderHookInApp, route, testNetwork } from "./helpers";

const network = testNetwork();

const NETFLIX = subscriptionItem("netflix").id;

describe("useSubscriptionCharges (BR-F05-40, BR-F05-48)", () => {
	// AC-F05-13: Netflix's #5 and #16.
	test("reads the Subscription's linked charges and caches them under its id", async () => {
		const rows = [
			charge({ occurredOn: "2026-10-05", dueOn: "2026-10-05" }),
			charge({ occurredOn: "2026-09-05", dueOn: "2026-09-05" }),
		];
		const seen = route(network, "get", "/api/transactions", () =>
			ok(listPage(rows)),
		);
		const { result, queryClient } = renderHookInApp(() =>
			useSubscriptionCharges(NETFLIX),
		);
		await waitFor(() => expect(result.current.isSuccess).toBe(true));
		expect(result.current.data).toEqual(rows);
		expect(seen[0]?.path).toBe(
			`/api/transactions?sub=${NETFLIX}&group=none&limit=100`,
		);
		expect(queryClient.getQueryData(subscriptionKeys.charges(NETFLIX))).toEqual(
			rows,
		);
	});

	test("with no id it reads nothing and is idle", async () => {
		const seen = route(network, "get", "/api/transactions", () =>
			ok(listPage([])),
		);
		const { result } = renderHookInApp(() => useSubscriptionCharges(null));
		// An enabled query is fetching as soon as it mounts, so idle now is idle for good.
		expect(seen).toHaveLength(0);
		expect(result.current.fetchStatus).toBe("idle");
		expect(result.current.data).toBeUndefined();
	});

	test("reads once the id arrives", async () => {
		const seen = route(network, "get", "/api/transactions", () =>
			ok(listPage([charge()])),
		);
		const { result, rerender } = renderHookInApp(
			(id: string | null) => useSubscriptionCharges(id),
			{
				initialProps: null as string | null,
			},
		);
		expect(result.current.fetchStatus).toBe("idle");
		expect(seen).toHaveLength(0);
		rerender(NETFLIX);
		await waitFor(() => expect(result.current.isSuccess).toBe(true));
		expect(seen).toHaveLength(1);
	});

	// AC-F05-33: 101 charges are all read.
	test("walks every page, so 101 charges are whole", async () => {
		const first = Array.from({ length: 100 }, () => charge());
		const seen = route(network, "get", "/api/transactions", (_request, index) =>
			ok(index === 0 ? listPage(first, "more") : listPage([charge()])),
		);
		const { result } = renderHookInApp(() => useSubscriptionCharges(NETFLIX));
		await waitFor(() => expect(result.current.isSuccess).toBe(true));
		expect(result.current.data).toHaveLength(101);
		expect(seen).toHaveLength(2);
	});

	test("selecting another Subscription reads its own charges", async () => {
		const seen = route(network, "get", "/api/transactions", () =>
			ok(listPage([])),
		);
		const other = subscriptionItem("sunrise").id;
		const { result, rerender } = renderHookInApp(
			(id: string | null) => useSubscriptionCharges(id),
			{ initialProps: NETFLIX as string | null },
		);
		await waitFor(() => expect(result.current.isSuccess).toBe(true));
		rerender(other);
		await waitFor(() => expect(seen).toHaveLength(2));
		expect(seen[1]?.path).toContain(`sub=${other}`);
	});

	test("a 500 is an error with no data", async () => {
		route(network, "get", "/api/transactions", () => refuse(500, "internal"));
		const { result } = renderHookInApp(() => useSubscriptionCharges(NETFLIX));
		await waitFor(() => expect(result.current.isError).toBe(true));
		expect(result.current.data).toBeUndefined();
	});
});
