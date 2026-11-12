import { act, waitFor } from "@testing-library/react";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, test } from "vitest";

import type { ListParams, TransactionFilter } from "@/lib/transactions/url";
import { idOf, page, row } from "../../lib/__tests__/fixtures";
import { useTransactionList } from "../useTransactionList";
import { ok, refuse, renderHookInApp, route } from "./helpers";

const network = setupServer();
beforeAll(() => network.listen({ onUnhandledFrame: "error" }));
afterEach(() => network.resetHandlers());
afterAll(() => network.close());

const BY_DAY: ListParams = { sort: "date", dir: "desc", group: "day" };
const BY_CATEGORY: ListParams = { sort: "date", dir: "desc", group: "category" };

type Props = { filter: TransactionFilter; list: ListParams };

function renderList(props: Props) {
	return renderHookInApp(
		({ filter, list }: Props) =>
			useTransactionList({ filter, list, currency: "INR" }),
		{ initialProps: props },
	);
}

/** The cursor in a request's path, or null for the first page. */
const cursorOf = (path: string) =>
	new URL(path, "http://daybook.test").searchParams.get("cursor");

/** Pages 1 to `count`: page n holds row n, points down to n + 1 and up to n − 1. */
function pagedList() {
	return route(network, "get", "/api/transactions", ({ path }) => {
		const cursor = cursorOf(path);
		const n = cursor === null ? 1 : Number(cursor.slice(1));
		return ok(
			page({
				items: [row({ id: idOf(n) })],
				nextCursor: `p${n + 1}`,
				prevCursor: n === 1 ? null : `p${n - 1}`,
			}),
		);
	});
}

const idsOf = (pages: { items: { id: string }[] }[] | undefined) =>
	pages?.flatMap((each) => each.items.map((item) => item.id));

type ListResult = { current: ReturnType<typeof useTransactionList> };

/** Loads `times` more pages, one at a time, each shown before the next is asked for, as a
 * user scrolling down would. */
async function scrollDown(result: ListResult, times: number) {
	for (let i = 0; i < times; i += 1) {
		const before = result.current.data?.pageParams.at(-1);
		await act(() => result.current.fetchNextPage());
		await waitFor(() =>
			expect(result.current.data?.pageParams.at(-1)).not.toBe(before),
		);
	}
}

describe("useTransactionList (BR-F03-30)", () => {
	test("loads the first page for the filter", async () => {
		const seen = route(network, "get", "/api/transactions", () =>
			ok(page({ items: [row()] })),
		);
		const { result } = renderList({ filter: { cat: ["food"] }, list: BY_DAY });
		await waitFor(() => expect(result.current.isSuccess).toBe(true));
		expect(seen.map((request) => request.path)).toEqual([
			"/api/transactions?cat=food",
		]);
		expect(result.current.data?.pages[0]?.items).toEqual([row()]);
	});

	test("sends list parameters other than the defaults", async () => {
		const seen = route(network, "get", "/api/transactions", () => ok(page()));
		const { result } = renderList({
			filter: {},
			list: { sort: "amount", dir: "asc", group: "payee" },
		});
		await waitFor(() => expect(result.current.isSuccess).toBe(true));
		expect(seen[0]?.path).toBe(
			"/api/transactions?sort=amount&dir=asc&group=payee",
		);
	});

	test("the next page asks with the next cursor and adds its rows", async () => {
		const seen = pagedList();
		const { result } = renderList({ filter: {}, list: BY_DAY });
		await waitFor(() => expect(result.current.isSuccess).toBe(true));
		expect(result.current.hasNextPage).toBe(true);
		await scrollDown(result, 1);
		expect(cursorOf(seen[1]!.path)).toBe("p2");
		expect(idsOf(result.current.data?.pages)).toEqual([idOf(1), idOf(2)]);
	});

	test("a last page ends the list", async () => {
		route(network, "get", "/api/transactions", () =>
			ok(page({ items: [row()], nextCursor: null })),
		);
		const { result } = renderList({ filter: {}, list: BY_DAY });
		await waitFor(() => expect(result.current.isSuccess).toBe(true));
		expect(result.current.hasNextPage).toBe(false);
		expect(result.current.hasPreviousPage).toBe(false);
	});

	// AC-F03-22, at the hook: at most 5 pages kept
	test("keeps at most 5 pages, trimming from the top", async () => {
		pagedList();
		const { result } = renderList({ filter: {}, list: BY_DAY });
		await waitFor(() => expect(result.current.isSuccess).toBe(true));
		await scrollDown(result, 5);
		expect(result.current.data?.pages).toHaveLength(5);
		expect(idsOf(result.current.data?.pages)).toEqual([2, 3, 4, 5, 6].map(idOf));
		expect(result.current.hasPreviousPage).toBe(true);
	});

	// edge case: scrolling far down, then back up
	test("a page trimmed from the top reloads through the previous cursor", async () => {
		const seen = pagedList();
		const { result } = renderList({ filter: {}, list: BY_DAY });
		await waitFor(() => expect(result.current.isSuccess).toBe(true));
		await scrollDown(result, 5);
		await act(() => result.current.fetchPreviousPage());
		expect(cursorOf(seen.at(-1)!.path)).toBe("p1");
		await waitFor(() =>
			expect(idsOf(result.current.data?.pages)).toEqual(
				[1, 2, 3, 4, 5].map(idOf),
			),
		);
		expect(result.current.hasPreviousPage).toBe(false);
	});

	test("equivalent filters share one request and one cache entry", async () => {
		const seen = route(network, "get", "/api/transactions", () => ok(page()));
		const { result, queryClient } = renderList({ filter: {}, list: BY_DAY });
		await waitFor(() => expect(result.current.isSuccess).toBe(true));
		const second = renderList({ filter: {}, list: BY_DAY });
		second.unmount();
		expect(seen).toHaveLength(1);
		expect(queryClient.getQueryCache().getAll()).toHaveLength(1);
	});

	test("a new filter asks for its own first page", async () => {
		const seen = route(network, "get", "/api/transactions", () => ok(page()));
		const { result, rerender } = renderList({ filter: {}, list: BY_DAY });
		await waitFor(() => expect(result.current.isSuccess).toBe(true));
		rerender({ filter: { cat: ["food"] }, list: BY_DAY });
		await waitFor(() => expect(seen).toHaveLength(2));
		expect(seen[1]?.path).toBe("/api/transactions?cat=food");
	});

	test("a refusal is the query's error", async () => {
		route(network, "get", "/api/transactions", () =>
			refuse(400, "bad_request", { details: { params: ["cursor"] } }),
		);
		const { result } = renderList({ filter: {}, list: BY_DAY });
		await waitFor(() => expect(result.current.isError).toBe(true));
		expect(result.current.error).toMatchObject({
			status: 400,
			code: "bad_request",
		});
	});
});

describe("useTransactionList when groups reorder (BR-F03-57, AC-F03-37)", () => {
	test("a page under a new order reloads the list from the first page", async () => {
		const seen = route(
			network,
			"get",
			"/api/transactions",
			({ path }, index) => {
				if (index === 0) {
					return ok(
						page({
							items: [row({ id: idOf(13) })],
							nextCursor: "c1",
							order: "aaaa",
						}),
					);
				}
				if (cursorOf(path) === "c1") {
					// The order moved: no items, no cursors and the new order.
					return ok(page({ order: "bbbb" }));
				}
				return ok(
					page({
						items: [row({ id: idOf(25) })],
						nextCursor: "c9",
						order: "bbbb",
					}),
				);
			},
		);
		const { result } = renderList({ filter: {}, list: BY_CATEGORY });
		await waitFor(() => expect(result.current.isSuccess).toBe(true));
		await act(() => result.current.fetchNextPage());
		await waitFor(() => expect(seen).toHaveLength(3));
		await waitFor(() =>
			expect(result.current.data?.pages.map((each) => each.order)).toEqual([
				"bbbb",
			]),
		);
		expect(seen.map((request) => cursorOf(request.path))).toEqual([
			null,
			"c1",
			null,
		]);
		expect(idsOf(result.current.data?.pages)).toEqual([idOf(25)]);
	});

	test("after the reload, paging goes on from the new first page", async () => {
		const seen = route(
			network,
			"get",
			"/api/transactions",
			({ path }, index) => {
				if (index === 0)
					return ok(page({ nextCursor: "c1", order: "aaaa" }));
				if (cursorOf(path) === "c1") return ok(page({ order: "bbbb" }));
				if (cursorOf(path) === "c2") {
					return ok(
						page({ items: [row({ id: idOf(2) })], order: "bbbb" }),
					);
				}
				return ok(page({ nextCursor: "c2", order: "bbbb" }));
			},
		);
		const { result } = renderList({ filter: {}, list: BY_CATEGORY });
		await waitFor(() => expect(result.current.isSuccess).toBe(true));
		await act(() => result.current.fetchNextPage());
		await waitFor(() =>
			expect(result.current.data?.pages[0]?.order).toBe("bbbb"),
		);
		await act(() => result.current.fetchNextPage());
		expect(cursorOf(seen.at(-1)!.path)).toBe("c2");
		await waitFor(() => expect(result.current.data?.pages).toHaveLength(2));
		expect(idsOf(result.current.data?.pages)).toEqual([idOf(2)]);
	});

	test("pages under one order never reload", async () => {
		const seen = route(network, "get", "/api/transactions", ({ path }) =>
			ok(
				page({
					nextCursor: cursorOf(path) === null ? "c1" : null,
					order: "aaaa",
				}),
			),
		);
		const { result } = renderList({ filter: {}, list: BY_CATEGORY });
		await waitFor(() => expect(result.current.isSuccess).toBe(true));
		await act(() => result.current.fetchNextPage());
		await new Promise((resolve) => setTimeout(resolve, 30));
		expect(seen).toHaveLength(2);
		expect(result.current.data?.pages).toHaveLength(2);
	});

	test("day grouping has no order, so its pages never reload", async () => {
		const seen = pagedList();
		const { result } = renderList({ filter: {}, list: BY_DAY });
		await waitFor(() => expect(result.current.isSuccess).toBe(true));
		await scrollDown(result, 2);
		await new Promise((resolve) => setTimeout(resolve, 30));
		expect(seen).toHaveLength(3);
	});
});
