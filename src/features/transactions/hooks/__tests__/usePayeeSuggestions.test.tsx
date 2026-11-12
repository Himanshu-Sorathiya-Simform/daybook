import { onlineManager } from "@tanstack/react-query";
import { act, waitFor } from "@testing-library/react";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, test, vi } from "vitest";

import {
	GOLDEN_CATEGORIES,
	GOLDEN_PAYEES,
	named,
} from "../../lib/__tests__/fixtures";
import type { PayeeItem } from "../../lib/suggestions";
import { SEARCH_DELAY_MS, usePayeeSuggestions } from "../usePayeeSuggestions";
import { ok, renderHookInApp, route } from "./helpers";

const network = setupServer();
beforeAll(() => network.listen({ onUnhandledFrame: "error" }));
afterEach(() => {
	network.resetHandlers();
	vi.restoreAllMocks();
	// TanStack's online manager is one per module and heard the offline event; a test that went
	// offline must not leave the next one's queries paused.
	onlineManager.setOnline(true);
});
afterAll(() => network.close());

/** The device's list, and the server's search answering `results` for any text. */
function payees(list: PayeeItem[] = GOLDEN_PAYEES, results: PayeeItem[] = []) {
	return route(network, "get", "/api/payees", ({ path }) =>
		path.includes("?q=") ?
			ok({ items: results })
		:	ok({ items: list, categories: GOLDEN_CATEGORIES }),
	);
}

const searches = (seen: { path: string }[]) =>
	seen
		.filter((request) => request.path.includes("?q="))
		.map((request) => request.path);

const names = (items: { payee: string }[]) => items.map((item) => item.payee);

/** Longer than the search delay, so a search that would fire has. */
const settle = () =>
	new Promise((resolve) => setTimeout(resolve, SEARCH_DELAY_MS + 100));

function renderSuggestions(text: string) {
	return renderHookInApp(
		({ value }: { value: string }) => usePayeeSuggestions(value),
		{
			initialProps: { value: text },
		},
	);
}

describe("usePayeeSuggestions while empty (BR-F03-45)", () => {
	test("the search waits 300 ms (as FIL-4)", () => {
		expect(SEARCH_DELAY_MS).toBe(300);
	});

	// AC-F03-20: "Recent and frequent" with 5 payees
	test("shows the first 5 of the device's list, and searches nothing", async () => {
		const seen = payees();
		const { result } = renderSuggestions("");
		await waitFor(() => expect(result.current.items).toHaveLength(5));
		expect(result.current.mode).toBe("recent");
		expect(names(result.current.items)).toEqual([
			"Swiggy",
			"Sunrise Apartments",
			"BigBasket",
			"Croma",
			"Netflix",
		]);
		expect(result.current.exact).toBe(false);
		await settle();
		expect(searches(seen)).toEqual([]);
	});

	test.each([
		["spaces", "   "],
		["a zero-width space", "​"],
	])("%s count as empty", async (_name, text) => {
		payees();
		const { result } = renderSuggestions(text);
		await waitFor(() => expect(result.current.items).toHaveLength(5));
		expect(result.current.mode).toBe("recent");
	});

	test("a short list shows all it has", async () => {
		payees([named("Only")]);
		const { result } = renderSuggestions("");
		await waitFor(() => expect(result.current.items).toHaveLength(1));
	});

	test("before the list arrives there is nothing to show", () => {
		payees();
		const { result } = renderSuggestions("");
		expect(result.current).toEqual({ mode: "recent", items: [], exact: false });
	});
});

describe("usePayeeSuggestions while typing (BR-F03-45, BR-F03-61)", () => {
	test("the device's matches show at once, under 'Matches'", async () => {
		payees();
		const { result } = renderSuggestions("swi");
		await waitFor(() => expect(names(result.current.items)).toEqual(["Swiggy"]));
		expect(result.current.mode).toBe("matches");
	});

	test("fewer than 8 on the device ask the server 300 ms after typing stops", async () => {
		const seen = payees(GOLDEN_PAYEES, [
			named("Swiggy"),
			named("Swiggy Instamart"),
		]);
		const { result } = renderSuggestions("swi");
		await waitFor(() => expect(result.current.items).toHaveLength(1));
		expect(searches(seen)).toEqual([]);
		await waitFor(() =>
			expect(names(result.current.items)).toEqual([
				"Swiggy",
				"Swiggy Instamart",
			]),
		);
		expect(searches(seen)).toEqual(["/api/payees?q=swi"]);
	});

	test("typing on within 300 ms asks only for the last text", async () => {
		const seen = payees();
		const { rerender } = renderSuggestions("s");
		rerender({ value: "sw" });
		rerender({ value: "swi" });
		await settle();
		expect(searches(seen)).toEqual(["/api/payees?q=swi"]);
	});

	test("the server is asked with the text trimmed and in NFC", async () => {
		const seen = payees();
		renderSuggestions("  Café ");
		await settle();
		expect(searches(seen)).toEqual([
			`/api/payees?q=${encodeURIComponent("Café")}`,
		]);
	});

	test("8 on the device never ask the server", async () => {
		const shops = Array.from({ length: 9 }, (_, i) => named(`Shop ${i}`));
		const seen = payees(shops);
		const { result } = renderSuggestions("shop");
		await waitFor(() => expect(result.current.items).toHaveLength(8));
		await settle();
		expect(searches(seen)).toEqual([]);
	});

	test("7 on the device ask the server for the 8th", async () => {
		const shops = Array.from({ length: 7 }, (_, i) => named(`Shop ${i}`));
		const seen = payees(shops, [named("Shop Far")]);
		const { result } = renderSuggestions("shop");
		await waitFor(() => expect(result.current.items).toHaveLength(8));
		expect(searches(seen)).toEqual(["/api/payees?q=shop"]);
		expect(result.current.items.at(-1)?.payee).toBe("Shop Far");
	});

	test("the server's payees already listed are not listed twice", async () => {
		payees(GOLDEN_PAYEES, [named("SWIGGY"), named("Swiggy Genie")]);
		const { result } = renderSuggestions("swi");
		await waitFor(() => expect(result.current.items).toHaveLength(2));
		expect(names(result.current.items)).toEqual(["Swiggy", "Swiggy Genie"]);
	});

	test("an answer for older text never joins newer text", async () => {
		payees(GOLDEN_PAYEES, [named("Swiggy"), named("Swiggy Instamart")]);
		const { result, rerender } = renderSuggestions("swi");
		await waitFor(() => expect(result.current.items).toHaveLength(2));
		rerender({ value: "zo" });
		expect(names(result.current.items)).toEqual(["Zomato"]);
	});

	test("the same text again reuses the cached answer", async () => {
		const seen = payees(GOLDEN_PAYEES, [named("Swiggy Instamart")]);
		const { result, rerender } = renderSuggestions("swi");
		await waitFor(() => expect(result.current.items).toHaveLength(2));
		rerender({ value: "swig" });
		await settle();
		rerender({ value: "swi" });
		await settle();
		expect(searches(seen)).toEqual(["/api/payees?q=swi", "/api/payees?q=swig"]);
		expect(result.current.items).toHaveLength(2);
	});

	test("nothing on the device still asks the server", async () => {
		payees([], [named("Blue Tokai")]);
		const { result } = renderSuggestions("blue");
		await waitFor(() =>
			expect(names(result.current.items)).toEqual(["Blue Tokai"]),
		);
	});

	test("a refused search leaves the device's matches", async () => {
		route(network, "get", "/api/payees", ({ path }) =>
			path.includes("?q=") ?
				new Response(null, { status: 500 })
			:	ok({ items: GOLDEN_PAYEES, categories: GOLDEN_CATEGORIES }),
		);
		const { result } = renderSuggestions("swi");
		await settle();
		expect(names(result.current.items)).toEqual(["Swiggy"]);
	});
});

describe("usePayeeSuggestions offline (section 10)", () => {
	test("shows the device's matches only, and never asks the server", async () => {
		const seen = payees(GOLDEN_PAYEES, [named("Swiggy Instamart")]);
		vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
		const { result } = renderSuggestions("swi");
		await waitFor(() => expect(names(result.current.items)).toEqual(["Swiggy"]));
		await settle();
		expect(searches(seen)).toEqual([]);
		expect(names(result.current.items)).toEqual(["Swiggy"]);
	});

	test("an answer cached while online is not shown once offline", async () => {
		payees(GOLDEN_PAYEES, [named("Swiggy Instamart")]);
		const { result } = renderSuggestions("swi");
		await waitFor(() => expect(result.current.items).toHaveLength(2));
		vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
		act(() => {
			window.dispatchEvent(new Event("offline"));
		});
		expect(names(result.current.items)).toEqual(["Swiggy"]);
	});
});

describe("usePayeeSuggestions with text no payee can hold", () => {
	test.each([
		["a control character", "Swi\u0007"],
		["81 characters", "a".repeat(81)],
		["a lone surrogate", "Swi\ud800"],
	])("%s matches nothing and is never sent", async (_name, text) => {
		const seen = payees();
		const { result } = renderSuggestions(text);
		await settle();
		expect(result.current).toEqual({ mode: "matches", items: [], exact: false });
		expect(searches(seen)).toEqual([]);
	});
});

describe("exact (BR-F03-45)", () => {
	test("typing a listed payee in any case is exact, so no 'new payee' option", async () => {
		payees();
		const { result } = renderSuggestions("SWIGGY");
		await waitFor(() => expect(result.current.items).toHaveLength(1));
		expect(result.current.exact).toBe(true);
	});

	test("part of a payee is not exact", async () => {
		payees();
		const { result } = renderSuggestions("Swigg");
		await waitFor(() => expect(result.current.items).toHaveLength(1));
		expect(result.current.exact).toBe(false);
	});

	test("a payee only the server knows can be exact", async () => {
		payees([], [named("Blue Tokai")]);
		const { result } = renderSuggestions("blue tokai");
		await waitFor(() => expect(result.current.items).toHaveLength(1));
		expect(result.current.exact).toBe(true);
	});
});
