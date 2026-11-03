import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import type { CurrencyCode } from "@/lib/currency";
import { useTransactionsUrl } from "../useTransactionsUrl";
import { urlHarness } from "./helpers";

afterEach(() => vi.restoreAllMocks());

const VIEW = "0192f0c4-7a1e-7c3b-9d2a-5b8e1f0a1c02";
const TXN = "0192f0c4-7a1e-7c3b-9d2a-5b8e1f0a1c24";
const DEFAULT_LIST = { sort: "date", dir: "desc", group: "day" } as const;

function renderUrl(
	search: string,
	{
		currency = "INR",
		pathname,
	}: { currency?: CurrencyCode; pathname?: string } = {},
) {
	const { calls, Url } = urlHarness(search, pathname);
	const view = renderHook(() => useTransactionsUrl(currency), { wrapper: Url });
	return { ...view, calls };
}

describe("reading the URL (BR-F03-33)", () => {
	test("no parameters is all time, newest first, by day", () => {
		const { result } = renderUrl("");
		expect(result.current.filter).toEqual({});
		expect(result.current.list).toEqual(DEFAULT_LIST);
		expect(result.current.view).toBeNull();
		expect(result.current.txn).toBeNull();
		expect(result.current.isNew).toBe(false);
		expect(result.current.notice).toBe(false);
	});

	// golden check B, flow 7.7
	test("a drill-down link reads its filter", () => {
		const { result } = renderUrl("?from=2026-10-01&to=2026-10-31&cat=food");
		expect(result.current.filter).toEqual({
			from: "2026-10-01",
			to: "2026-10-31",
			cat: ["food"],
		});
	});

	test("amounts read in the profile currency's minor units", () => {
		expect(renderUrl("?min=500.00").result.current.filter).toEqual({
			minMinor: 50000,
		});
		expect(
			renderUrl("?min=500", { currency: "JPY" }).result.current.filter,
		).toEqual({ minMinor: 500 });
		expect(
			renderUrl("?min=1.250", { currency: "KWD" }).result.current.filter,
		).toEqual({ minMinor: 1250 });
	});

	test("list parameters read with their defaults filled in", () => {
		expect(renderUrl("?sort=amount").result.current.list).toEqual({
			sort: "amount",
			dir: "desc",
			group: "none",
		});
		expect(renderUrl("?group=payee&dir=asc").result.current.list).toEqual({
			sort: "date",
			dir: "asc",
			group: "payee",
		});
	});

	test("the interface parameters read beside the filter", () => {
		const { result } = renderUrl(`?cat=food&view=${VIEW}&txn=${TXN}&new=1`);
		expect(result.current.filter).toEqual({ cat: ["food"] });
		expect(result.current.view).toBe(VIEW);
		expect(result.current.txn).toBe(TXN);
		expect(result.current.isNew).toBe(true);
	});

	test.each(["?new=true", "?new=0", "?new=", "?new=1&new=1", "?new"])(
		"%s does not open the dialog",
		(search) => {
			expect(renderUrl(search).result.current.isNew).toBe(false);
		},
	);

	test.each([
		["repeated", `?txn=${TXN}&txn=other`],
		["empty", "?txn="],
	])("a %s txn selects nothing", (_name, search) => {
		expect(renderUrl(search).result.current.txn).toBeNull();
	});

	test.each([
		["repeated", `?view=${VIEW}&view=other`],
		["empty", "?view="],
	])("a %s view selects All Transactions", (_name, search) => {
		expect(renderUrl(search).result.current.view).toBeNull();
	});

	test("txn and view are kept as written; the panel and views list check them", () => {
		const { result } = renderUrl("?txn=not-a-uuid&view=whatever");
		expect(result.current.txn).toBe("not-a-uuid");
		expect(result.current.view).toBe("whatever");
	});

	test("a valid URL that is not in normalized form is read, never rewritten", () => {
		const { result, calls } = renderUrl("?cat=food,food&dir=desc&sort=date");
		expect(result.current.filter).toEqual({ cat: ["food"] });
		expect(result.current.notice).toBe(false);
		expect(calls).toEqual([]);
	});
});

describe("invalid parameters (BR-F03-34, FIL-5)", () => {
	test("are dropped with the notice, by replacing the URL", () => {
		const { result, calls } = renderUrl("?cat=pizza");
		expect(result.current.notice).toBe(true);
		expect(calls).toEqual([{ mode: "replace", href: "/transactions" }]);
		expect(result.current.filter).toEqual({});
	});

	// AC-F03-15
	test("from after to drops both, and keeps the rest", () => {
		const { result, calls } = renderUrl(
			"?from=2026-10-31&to=2026-10-01&cat=food",
		);
		expect(calls).toEqual([{ mode: "replace", href: "/transactions?cat=food" }]);
		expect(result.current.filter).toEqual({ cat: ["food"] });
		expect(result.current.notice).toBe(true);
	});

	// AC-F03-15
	test("a short q is dropped and a short number is kept", () => {
		const short = renderUrl("?q=ab");
		expect(short.calls).toEqual([{ mode: "replace", href: "/transactions" }]);
		expect(short.result.current.notice).toBe(true);
		vi.restoreAllMocks();
		const number = renderUrl("?q=12");
		expect(number.calls).toEqual([]);
		expect(number.result.current.filter).toEqual({ q: "12" });
	});

	// AC-F03-33
	test("day grouping with the amount sort drops the group", () => {
		const { result, calls } = renderUrl("?sort=amount&group=day");
		expect(calls).toEqual([
			{ mode: "replace", href: "/transactions?sort=amount" },
		]);
		expect(result.current.list).toEqual({
			sort: "amount",
			dir: "desc",
			group: "none",
		});
	});

	test("the cleaned URL keeps view, txn and new, in normalized order", () => {
		const { calls } = renderUrl(
			`?new=1&txn=${TXN}&cat=pizza&view=${VIEW}&type=expense,expense`,
		);
		expect(calls).toEqual([
			{
				mode: "replace",
				href: `/transactions?type=expense&view=${VIEW}&txn=${TXN}&new=1`,
			},
		]);
	});

	test("the cleaned URL drops names that are not the page's", () => {
		const { calls } = renderUrl("?cat=pizza&utm_source=mail");
		expect(calls).toEqual([{ mode: "replace", href: "/transactions" }]);
	});

	test("the notice stays after the URL is clean, until dismissed", () => {
		const { result } = renderUrl("?cat=pizza");
		expect(result.current.notice).toBe(true);
		act(() => result.current.dismissNotice());
		expect(result.current.notice).toBe(false);
	});

	test("the URL is cleaned once, not on every render", () => {
		const { calls, rerender } = renderUrl("?cat=pizza");
		rerender();
		rerender();
		expect(calls).toHaveLength(1);
	});

	test("a new filter clears the notice", () => {
		const { result } = renderUrl("?cat=pizza");
		act(() => result.current.setFilter({ cat: ["food"] }));
		expect(result.current.notice).toBe(false);
	});

	test("an amount with grouping signs is invalid in a link", () => {
		const { result, calls } = renderUrl("?min=1,000.00");
		expect(result.current.notice).toBe(true);
		expect(calls).toEqual([{ mode: "replace", href: "/transactions" }]);
	});

	test("the page keeps its own path", () => {
		const { calls } = renderUrl("?cat=pizza", { pathname: "/elsewhere" });
		expect(calls).toEqual([{ mode: "replace", href: "/elsewhere" }]);
	});
});

describe("writing the URL", () => {
	test("a filter change pushes the normalized URL", () => {
		const { result, calls } = renderUrl("");
		act(() =>
			result.current.setFilter({
				from: "2026-10-01",
				to: "2026-10-31",
				cat: ["shopping", "food"],
			}),
		);
		expect(calls).toEqual([
			{
				mode: "push",
				href: "/transactions?from=2026-10-01&to=2026-10-31&cat=food,shopping",
			},
		]);
		expect(result.current.filter).toEqual({
			from: "2026-10-01",
			to: "2026-10-31",
			cat: ["food", "shopping"],
		});
	});

	test("a filter change keeps the view, the selected row and the dialog", () => {
		const { result, calls } = renderUrl(`?view=${VIEW}&txn=${TXN}&new=1`);
		act(() => result.current.setFilter({ cat: ["food"] }));
		expect(calls.at(-1)).toEqual({
			mode: "push",
			href: `/transactions?cat=food&view=${VIEW}&txn=${TXN}&new=1`,
		});
	});

	test("a filter change keeps the list parameters unless given new ones", () => {
		const { result, calls } = renderUrl("?sort=amount");
		act(() => result.current.setFilter({ cat: ["food"] }));
		expect(calls.at(-1)?.href).toBe("/transactions?cat=food&sort=amount");
		act(() => result.current.setFilter({}, DEFAULT_LIST));
		expect(calls.at(-1)?.href).toBe("/transactions");
	});

	test("Clear all is an empty filter, which writes the bare path", () => {
		const { result, calls } = renderUrl("?cat=food&q=swiggy");
		act(() => result.current.setFilter({}));
		expect(calls.at(-1)).toEqual({ mode: "push", href: "/transactions" });
	});

	test("amounts are written with the currency's decimals", () => {
		const inr = renderUrl("");
		act(() =>
			inr.result.current.setFilter({ minMinor: 50000, maxMinor: 100000 }),
		);
		expect(inr.calls.at(-1)?.href).toBe("/transactions?min=500.00&max=1000.00");
		vi.restoreAllMocks();
		const jpy = renderUrl("", { currency: "JPY" });
		act(() => jpy.result.current.setFilter({ minMinor: 500 }));
		expect(jpy.calls.at(-1)?.href).toBe("/transactions?min=500");
	});

	test("a list change pushes, keeping the filter", () => {
		const { result, calls } = renderUrl("?cat=food");
		act(() =>
			result.current.setList({
				sort: "amount",
				dir: "asc",
				group: "category",
			}),
		);
		expect(calls.at(-1)).toEqual({
			mode: "push",
			href: "/transactions?cat=food&sort=amount&dir=asc&group=category",
		});
	});

	test("names that are not the page's are dropped on a write (D-458)", () => {
		const { result, calls } = renderUrl("?cat=food&utm_source=mail");
		act(() =>
			result.current.setList({ sort: "amount", dir: "desc", group: "none" }),
		);
		expect(calls.at(-1)?.href).toBe("/transactions?cat=food&sort=amount");
	});

	test("each write starts from the URL the last one left", () => {
		const { result, calls } = renderUrl("");
		act(() => result.current.setFilter({ cat: ["food"] }));
		act(() => result.current.select(TXN));
		act(() =>
			result.current.setList({ sort: "amount", dir: "desc", group: "none" }),
		);
		expect(calls.map((call) => call.href)).toEqual([
			"/transactions?cat=food",
			`/transactions?cat=food&txn=${TXN}`,
			`/transactions?cat=food&sort=amount&txn=${TXN}`,
		]);
	});
});

describe("views in the URL (BR-F03-65)", () => {
	test("applying a view pushes its filter and list with view=<id>", () => {
		const { result, calls } = renderUrl("?q=swiggy");
		act(() =>
			result.current.applyView(
				VIEW,
				{ from: "2026-10-01", to: "2026-10-31", cat: ["food"] },
				DEFAULT_LIST,
			),
		);
		expect(calls.at(-1)).toEqual({
			mode: "push",
			href: `/transactions?from=2026-10-01&to=2026-10-31&cat=food&view=${VIEW}`,
		});
		expect(result.current.view).toBe(VIEW);
	});

	test("applying All Transactions drops view and the filter", () => {
		const { result, calls } = renderUrl(`?cat=food&view=${VIEW}`);
		act(() => result.current.applyView(null, {}, DEFAULT_LIST));
		expect(calls.at(-1)).toEqual({ mode: "push", href: "/transactions" });
		expect(result.current.view).toBeNull();
	});

	test("applying a view keeps the selected row", () => {
		const { result, calls } = renderUrl(`?txn=${TXN}`);
		act(() => result.current.applyView(VIEW, {}, DEFAULT_LIST));
		expect(calls.at(-1)?.href).toBe(`/transactions?view=${VIEW}&txn=${TXN}`);
	});

	test("applying a view clears the invalid-link notice", () => {
		const { result } = renderUrl("?cat=pizza");
		act(() => result.current.applyView(VIEW, {}, DEFAULT_LIST));
		expect(result.current.notice).toBe(false);
	});

	test("an unknown view is cleared by replacing, keeping the filter", () => {
		const { result, calls } = renderUrl(`?cat=food&view=${VIEW}`);
		act(() => result.current.clearView());
		expect(calls.at(-1)).toEqual({
			mode: "replace",
			href: "/transactions?cat=food",
		});
		expect(result.current.view).toBeNull();
	});

	test("a view id is escaped in the URL", () => {
		const { result, calls } = renderUrl("");
		act(() => result.current.applyView("a&b=c", {}, DEFAULT_LIST));
		expect(calls.at(-1)?.href).toBe("/transactions?view=a%26b%3Dc");
		expect(result.current.view).toBe("a&b=c");
	});
});

describe("the selected row and the dialog (BR-F03-53, BR-F03-73)", () => {
	test("selecting replaces the URL with txn=<id>", () => {
		const { result, calls } = renderUrl("?cat=food");
		act(() => result.current.select(TXN));
		expect(calls).toEqual([
			{ mode: "replace", href: `/transactions?cat=food&txn=${TXN}` },
		]);
		expect(result.current.txn).toBe(TXN);
	});

	test("clearing the selection removes txn by replacing", () => {
		const { result, calls } = renderUrl(`?cat=food&txn=${TXN}`);
		act(() => result.current.select(null));
		expect(calls).toEqual([{ mode: "replace", href: "/transactions?cat=food" }]);
		expect(result.current.txn).toBeNull();
	});

	test("moving the selection replaces each time, so Back skips the rows", () => {
		const { result, calls } = renderUrl("");
		act(() => result.current.select("a"));
		act(() => result.current.select("b"));
		act(() => result.current.select("c"));
		expect(calls.map((call) => call.mode)).toEqual([
			"replace",
			"replace",
			"replace",
		]);
	});

	test("new=1 opens and closes the dialog by replacing", () => {
		const { result, calls } = renderUrl("?cat=food");
		act(() => result.current.setNew(true));
		expect(calls.at(-1)).toEqual({
			mode: "replace",
			href: "/transactions?cat=food&new=1",
		});
		expect(result.current.isNew).toBe(true);
		act(() => result.current.setNew(false));
		expect(calls.at(-1)).toEqual({
			mode: "replace",
			href: "/transactions?cat=food",
		});
		expect(result.current.isNew).toBe(false);
	});

	test("a txn with characters a URL needs escaped reads back the same", () => {
		const { result } = renderUrl("");
		act(() => result.current.select("x y/z?"));
		expect(result.current.txn).toBe("x y/z?");
	});
});
