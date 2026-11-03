import { waitFor } from "@testing-library/react";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, test } from "vitest";

import type { TransactionFilter } from "@/lib/transactions/url";
import { useFacets } from "../useFacets";
import { ok, renderHookInApp, route } from "./helpers";

const network = setupServer();
beforeAll(() => network.listen({ onUnhandledFrame: "error" }));
afterEach(() => network.resetHandlers());
afterAll(() => network.close());

const COUNTS = { type: {}, category: {}, date: {}, source: {} };

type Props = { filter: TransactionFilter; enabled: boolean };

const renderFacets = (props: Props) =>
	renderHookInApp(
		({ filter, enabled }: Props) =>
			useFacets({ filter, currency: "INR", enabled }),
		{ initialProps: props },
	);

describe("useFacets (BR-F03-59, BR-F03-76)", () => {
	test("asks for nothing until a filter control opens", async () => {
		const seen = route(network, "get", "/api/transactions/facets", () =>
			ok(COUNTS),
		);
		const { result } = renderFacets({ filter: {}, enabled: false });
		await new Promise((resolve) => setTimeout(resolve, 30));
		expect(seen).toEqual([]);
		expect(result.current.fetchStatus).toBe("idle");
		expect(result.current.data).toBeUndefined();
	});

	test("asks once a control opens, with the whole filter", async () => {
		const seen = route(network, "get", "/api/transactions/facets", () =>
			ok(COUNTS),
		);
		const { result, rerender } = renderFacets({ filter: {}, enabled: false });
		rerender({ filter: { cat: ["food"], minMinor: 100 }, enabled: true });
		await waitFor(() => expect(result.current.isSuccess).toBe(true));
		expect(seen.map((request) => request.path)).toEqual([
			"/api/transactions/facets?cat=food&min=1.00",
		]);
	});

	test("then follows the filter", async () => {
		const seen = route(network, "get", "/api/transactions/facets", () =>
			ok(COUNTS),
		);
		const { result, rerender } = renderFacets({ filter: {}, enabled: true });
		await waitFor(() => expect(result.current.isSuccess).toBe(true));
		rerender({ filter: { type: ["income"] }, enabled: true });
		await waitFor(() => expect(seen).toHaveLength(2));
		expect(seen[1]?.path).toBe("/api/transactions/facets?type=income");
	});
});
