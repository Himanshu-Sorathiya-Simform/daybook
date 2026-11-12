import { waitFor } from "@testing-library/react";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, test } from "vitest";

import { usePayeeHistory } from "../usePayeeHistory";
import { ok, renderHookInApp, route } from "./helpers";

const network = setupServer();
beforeAll(() => network.listen({ onUnhandledFrame: "error" }));
afterEach(() => network.resetHandlers());
afterAll(() => network.close());

/** Swiggy over 3 months (F03 section 5). */
const SWIGGY = {
	count: 4,
	inMinor: 0,
	outMinor: 329000,
	usualDay: 3,
	currency: "INR",
};

describe("usePayeeHistory (BR-F03-62, BR-F03-72)", () => {
	test("asks for the payee's last 3 months", async () => {
		const seen = route(network, "get", "/api/payees/history", () => ok(SWIGGY));
		const { result } = renderHookInApp(() => usePayeeHistory("Swiggy"));
		await waitFor(() => expect(result.current.isSuccess).toBe(true));
		expect(seen.map((request) => request.path)).toEqual([
			"/api/payees/history?payee=Swiggy&months=3",
		]);
		expect(result.current.data).toEqual(SWIGGY);
	});

	test("another span can be asked for", async () => {
		const seen = route(network, "get", "/api/payees/history", () => ok(SWIGGY));
		const { result } = renderHookInApp(() => usePayeeHistory("Swiggy", 12));
		await waitFor(() => expect(result.current.isSuccess).toBe(true));
		expect(seen[0]?.path).toBe("/api/payees/history?payee=Swiggy&months=12");
	});

	// AC-F03-43: payee=swiggy answers as payee=Swiggy
	test("two spellings of one payee share one request", async () => {
		const seen = route(network, "get", "/api/payees/history", () => ok(SWIGGY));
		const { result } = renderHookInApp(() => ({
			a: usePayeeHistory("Swiggy"),
			b: usePayeeHistory("swiggy"),
		}));
		await waitFor(() => expect(result.current.b.isSuccess).toBe(true));
		expect(seen).toHaveLength(1);
	});

	test("the payee is trimmed as the server trims it", async () => {
		const seen = route(network, "get", "/api/payees/history", () => ok(SWIGGY));
		const { result } = renderHookInApp(() => usePayeeHistory("  Swiggy "));
		await waitFor(() => expect(result.current.isSuccess).toBe(true));
		expect(seen[0]?.path).toBe("/api/payees/history?payee=Swiggy&months=3");
	});

	test.each([
		["no payee", null],
		["an empty payee", ""],
		["spaces", "   "],
		["a control character", "Swi\u0007ggy"],
		["81 characters", "a".repeat(81)],
	])(
		"%s asks for nothing, since the server would refuse it",
		async (_name, payee) => {
			const seen = route(network, "get", "/api/payees/history", () =>
				ok(SWIGGY),
			);
			const { result } = renderHookInApp(() => usePayeeHistory(payee));
			await new Promise((resolve) => setTimeout(resolve, 30));
			expect(seen).toEqual([]);
			expect(result.current.fetchStatus).toBe("idle");
		},
	);

	test("a payee with / ? # % travels whole (section 13)", async () => {
		const seen = route(network, "get", "/api/payees/history", () => ok(SWIGGY));
		const { result } = renderHookInApp(() => usePayeeHistory("A/B? #1 100%"));
		await waitFor(() => expect(result.current.isSuccess).toBe(true));
		expect(new URL(seen[0]!.path, "http://x").searchParams.get("payee")).toBe(
			"A/B? #1 100%",
		);
	});
});
