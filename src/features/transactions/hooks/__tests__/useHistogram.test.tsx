import { waitFor } from "@testing-library/react";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, test } from "vitest";

import type { TransactionFilter } from "@/lib/transactions/url";
import { useHistogram } from "../useHistogram";
import { ok, renderHookInApp, route } from "./helpers";

const network = setupServer();
beforeAll(() => network.listen({ onUnhandledFrame: "error" }));
afterEach(() => network.resetHandlers());
afterAll(() => network.close());

/** Check B's histogram (F03 section 5). */
const CHECK_B_HISTOGRAM = {
	edges: [
		31500, 40000, 50000, 63000, 80000, 100000, 125000, 160000, 200000, 250000,
		315000,
	],
	counts: [1, 0, 0, 1, 0, 0, 0, 0, 1, 1],
	currency: "INR",
};
const CHECK_B: TransactionFilter = {
	from: "2026-10-01",
	to: "2026-10-31",
	cat: ["food"],
};

type Props = { filter: TransactionFilter; enabled: boolean };

const renderHistogram = (props: Props) =>
	renderHookInApp(
		({ filter, enabled }: Props) =>
			useHistogram({ filter, currency: "INR", enabled }),
		{ initialProps: props },
	);

describe("useHistogram (BR-F03-60, BR-F03-76)", () => {
	test("asks for nothing until the Amount control opens", async () => {
		const seen = route(
			network,
			"get",
			"/api/transactions/amount-histogram",
			() => ok(CHECK_B_HISTOGRAM),
		);
		renderHistogram({ filter: CHECK_B, enabled: false });
		await new Promise((resolve) => setTimeout(resolve, 30));
		expect(seen).toEqual([]);
	});

	// AC-F03-41
	test("asks without the amount bounds", async () => {
		const seen = route(
			network,
			"get",
			"/api/transactions/amount-histogram",
			() => ok(CHECK_B_HISTOGRAM),
		);
		const { result } = renderHistogram({
			filter: { ...CHECK_B, minMinor: 100000 },
			enabled: true,
		});
		await waitFor(() => expect(result.current.isSuccess).toBe(true));
		expect(seen.map((request) => request.path)).toEqual([
			"/api/transactions/amount-histogram?from=2026-10-01&to=2026-10-31&cat=food",
		]);
		expect(result.current.data?.counts).toEqual([1, 0, 0, 1, 0, 0, 0, 0, 1, 1]);
	});

	test("moving the amount bounds never asks again", async () => {
		const seen = route(
			network,
			"get",
			"/api/transactions/amount-histogram",
			() => ok(CHECK_B_HISTOGRAM),
		);
		const { result, rerender } = renderHistogram({
			filter: CHECK_B,
			enabled: true,
		});
		await waitFor(() => expect(result.current.isSuccess).toBe(true));
		rerender({ filter: { ...CHECK_B, minMinor: 40000 }, enabled: true });
		rerender({
			filter: { ...CHECK_B, minMinor: 40000, maxMinor: 79999 },
			enabled: true,
		});
		await new Promise((resolve) => setTimeout(resolve, 30));
		expect(seen).toHaveLength(1);
		expect(result.current.data?.edges).toHaveLength(11);
	});

	test("another filter asks again", async () => {
		const seen = route(
			network,
			"get",
			"/api/transactions/amount-histogram",
			() => ok(CHECK_B_HISTOGRAM),
		);
		const { result, rerender } = renderHistogram({
			filter: CHECK_B,
			enabled: true,
		});
		await waitFor(() => expect(result.current.isSuccess).toBe(true));
		rerender({ filter: { ...CHECK_B, src: "manual" }, enabled: true });
		await waitFor(() => expect(seen).toHaveLength(2));
	});
});
