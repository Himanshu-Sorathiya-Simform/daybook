import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, test } from "vitest";

import { createQueryClient } from "@/lib/api/query-client";
import type { ListParams } from "@/lib/transactions/url";
import { payeeKeys, transactionKeys, viewKeys } from "../keys";
import {
	facetsOptions,
	histogramOptions,
	HISTORY_MONTHS,
	MAX_PAGES,
	orderChanged,
	payeeHistoryOptions,
	payeeSearchOptions,
	payeesOptions,
	PAYEES_STALE_MS,
	transactionListOptions,
	transactionOptions,
	transactionSummaryOptions,
	viewsOptions,
} from "../queries";
import { GOLDEN_CATEGORIES, GOLDEN_PAYEES, page, row } from "./fixtures";

const network = setupServer();
beforeAll(() => network.listen({ onUnhandledFrame: "error" }));
afterEach(() => network.resetHandlers());
afterAll(() => network.close());

const DEFAULT_LIST: ListParams = { sort: "date", dir: "desc", group: "day" };
const CHECK_B = { from: "2026-10-01", to: "2026-10-31", cat: ["food" as const] };

/** Answers `body` for `path`, and records each request's path and query. */
function answer(path: string, body: unknown) {
	const seen: string[] = [];
	network.use(
		http.get(new URL(path, window.location.origin).toString(), ({ request }) => {
			const url = new URL(request.url);
			seen.push(`${url.pathname}${url.search}`);
			return HttpResponse.json({ data: body });
		}),
	);
	return seen;
}

function client() {
	const queryClient = createQueryClient();
	queryClient.setDefaultOptions({ queries: { retry: false } });
	return queryClient;
}

describe("the constants", () => {
	test("at most 5 pages in memory (BR-F03-30)", () => {
		expect(MAX_PAGES).toBe(5);
	});

	test("payees stay fresh for 5 minutes, and the panel's history covers 3 months", () => {
		expect(PAYEES_STALE_MS).toBe(300_000);
		expect(HISTORY_MONTHS).toBe(3);
	});
});

describe("transactionListOptions", () => {
	const options = transactionListOptions({
		filter: CHECK_B,
		list: DEFAULT_LIST,
		currency: "INR",
	});

	test("is keyed by the filter and list, keeps 5 pages and starts with no cursor", () => {
		expect(options.queryKey).toEqual(
			transactionKeys.list(CHECK_B, DEFAULT_LIST),
		);
		expect(options.maxPages).toBe(5);
		expect(options.initialPageParam).toBeNull();
	});

	test("the first page asks with no cursor", async () => {
		const seen = answer("/api/transactions", page({ items: [row()] }));
		const data = await client().fetchInfiniteQuery(options);
		expect(seen).toEqual([
			"/api/transactions?from=2026-10-01&to=2026-10-31&cat=food",
		]);
		expect(data.pages[0]?.items).toEqual([row()]);
	});

	test("the next page asks with the last page's next cursor", () => {
		expect(
			options.getNextPageParam(
				page({ nextCursor: "next-1" }),
				[page({ nextCursor: "next-1" })],
				null,
				[null],
			),
		).toBe("next-1");
	});

	test("a last page has no next page (BR-F03-30)", () => {
		expect(options.getNextPageParam(page(), [page()], null, [null])).toBeNull();
	});

	test("the previous page asks with the first page's previous cursor", () => {
		expect(
			options.getPreviousPageParam?.(
				page({ prevCursor: "prev-1" }),
				[page({ prevCursor: "prev-1" })],
				"c",
				["c"],
			),
		).toBe("prev-1");
	});

	test("the first page has no previous page", () => {
		expect(
			options.getPreviousPageParam?.(page(), [page()], null, [null]),
		).toBeNull();
	});

	test("a page asked with a cursor sends it after the filter", async () => {
		const seen = answer("/api/transactions", page({ nextCursor: "abc" }));
		await client().fetchInfiniteQuery({ ...options, pages: 2 });
		expect(seen).toEqual([
			"/api/transactions?from=2026-10-01&to=2026-10-31&cat=food",
			"/api/transactions?from=2026-10-01&to=2026-10-31&cat=food&cursor=abc",
		]);
	});

	test("a refused page is the query's error", async () => {
		network.use(
			http.get(
				new URL("/api/transactions", window.location.origin).toString(),
				() =>
					HttpResponse.json(
						{
							error: {
								code: "bad_request",
								message: "m",
								details: { params: ["cursor"] },
							},
						},
						{ status: 400 },
					),
			),
		);
		await expect(client().fetchInfiniteQuery(options)).rejects.toMatchObject({
			status: 400,
			code: "bad_request",
		});
	});
});

describe("orderChanged (BR-F03-57)", () => {
	test("no pages, or one, never disagree", () => {
		expect(orderChanged([])).toBe(false);
		expect(orderChanged([page({ order: "a" })])).toBe(false);
	});

	test("day and no grouping have no order, so never disagree", () => {
		expect(orderChanged([page(), page(), page()])).toBe(false);
	});

	test("pages under one order agree", () => {
		expect(
			orderChanged([page({ order: "9c1f" }), page({ order: "9c1f" })]),
		).toBe(false);
	});

	test("a later page under a new order disagrees", () => {
		expect(
			orderChanged([
				page({ order: "9c1f" }),
				page({ order: "9c1f" }),
				page({ order: "e3b0" }),
			]),
		).toBe(true);
	});

	test("a page loaded upward under a new order disagrees too", () => {
		expect(
			orderChanged([page({ order: "e3b0" }), page({ order: "9c1f" })]),
		).toBe(true);
	});

	test("an order next to none disagrees", () => {
		expect(orderChanged([page({ order: "9c1f" }), page({ order: null })])).toBe(
			true,
		);
	});
});

describe("transactionSummaryOptions", () => {
	test("asks for the filter's summary with the breakdowns", async () => {
		const seen = answer("/api/transactions/summary", {
			count: 4,
			incomeMinor: 0,
			spendingMinor: 622000,
			toGoalsMinor: 0,
			firstOn: "2026-10-04",
			lastOn: "2026-10-31",
			currency: "INR",
		});
		const options = transactionSummaryOptions({
			filter: CHECK_B,
			by: ["category", "payee"],
			currency: "INR",
		});
		expect(options.queryKey).toEqual(
			transactionKeys.summary(CHECK_B, ["category", "payee"]),
		);
		const data = await client().fetchQuery(options);
		expect(seen).toEqual([
			"/api/transactions/summary?from=2026-10-01&to=2026-10-31&cat=food&by=category,payee",
		]);
		expect(data.spendingMinor).toBe(622000);
	});
});

describe("facetsOptions and histogramOptions", () => {
	test("the counts ask with the whole filter", async () => {
		const seen = answer("/api/transactions/facets", {
			type: {},
			category: {},
			date: {},
			source: {},
		});
		await client().fetchQuery(
			facetsOptions({
				filter: { ...CHECK_B, minMinor: 50000 },
				currency: "INR",
			}),
		);
		expect(seen).toEqual([
			"/api/transactions/facets?from=2026-10-01&to=2026-10-31&cat=food&min=500.00",
		]);
	});

	test("the histogram asks without the amount bounds, under one key for any bounds", async () => {
		const seen = answer("/api/transactions/amount-histogram", {
			edges: [31500, 40000],
			counts: [1],
			currency: "INR",
		});
		const options = histogramOptions({
			filter: { ...CHECK_B, minMinor: 100000 },
			currency: "INR",
		});
		expect(options.queryKey).toEqual(transactionKeys.histogram(CHECK_B));
		await client().fetchQuery(options);
		expect(seen).toEqual([
			"/api/transactions/amount-histogram?from=2026-10-01&to=2026-10-31&cat=food",
		]);
	});
});

describe("transactionOptions", () => {
	test("asks for one row", async () => {
		const seen = answer(`/api/transactions/${row().id}`, row());
		const data = await client().fetchQuery(transactionOptions(row().id));
		expect(seen).toEqual([`/api/transactions/${row().id}`]);
		expect(data).toEqual(row());
	});

	// BR-F03-53
	test("a 404 is the query's error", async () => {
		network.use(
			http.get(
				new URL(
					`/api/transactions/${row().id}`,
					window.location.origin,
				).toString(),
				() =>
					HttpResponse.json(
						{ error: { code: "not_found", message: "m" } },
						{ status: 404 },
					),
			),
		);
		await expect(
			client().fetchQuery(transactionOptions(row().id)),
		).rejects.toMatchObject({ status: 404 });
	});
});

describe("the payee reads", () => {
	test("the list is fresh for 5 minutes, keyed apart from searches", async () => {
		const seen = answer("/api/payees", {
			items: GOLDEN_PAYEES,
			categories: GOLDEN_CATEGORIES,
		});
		const options = payeesOptions();
		expect(options.queryKey).toEqual(payeeKeys.list());
		expect(options.staleTime).toBe(300_000);
		const data = await client().fetchQuery(options);
		expect(seen).toEqual(["/api/payees"]);
		expect(data.items).toHaveLength(13);
	});

	test("a search sends its text", async () => {
		const seen = answer("/api/payees", { items: [] });
		await client().fetchQuery(payeeSearchOptions("Sunrise Apa"));
		expect(seen).toEqual(["/api/payees?q=Sunrise%20Apa"]);
	});

	test("a history asks for its payee and months, 3 unless given", async () => {
		const seen = answer("/api/payees/history", {
			count: 4,
			inMinor: 0,
			outMinor: 329000,
			usualDay: 3,
			currency: "INR",
		});
		const queryClient = client();
		const data = await queryClient.fetchQuery(payeeHistoryOptions("Swiggy"));
		await queryClient.fetchQuery(payeeHistoryOptions("Swiggy", 1));
		expect(seen).toEqual([
			"/api/payees/history?payee=Swiggy&months=3",
			"/api/payees/history?payee=Swiggy&months=1",
		]);
		expect(data.usualDay).toBe(3);
	});
});

describe("viewsOptions", () => {
	test("asks for the saved views", async () => {
		const seen = answer("/api/transaction-views", {
			items: [],
			currency: "INR",
		});
		const options = viewsOptions();
		expect(options.queryKey).toEqual(viewKeys.list());
		await client().fetchQuery(options);
		expect(seen).toEqual(["/api/transaction-views"]);
	});
});
