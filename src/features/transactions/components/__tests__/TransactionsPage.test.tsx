import { onlineManager } from "@tanstack/react-query";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { setupServer } from "msw/node";
import {
	afterAll,
	afterEach,
	beforeAll,
	beforeEach,
	describe,
	expect,
	test,
	vi,
} from "vitest";

import { renderInApp } from "@/components/app/__tests__/helpers";
import { AppProviders } from "@/components/app/AppProviders";
import type { Transaction } from "@/lib/transactions/model";
import { readFilterParams } from "@/lib/transactions/url";
import type { GroupTotal } from "@/server/dal/transactions/list";
import { type GoldenTransaction, goldenRow } from "../../../../../seed/golden";
import {
	ok,
	refuse,
	route,
	testClient,
	urlHarness,
} from "../../hooks/__tests__/helpers";
import { idOf, page, row } from "../../lib/__tests__/fixtures";
import type { LabelLocale } from "../../lib/labels";
import {
	transactionListOptions,
	transactionSummaryOptions,
	viewsOptions,
} from "../../lib/queries";
import { PAGE_BREAKDOWNS, type SummaryAnswer } from "../../lib/types";
import { TransactionsPage } from "../TransactionsPage";

const network = setupServer();
beforeAll(() => network.listen({ onUnhandledFrame: "error" }));
afterEach(() => {
	network.resetHandlers();
	onlineManager.setOnline(true);
	vi.useRealTimers();
	vi.restoreAllMocks();
});
afterAll(() => network.close());

// The golden profile on the golden clock's day (TST-3).
const IN: LabelLocale = {
	today: "2026-11-02",
	dateLocale: "en-IN",
	timezone: "Asia/Kolkata",
	numberLocale: "hi-IN-u-nu-latn",
	currency: "INR",
};

/** Golden row `n` as the API answers it. */
function golden(n: number): Transaction {
	const copy: Partial<GoldenTransaction> = { ...goldenRow(n) };
	delete copy.golden;
	return copy as Transaction;
}

const day = (key: string, outMinor: number, inMinor = 0, count = 1): GroupTotal => ({
	key,
	label: null,
	count,
	inMinor,
	outMinor,
	toGoalsMinor: 0,
});

const summary = (overrides: Partial<SummaryAnswer> = {}): SummaryAnswer => ({
	count: 0,
	incomeMinor: 0,
	spendingMinor: 0,
	toGoalsMinor: 0,
	firstOn: null,
	lastOn: null,
	currency: "INR",
	...overrides,
});

// Golden check B: food in October, newest first by day.
const CHECK_B_PAGE = page({
	items: [25, 24, 21, 15].map(golden),
	groups: [
		day("2026-10-31", 38000),
		day("2026-10-19", 64000),
		day("2026-10-14", 290000),
		day("2026-10-04", 230000),
	],
});
const CHECK_B_SUMMARY = summary({ count: 4, spendingMinor: 622000 });
const CHECK_B = "?from=2026-10-01&to=2026-10-31&cat=food";

/** IntersectionObserver for jsdom: records what each observer watches, and `intersect` tells
 * the observers of matching elements that they came into view, as scrolling would. */
const observers = new Set<{
	callback: IntersectionObserverCallback;
	targets: Element[];
}>();
class FakeObserver {
	private entry: { callback: IntersectionObserverCallback; targets: Element[] };
	constructor(callback: IntersectionObserverCallback) {
		this.entry = { callback, targets: [] };
		observers.add(this.entry);
	}
	observe(target: Element) {
		this.entry.targets.push(target);
	}
	unobserve() {}
	disconnect() {
		observers.delete(this.entry);
	}
	takeRecords() {
		return [];
	}
}
beforeEach(() => {
	observers.clear();
	vi.stubGlobal("IntersectionObserver", FakeObserver);
});

function intersect(match: (target: Element) => boolean) {
	act(() => {
		for (const { callback, targets } of [...observers])
			for (const target of targets.filter(match))
				callback(
					[{ isIntersecting: true, target } as IntersectionObserverEntry],
					{} as IntersectionObserver,
				);
	});
}
const scrollToEnd = () =>
	intersect((target) => target.getAttribute("data-testid") === "loadMoreSentinel");
const scrollToTop = () =>
	intersect((target) => target.textContent === "Load earlier");

/** Serves `/api/transactions` and its summary, and renders the page at `search`. */
function renderPage(
	search: string,
	{
		list = () => ok(CHECK_B_PAGE),
		totals = () => ok(CHECK_B_SUMMARY),
	}: {
		list?: Parameters<typeof route>[3];
		totals?: Parameters<typeof route>[3];
	} = {},
) {
	const lists = route(network, "get", "/api/transactions", list);
	const summaries = route(network, "get", "/api/transactions/summary", totals);
	const { calls, Url } = urlHarness(search);
	const view = renderInApp(
		<Url>
			<TransactionsPage
				locale={IN}
				weekStart="monday"
			/>
		</Url>,
	);
	return { ...view, lists, summaries, calls, user: userEvent.setup() };
}

const grid = () => screen.findByRole("grid", { name: "Transactions" });
/** The list's own polite live region, inside the list's section; the search box has one too. */
const listLive = () =>
	within(
		screen.getByRole("grid", { name: "Transactions" }).closest("section")!,
	).getByRole("status");
/** The list's rows, not the filter chips, which are rows of their own grid. */
const listRows = () =>
	within(screen.getByRole("grid", { name: "Transactions" }))
		.getAllByRole("row")
		.filter((each) => each.hasAttribute("data-key"));
const rowNames = () =>
	within(screen.getByRole("grid", { name: "Transactions" }))
		.queryAllByRole("row")
		.filter((each) => each.hasAttribute("data-key"))
		.map((each) => each.getAttribute("aria-label"));
const headers = () =>
	within(screen.getByRole("grid", { name: "Transactions" }))
		.queryAllByRole("rowheader")
		.map((each) => each.textContent);
const figure = (label: string) =>
	screen.getAllByRole("term").find((term) => term.textContent === label)
		?.nextElementSibling?.textContent;
const pathOf = (path: string) => new URL(path, "http://daybook.test");

describe("the page (F03 section 6)", () => {
	test("has the title as its only heading level 1", async () => {
		renderPage("");
		await grid();

		expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
			/^Transactions$/,
		);
	});

	test("reads its filter from the URL and asks for it, with the panel's breakdowns", async () => {
		const { lists, summaries } = renderPage(CHECK_B);
		await grid();

		expect(lists.map((each) => each.path)).toEqual([
			"/api/transactions?from=2026-10-01&to=2026-10-31&cat=food",
		]);
		expect(summaries.map((each) => each.path)).toEqual([
			"/api/transactions/summary?from=2026-10-01&to=2026-10-31&cat=food&by=category,payee",
		]);
	});

	// AC-F03-63 (the browser's half; the end-to-end test checks the HTML)
	test("asks for nothing when the server prefetched the list, the summary and the views", async () => {
		const lists = route(network, "get", "/api/transactions", () => ok(page()));
		const summaries = route(network, "get", "/api/transactions/summary", () =>
			ok(summary()),
		);
		const views = route(network, "get", "/api/transaction-views", () =>
			ok({ items: [], currency: "INR" }),
		);
		const { Url } = urlHarness(CHECK_B);
		const { filter, list } = readFilterParams(new URLSearchParams(CHECK_B), {
			currency: "INR",
		});
		const queryClient = testClient();
		queryClient.setQueryData(
			transactionListOptions({ filter, list, currency: "INR" }).queryKey,
			{ pages: [CHECK_B_PAGE], pageParams: [null] },
		);
		queryClient.setQueryData(
			transactionSummaryOptions({
				filter,
				by: PAGE_BREAKDOWNS,
				currency: "INR",
			}).queryKey,
			CHECK_B_SUMMARY,
		);
		queryClient.setQueryData(viewsOptions().queryKey, {
			items: [],
			currency: "INR",
		});
		render(
			<AppProviders
				navigate={vi.fn()}
				queryClient={queryClient}
			>
				<Url>
					<TransactionsPage
						locale={IN}
						weekStart="monday"
					/>
				</Url>
			</AppProviders>,
		);

		expect(
			await screen.findAllByRole("grid", { name: "Transactions" }),
		).toHaveLength(1);
		expect(figure("Out")).toBe("₹6,220.00");
		expect(rowNames()).toHaveLength(4);
		await new Promise((resolve) => setTimeout(resolve, 50));
		expect(lists).toEqual([]);
		expect(summaries).toEqual([]);
		expect(views).toEqual([]);
	});
});

describe("header totals (BR-F03-41)", () => {
	test("show check B: 4, ₹0.00, ₹6,220.00 and ₹0.00", async () => {
		renderPage(CHECK_B);
		await screen.findByText("₹6,220.00");

		expect(figure("Count")).toBe("4");
		expect(figure("In")).toBe("₹0.00");
		expect(figure("Out")).toBe("₹6,220.00");
		expect(figure("To Goals")).toBe("₹0.00");
	});

	test("show skeleton figures until the summary answers", async () => {
		let answer: () => void = () => {};
		const waiting = new Promise<void>((resolve) => (answer = resolve));
		const { container } = renderPage(CHECK_B, {
			totals: async () => {
				await waiting;
				return ok(CHECK_B_SUMMARY);
			},
		});
		await grid();

		expect(container.querySelector("dl")).toHaveAttribute("aria-busy", "true");
		answer();
		await screen.findByText("₹6,220.00");
		expect(container.querySelector("dl")).not.toHaveAttribute("aria-busy");
	});

	test('say "Totals could not be loaded." when the summary fails, and Retry asks again', async () => {
		let fail = true;
		const { summaries, user } = renderPage(CHECK_B, {
			totals: () => (fail ? refuse(500, "internal") : ok(CHECK_B_SUMMARY)),
		});

		expect(await screen.findByRole("alert")).toHaveTextContent(
			"Totals could not be loaded.",
		);
		expect(rowNames()).toHaveLength(4);

		fail = false;
		await user.click(screen.getByRole("button", { name: "Retry" }));

		await screen.findByText("₹6,220.00");
		expect(summaries).toHaveLength(2);
		expect(screen.queryByRole("alert")).toBeNull();
	});
});

describe("day grouping (BR-F03-31, BR-F03-56)", () => {
	test("check B: a header per day with its figures, and each row's time", async () => {
		renderPage(CHECK_B);
		await grid();

		expect(headers()).toEqual([
			"Sat, 31 Oct Out ₹380.00",
			"Mon, 19 Oct Out ₹640.00",
			"Wed, 14 Oct Out ₹2,900.00",
			"Sun, 4 Oct Out ₹2,300.00",
		]);
		expect(rowNames()).toEqual([
			"Swiggy, Food, 11:50 pm, −₹380.00",
			"Swiggy, Food, 10:15 pm, −₹640.00",
			"BigBasket, Food: Monthly groceries, 7:00 pm, −₹2,900.00",
			"Zomato, Food, 8:30 pm, −₹2,300.00",
		]);
	});

	// AC-F03-60, on the page
	test('all time: 1 Nov reads "Yesterday · Sun, 1 Nov" with Out ₹18,420.00, and the charge reads Auto', async () => {
		renderPage("", {
			list: () =>
				ok(
					page({
						items: [golden(26), golden(27), golden(25)],
						groups: [
							day("2026-11-01", 1842000, 0, 2),
							day("2026-10-31", 38000),
						],
					}),
				),
		});
		await grid();

		expect(headers()).toEqual([
			"Yesterday · Sun, 1 Nov Out ₹18,420.00",
			"Sat, 31 Oct Out ₹380.00",
		]);
		expect(rowNames().slice(0, 2)).toEqual([
			"Swiggy, Food, 12:30 am, −₹420.00",
			"Sunrise Apartments, Housing, Auto, −₹18,000.00",
		]);
	});

	test("a day's header with income and spending shows both: In ₹85,000.00 · Out ₹18,000.00", async () => {
		renderPage("?from=2026-10-01&to=2026-10-01", {
			list: () =>
				ok(
					page({
						items: [golden(13), golden(12)],
						groups: [day("2026-10-01", 1800000, 8500000, 2)],
					}),
				),
		});
		await grid();

		expect(headers()).toEqual(["Thu, 1 Oct In ₹85,000.00 · Out ₹18,000.00"]);
		expect(rowNames()).toEqual([
			"Acme Corp, Salary, 10:05 am, +₹85,000.00",
			"Sunrise Apartments, Housing, Auto, −₹18,000.00",
		]);
	});

	test("today's header reads Today", async () => {
		renderPage("", {
			list: () =>
				ok(
					page({
						items: [
							row({
								occurredOn: "2026-11-02",
								occurredAt: "2026-11-02T06:10:00.000Z",
							}),
						],
						groups: [day("2026-11-02", 64000)],
					}),
				),
		});
		await grid();

		expect(headers()).toEqual(["Today Out ₹640.00"]);
	});

	// D-532
	test("each header stays at the top while its rows scroll", async () => {
		renderPage(CHECK_B);
		await grid();

		for (const header of screen.getAllByRole("rowheader"))
			expect(header.closest("[role=row]")).toHaveClass(
				"sticky",
				"top-0",
				"bg-section",
			);
	});

	test("each day is its own row group, named by its header", async () => {
		renderPage(CHECK_B);
		await grid();

		const groups = within(
			screen.getByRole("grid", { name: "Transactions" }),
		).getAllByRole("rowgroup");
		expect(groups).toHaveLength(4);
		expect(groups[0]).toHaveAccessibleName("Sat, 31 Oct Out ₹380.00");
		expect(within(groups[0]!).getAllByRole("row")).toHaveLength(2);
	});
});

describe("other groupings (BR-F03-55, BR-F03-56)", () => {
	test("by category, check A's food reads 4 · Out ₹6,220.00, and rows show their day", async () => {
		const { lists } = renderPage(
			"?from=2026-10-01&to=2026-10-31&group=category",
			{
				list: () =>
					ok(
						page({
							items: [golden(13), golden(25), golden(24)],
							groups: [
								{ ...day("salary", 0, 8500000), count: 1 },
								{ ...day("food", 622000), count: 4 },
							],
							order: "abc",
							nextCursor: "n",
						}),
					),
			},
		);
		await grid();

		expect(pathOf(lists[0]!.path).searchParams.get("group")).toBe("category");
		expect(headers()).toEqual([
			"Salary 1 · In ₹85,000.00",
			"Food 4 · Out ₹6,220.00",
		]);
		expect(rowNames()).toEqual([
			"Acme Corp, Salary, Thu, 1 Oct · 10:05 am, +₹85,000.00",
			"Swiggy, Food, Sat, 31 Oct · 11:50 pm, −₹380.00",
			"Swiggy, Food, Mon, 19 Oct · 10:15 pm, −₹640.00",
		]);
	});

	// AC-F03-36, on the page
	test("by payee, the header reads the server's label, whatever each row's case", async () => {
		renderPage("?group=payee", {
			list: () =>
				ok(
					page({
						items: [
							row({ id: idOf(1), payee: "SWIGGY" }),
							row({ id: idOf(2), payee: "Swiggy" }),
						],
						groups: [
							{
								key: "swiggy",
								label: "SWIGGY",
								count: 5,
								inMinor: 0,
								outMinor: 371000,
								toGoalsMinor: 0,
							},
						],
						order: "abc",
					}),
				),
		});
		await grid();

		expect(headers()).toEqual(["SWIGGY 5 · Out ₹3,710.00"]);
		expect(rowNames()).toHaveLength(2);
	});

	// AC-F03-60, on the page
	test("with no grouping, there are no headers and each row shows its day; a charge its day alone", async () => {
		renderPage("?from=2026-10-01&to=2026-10-31&sort=amount", {
			list: () => ok(page({ items: [golden(16), golden(25)] })),
		});
		await grid();

		expect(screen.queryAllByRole("rowheader")).toEqual([]);
		expect(screen.queryAllByRole("rowgroup")).toEqual([]);
		expect(rowNames()).toEqual([
			"Netflix, Entertainment, Mon, 5 Oct, −₹649.00",
			"Swiggy, Food, Sat, 31 Oct · 11:50 pm, −₹380.00",
		]);
	});
});

describe("Group · Sort (BR-F03-39, D-529)", () => {
	test("reads the URL's grouping and sort", async () => {
		renderPage("?sort=amount&dir=asc&group=payee", {
			list: () => ok(page({ items: [row()], order: "abc" })),
		});
		await grid();

		expect(
			screen.getByRole("button", {
				name: "Group and sort Payee · Smallest first",
			}),
		).toBeInTheDocument();
	});

	test("Largest first pushes the URL and the list follows, with no grouping", async () => {
		const { user, calls, lists } = renderPage("");
		await grid();

		await user.click(screen.getByRole("button", { name: /^Group and sort/ }));
		await user.click(
			await screen.findByRole("radio", { name: "Largest first" }),
		);

		expect(calls).toEqual([{ mode: "push", href: "/transactions?sort=amount" }]);
		await waitFor(() => expect(lists).toHaveLength(2));
		expect(lists[1]!.path).toBe("/api/transactions?sort=amount");
	});

	test("Category keeps the filter in the URL", async () => {
		const { user, calls } = renderPage(CHECK_B);
		await grid();

		await user.click(screen.getByRole("button", { name: /^Group and sort/ }));
		await user.click(await screen.findByRole("radio", { name: "Category" }));

		expect(calls.at(-1)).toEqual({
			mode: "push",
			href: "/transactions?from=2026-10-01&to=2026-10-31&cat=food&group=category",
		});
	});

	test("a grouping or sort change asks the summary for nothing new", async () => {
		const { user, summaries } = renderPage(CHECK_B);
		await grid();
		await screen.findByText("₹6,220.00");

		await user.click(screen.getByRole("button", { name: /^Group and sort/ }));
		await user.click(await screen.findByRole("radio", { name: "Oldest first" }));
		await user.keyboard("{Escape}");
		await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
		await waitFor(() => expect(rowNames()).toHaveLength(4));

		expect(summaries).toHaveLength(1);
	});
});

describe("page states (F03 section 6)", () => {
	test("shows skeleton rows while the first page loads", async () => {
		let answer: () => void = () => {};
		const waiting = new Promise<void>((resolve) => (answer = resolve));
		renderPage(CHECK_B, {
			list: async () => {
				await waiting;
				return ok(CHECK_B_PAGE);
			},
		});

		const loading = await screen.findByRole("status", {
			name: "Loading Transactions",
		});
		expect(loading).toHaveAttribute("aria-busy", "true");
		expect(screen.queryByRole("grid", { name: "Transactions" })).toBeNull();

		answer();
		await grid();
		expect(
			screen.queryByRole("status", { name: "Loading Transactions" }),
		).toBeNull();
	});

	test('with no Transactions at all: "No Transactions yet." and the zeros', async () => {
		renderPage("", {
			list: () => ok(page()),
			totals: () => ok(summary()),
		});

		expect(await screen.findByText("No Transactions yet.")).toBeVisible();
		expect(
			screen.getByText(
				"Add your first Transaction to see your month take shape.",
			),
		).toBeVisible();
		expect(screen.queryByRole("button", { name: "Clear filters" })).toBeNull();
		await waitFor(() => expect(figure("Count")).toBe("0"));
		expect(figure("Out")).toBe("₹0.00");
	});

	test("grouping alone is not a filter: an empty list still says No Transactions yet.", async () => {
		renderPage("?group=payee&sort=amount", { list: () => ok(page()) });

		expect(await screen.findByText("No Transactions yet.")).toBeVisible();
	});

	test("a filter that matches nothing offers Clear filters, which keeps the grouping and sort", async () => {
		const { user, calls } = renderPage("?cat=travel&sort=amount&group=payee", {
			list: () => ok(page()),
		});

		expect(
			await screen.findByText("No Transactions match these filters."),
		).toBeVisible();
		await user.click(screen.getByRole("button", { name: "Clear filters" }));

		expect(calls).toEqual([
			{ mode: "push", href: "/transactions?sort=amount&group=payee" },
		]);
	});

	test("a list that fails says so, and Retry loads it", async () => {
		let fail = true;
		const { user, lists } = renderPage(CHECK_B, {
			list: () => (fail ? refuse(500, "internal") : ok(CHECK_B_PAGE)),
		});

		expect(
			await screen.findByText("Transactions could not be loaded."),
		).toBeVisible();
		expect(
			screen.getByText(
				"Check your connection, then try again. Your data is safe.",
			),
		).toBeVisible();

		fail = false;
		await user.click(screen.getByRole("button", { name: "Retry" }));

		await grid();
		expect(rowNames()).toHaveLength(4);
		expect(lists).toHaveLength(2);
	});
});

describe("the invalid-link notice (BR-F03-34, D-531)", () => {
	test("drops the invalid parameters, says so, and asks only for the valid filter", async () => {
		const { calls, lists } = renderPage(
			"?cat=food,nope&from=2026-13-01&group=day&sort=amount",
		);
		await grid();

		expect(
			screen.getByText(
				"Some filters in this link weren't valid and were removed.",
			),
		).toBeVisible();
		expect(calls).toEqual([
			{ mode: "replace", href: "/transactions?sort=amount" },
		]);
		expect(lists[0]!.path).toBe("/api/transactions?sort=amount");
	});

	test("Dismiss hides it", async () => {
		const { user } = renderPage("?cat=nope");
		await grid();

		await user.click(screen.getByRole("button", { name: "Dismiss" }));

		expect(
			screen.queryByText(
				"Some filters in this link weren't valid and were removed.",
			),
		).toBeNull();
	});

	test("is announced politely, in a framed banner above the totals", async () => {
		renderPage("?cat=nope");
		await grid();

		const notice = screen
			.getByText("Some filters in this link weren't valid and were removed.")
			.closest("[role=status]");
		expect(notice).toHaveClass("rounded-section", "border");
		expect(
			notice!.compareDocumentPosition(screen.getAllByRole("term")[0]!)
				& Node.DOCUMENT_POSITION_FOLLOWING,
		).toBeTruthy();
	});

	test("a valid link shows no notice and leaves the URL alone", async () => {
		const { calls } = renderPage(CHECK_B);
		await grid();

		expect(
			screen.queryByText(
				"Some filters in this link weren't valid and were removed.",
			),
		).toBeNull();
		expect(calls).toEqual([]);
	});
});

/** 120 rows over three pages of 50, 50 and 20, with no grouping. */
function threePages() {
	return ({ path }: { path: string }) => {
		const cursor = pathOf(path).searchParams.get("cursor");
		const n = cursor === null ? 0 : Number(cursor.slice(1));
		const size = n === 2 ? 20 : 50;
		return ok(
			page({
				items: Array.from({ length: size }, (_, i) =>
					row({
						id: idOf(n * 50 + i + 1),
						payee: `Payee ${n * 50 + i + 1}`,
					}),
				),
				nextCursor: n < 2 ? `p${n + 1}` : null,
				prevCursor: n === 0 ? null : `q${n}`,
			}),
		);
	};
}

describe("loading more (BR-F03-30, D-530)", () => {
	// AC-F03-64
	test("scrolling to the end loads the next page with no press", async () => {
		const { lists } = renderPage("?sort=amount", { list: threePages() });
		await grid();
		expect(rowNames()).toHaveLength(50);

		scrollToEnd();

		await waitFor(() => expect(rowNames()).toHaveLength(100));
		expect(pathOf(lists[1]!.path).searchParams.get("cursor")).toBe("p1");
	});

	// AC-F03-64
	test("Load more shows while there is a next page, loads it when pressed, and hides on the last", async () => {
		const { user } = renderPage("?sort=amount", { list: threePages() });
		await grid();

		await user.click(screen.getByRole("button", { name: "Load more" }));
		await waitFor(() => expect(rowNames()).toHaveLength(100));

		await user.click(screen.getByRole("button", { name: "Load more" }));
		await waitFor(() => expect(rowNames()).toHaveLength(120));

		expect(screen.queryByRole("button", { name: "Load more" })).toBeNull();
	});

	test('each load is announced: "Loaded 50 more Transactions", then the last page\'s own count', async () => {
		const { user } = renderPage("?sort=amount", { list: threePages() });
		await grid();
		const live = listLive;

		expect(live()).toHaveTextContent(/^$/);
		await user.click(screen.getByRole("button", { name: "Load more" }));
		await waitFor(() =>
			expect(live()).toHaveTextContent("Loaded 50 more Transactions"),
		);

		await user.click(screen.getByRole("button", { name: "Load more" }));
		await waitFor(() =>
			expect(live()).toHaveTextContent("Loaded 20 more Transactions"),
		);
	});

	test("a list that fits on one page shows no Load more and asks for nothing more at its end", async () => {
		const { lists } = renderPage(CHECK_B);
		await grid();

		expect(screen.queryByRole("button", { name: "Load more" })).toBeNull();
		scrollToEnd();
		await new Promise((resolve) => setTimeout(resolve, 30));
		expect(lists).toHaveLength(1);
	});

	test("asks for the next page once, however often the end comes into view while it loads", async () => {
		let answer: () => void = () => {};
		const waiting = new Promise<void>((resolve) => (answer = resolve));
		const pages = threePages();
		const { lists } = renderPage("?sort=amount", {
			list: async (request, index) => {
				if (index === 1) await waiting;
				return pages(request);
			},
		});
		await grid();

		scrollToEnd();
		await waitFor(() => expect(lists).toHaveLength(2));
		scrollToEnd();
		scrollToEnd();
		answer();
		await waitFor(() => expect(rowNames()).toHaveLength(100));

		expect(lists).toHaveLength(2);
	});

	test("Load more says it is busy while the page loads", async () => {
		let answer: () => void = () => {};
		const waiting = new Promise<void>((resolve) => (answer = resolve));
		const pages = threePages();
		const { user } = renderPage("?sort=amount", {
			list: async (request, index) => {
				if (index === 1) await waiting;
				return pages(request);
			},
		});
		await grid();

		await user.click(screen.getByRole("button", { name: "Load more" }));

		await waitFor(() =>
			expect(
				screen.getByRole("button", { name: "Load more" }),
			).toHaveAttribute("aria-disabled", "true"),
		);
		answer();
		await waitFor(() => expect(rowNames()).toHaveLength(100));
	});

	test("a page that fails to load announces nothing and Load more stays to try again", async () => {
		let fail = true;
		const pages = threePages();
		const { user } = renderPage("?sort=amount", {
			list: (request, index) =>
				index === 1 && fail ? refuse(500, "internal") : pages(request),
		});
		await grid();

		await user.click(screen.getByRole("button", { name: "Load more" }));
		await waitFor(() =>
			expect(
				screen.getByRole("button", { name: "Load more" }),
			).not.toHaveAttribute("aria-disabled"),
		);
		const live = listLive();
		expect(live).toHaveTextContent(/^$/);
		expect(rowNames()).toHaveLength(50);

		fail = false;
		await user.click(screen.getByRole("button", { name: "Load more" }));
		await waitFor(() => expect(rowNames()).toHaveLength(100));
	});
});

describe("pages trimmed from the top (BR-F03-30, D-36)", () => {
	/** Pages 0 to 6 of 2 rows each, so loading the sixth drops the first. */
	function sevenPages() {
		return ({ path }: { path: string }) => {
			const cursor = pathOf(path).searchParams.get("cursor");
			const n =
				cursor === null ? 0
				: cursor.startsWith("p") ? Number(cursor.slice(1))
				: Number(cursor.slice(1)) - 1;
			return ok(
				page({
					items: [1, 2].map((i) =>
						row({ id: idOf(n * 2 + i), payee: `Payee ${n * 2 + i}` }),
					),
					nextCursor: n < 6 ? `p${n + 1}` : null,
					prevCursor: n === 0 ? null : `q${n}`,
				}),
			);
		};
	}

	async function loadSix(user: ReturnType<typeof userEvent.setup>) {
		for (let loaded = 1; loaded < 6; loaded += 1) {
			await user.click(screen.getByRole("button", { name: "Load more" }));
			await waitFor(() =>
				expect(rowNames().at(-1)).toMatch(
					new RegExp(`^Payee ${(loaded + 1) * 2},`),
				),
			);
		}
	}

	test("keeps 5 pages: loading the sixth drops the first, and Load earlier appears above", async () => {
		const { user } = renderPage("?sort=amount", { list: sevenPages() });
		await grid();
		expect(screen.queryByRole("button", { name: "Load earlier" })).toBeNull();

		await loadSix(user);

		expect(rowNames()).toHaveLength(10);
		expect(rowNames()[0]).toMatch(/^Payee 3,/);
		expect(screen.getByRole("button", { name: "Load earlier" })).toBeVisible();
	});

	test("Load earlier reloads the trimmed page through its previous cursor", async () => {
		const { user, lists } = renderPage("?sort=amount", { list: sevenPages() });
		await grid();
		await loadSix(user);

		await user.click(screen.getByRole("button", { name: "Load earlier" }));

		await waitFor(() => expect(rowNames()[0]).toMatch(/^Payee 1,/));
		expect(pathOf(lists.at(-1)!.path).searchParams.get("cursor")).toBe("q1");
		expect(rowNames()).toHaveLength(10);
		expect(screen.queryByRole("button", { name: "Load earlier" })).toBeNull();
	});

	test("asks for the earlier page once, however often the top comes into view while it loads", async () => {
		let answer: () => void = () => {};
		const waiting = new Promise<void>((resolve) => (answer = resolve));
		const pages = sevenPages();
		const { user, lists } = renderPage("?sort=amount", {
			list: async (request) => {
				if (pathOf(request.path).searchParams.get("cursor") === "q1")
					await waiting;
				return pages(request);
			},
		});
		await grid();
		await loadSix(user);
		const before = lists.length;

		scrollToTop();
		await waitFor(() => expect(lists).toHaveLength(before + 1));
		scrollToTop();
		await user.click(screen.getByRole("button", { name: "Load earlier" }));
		answer();
		await waitFor(() => expect(rowNames()[0]).toMatch(/^Payee 1,/));

		expect(lists).toHaveLength(before + 1);
	});

	test("scrolling back to the top reloads the trimmed page with no press", async () => {
		const { user } = renderPage("?sort=amount", { list: sevenPages() });
		await grid();
		await loadSix(user);

		scrollToTop();

		await waitFor(() => expect(rowNames()[0]).toMatch(/^Payee 1,/));
	});
});

/** Takes the browser offline, as `useOnline` and TanStack Query see it. */
function goOffline() {
	vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
	act(() => {
		window.dispatchEvent(new Event("offline"));
	});
}

describe("offline (D-533)", () => {
	test('shows "as of" beside the title, the time the summary last answered', async () => {
		vi.useFakeTimers({
			toFake: ["Date"],
			now: new Date("2026-11-02T06:30:00.000Z"),
		});
		renderPage(CHECK_B);
		await screen.findByText("₹6,220.00");
		expect(screen.queryByText(/^as of/)).toBeNull();

		goOffline();

		expect(await screen.findByText("as of 12:00 pm")).toBeVisible();
	});

	test("shows no time while offline before any answer", async () => {
		renderPage(CHECK_B, { totals: () => new Promise(() => {}) });
		await grid();

		goOffline();

		expect(screen.queryByText(/^as of/)).toBeNull();
	});
});

describe("keyboard (AC-F03-24)", () => {
	test("Tab reaches the list once, on its first row, and the arrows move between rows past the headers", async () => {
		const { user } = renderPage(CHECK_B);
		await grid();
		// The last stop before the list is Clear all, after the chips of check B's filters.
		screen.getByRole("button", { name: "Clear all" }).focus();

		await user.tab();
		const rows = listRows();
		expect(rows[0]).toHaveFocus();

		await user.keyboard("{ArrowDown}");
		expect(rows[1]).toHaveFocus();
		await user.keyboard("{ArrowDown}{ArrowDown}{ArrowDown}");
		expect(rows[3]).toHaveFocus();
		await user.keyboard("{ArrowUp}");
		expect(rows[2]).toHaveFocus();
	});

	// D-536
	test("typing letters on a row does not move to another row", async () => {
		const { user } = renderPage(CHECK_B);
		await grid();
		const rows = listRows();
		rows[0]!.focus();

		await user.keyboard("zo");
		expect(rows[0]).toHaveFocus();
		await user.keyboard("big");
		expect(rows[0]).toHaveFocus();
	});

	test("Load more can be reached and pressed from the keyboard", async () => {
		const { user } = renderPage("?sort=amount", { list: threePages() });
		await grid();
		screen
			.getAllByRole("row")
			.find((each) => each.hasAttribute("data-key"))!
			.focus();

		await user.tab();
		expect(screen.getByRole("button", { name: "Load more" })).toHaveFocus();
		await user.keyboard("{Enter}");

		await waitFor(() => expect(rowNames()).toHaveLength(100));
	});
});

describe("offline with nothing cached (D-534)", () => {
	test("a filtered list says filters need a connection, and Clear filters goes back to all", async () => {
		vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
		onlineManager.setOnline(false);
		const { user, calls, lists } = renderPage(CHECK_B);

		expect(
			await screen.findByText("You're offline. Filters need a connection."),
		).toBeVisible();
		expect(lists).toEqual([]);

		await user.click(screen.getByRole("button", { name: "Clear filters" }));
		expect(calls).toEqual([{ mode: "push", href: "/transactions" }]);
	});

	test("the default list shows the error state, and the header that totals could not be loaded", async () => {
		vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
		onlineManager.setOnline(false);
		renderPage("");

		expect(
			await screen.findByText("Transactions could not be loaded."),
		).toBeVisible();
		expect(screen.getByRole("alert")).toHaveTextContent(
			"Totals could not be loaded.",
		);
		expect(
			screen.queryByText("You're offline. Filters need a connection."),
		).toBeNull();
	});

	test("both load by themselves when the connection returns", async () => {
		vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
		onlineManager.setOnline(false);
		renderPage(CHECK_B);
		await screen.findByText("You're offline. Filters need a connection.");

		act(() => onlineManager.setOnline(true));

		await grid();
		expect(rowNames()).toHaveLength(4);
		expect(await screen.findByText("₹6,220.00")).toBeVisible();
	});

	test("rows already loaded stay when the connection goes", async () => {
		renderPage(CHECK_B);
		await grid();

		goOffline();
		act(() => onlineManager.setOnline(false));

		expect(rowNames()).toHaveLength(4);
		expect(
			screen.queryByText("You're offline. Filters need a connection."),
		).toBeNull();
	});
});

describe("focus after Load more (D-535)", () => {
	test("stays on Load more while there are more pages", async () => {
		const { user } = renderPage("?sort=amount", { list: threePages() });
		await grid();
		screen.getByRole("button", { name: "Load more" }).focus();

		await user.keyboard("{Enter}");
		await waitFor(() => expect(rowNames()).toHaveLength(100));

		expect(screen.getByRole("button", { name: "Load more" })).toHaveFocus();
	});

	test("moves to the first new row when the last page takes the button away", async () => {
		const { user } = renderPage("?sort=amount", { list: threePages() });
		await grid();
		await user.click(screen.getByRole("button", { name: "Load more" }));
		await waitFor(() => expect(rowNames()).toHaveLength(100));
		screen.getByRole("button", { name: "Load more" }).focus();

		await user.keyboard("{Enter}");

		await waitFor(() =>
			expect(
				screen
					.getAllByRole("row")
					.find((each) =>
						each.getAttribute("aria-label")?.startsWith("Payee 101,"),
					),
			).toHaveFocus(),
		);
		await user.keyboard("{ArrowDown}");
		expect(document.activeElement).toHaveAttribute(
			"aria-label",
			expect.stringMatching(/^Payee 102,/),
		);
	});

	test("moves focus once: a later update leaves focus where the user put it", async () => {
		const { user, queryClient } = renderPage("?sort=amount", {
			list: threePages(),
		});
		await grid();
		await user.click(screen.getByRole("button", { name: "Load more" }));
		await waitFor(() => expect(rowNames()).toHaveLength(100));
		screen.getByRole("button", { name: "Load more" }).focus();
		await user.keyboard("{Enter}");
		await waitFor(() =>
			expect(document.activeElement).toHaveAttribute(
				"aria-label",
				expect.stringMatching(/^Payee 101,/),
			),
		);
		const heading = screen.getByRole("heading", { level: 1 });
		heading.tabIndex = -1;
		heading.focus();

		await act(() => queryClient.invalidateQueries());
		await new Promise((resolve) => setTimeout(resolve, 50));

		expect(heading).toHaveFocus();
	});

	test("leaves focus alone when the last page came from scrolling", async () => {
		const { user } = renderPage("?sort=amount", { list: threePages() });
		await grid();
		await user.click(screen.getByRole("button", { name: "Load more" }));
		await waitFor(() => expect(rowNames()).toHaveLength(100));
		const heading = screen.getByRole("heading", { level: 1 });
		heading.tabIndex = -1;
		heading.focus();

		scrollToEnd();

		await waitFor(() => expect(rowNames()).toHaveLength(120));
		expect(heading).toHaveFocus();
	});
});

describe("the URL and the data change under the page", () => {
	test("follows the URL when it changes from outside, as with Back", async () => {
		const { lists } = renderPage("", {
			list: ({ path }) =>
				ok(
					pathOf(path).searchParams.has("cat") ?
						CHECK_B_PAGE
					:	page({
							items: [golden(26)],
							groups: [day("2026-11-01", 42000)],
						}),
				),
		});
		await grid();
		expect(rowNames()).toHaveLength(1);

		act(() => window.history.pushState(null, "", `/transactions${CHECK_B}`));

		await waitFor(() => expect(rowNames()).toHaveLength(4));
		expect(lists.at(-1)!.path).toBe(
			"/api/transactions?from=2026-10-01&to=2026-10-31&cat=food",
		);
	});

	test("a slow answer for a filter left behind never replaces the new one", async () => {
		let answer: () => void = () => {};
		const waiting = new Promise<void>((resolve) => (answer = resolve));
		const { user } = renderPage("", {
			list: async ({ path }) => {
				if (!pathOf(path).searchParams.has("sort")) {
					await waiting;
					return ok(
						page({
							items: [golden(26)],
							groups: [day("2026-11-01", 42000)],
						}),
					);
				}
				return ok(page({ items: [golden(13)] }));
			},
		});
		await screen.findByRole("status", { name: "Loading Transactions" });

		await user.click(screen.getByRole("button", { name: /^Group and sort/ }));
		await user.click(
			await screen.findByRole("radio", { name: "Largest first" }),
		);
		await user.keyboard("{Escape}");
		await waitFor(() =>
			expect(rowNames()).toEqual([
				"Acme Corp, Salary, Thu, 1 Oct · 10:05 am, +₹85,000.00",
			]),
		);

		answer();
		await new Promise((resolve) => setTimeout(resolve, 30));
		expect(rowNames()).toEqual([
			"Acme Corp, Salary, Thu, 1 Oct · 10:05 am, +₹85,000.00",
		]);
	});

	test("a refetch after a change elsewhere shows the new rows and totals", async () => {
		let after = false;
		const { queryClient } = renderPage(CHECK_B, {
			list: () =>
				ok(
					after ?
						page({
							items: [golden(25)],
							groups: [day("2026-10-31", 38000)],
						})
					:	CHECK_B_PAGE,
				),
			totals: () =>
				ok(
					after ?
						summary({ count: 1, spendingMinor: 38000 })
					:	CHECK_B_SUMMARY,
				),
		});
		await grid();
		await screen.findByText("₹6,220.00");

		after = true;
		await act(() => queryClient.invalidateQueries());

		await waitFor(() => expect(rowNames()).toHaveLength(1));
		expect(
			await screen.findByText("₹380.00", { selector: "dd *" }),
		).toBeVisible();
	});

	// BR-F03-57, AC-F03-37 on the page
	test("when a later page says the groups moved, the list reloads from its first page", async () => {
		let moved = false;
		const { user, lists } = renderPage("?group=category", {
			list: ({ path }) => {
				const cursor = pathOf(path).searchParams.get("cursor");
				if (cursor === null)
					return ok(
						page({
							items: moved ? [golden(25)] : [golden(13)],
							groups:
								moved ?
									[{ ...day("food", 2622000), count: 5 }]
								:	[{ ...day("salary", 0, 8500000), count: 1 }],
							order: moved ? "new" : "old",
							nextCursor: moved ? null : "c1",
						}),
					);
				moved = true;
				return ok(page({ order: "new" }));
			},
		});
		await grid();
		expect(headers()).toEqual(["Salary 1 · In ₹85,000.00"]);

		await user.click(screen.getByRole("button", { name: "Load more" }));

		await waitFor(() => expect(headers()).toEqual(["Food 5 · Out ₹26,220.00"]));
		expect(
			lists.map((each) => pathOf(each.path).searchParams.get("cursor")),
		).toEqual([null, "c1", null]);
		expect(screen.queryByRole("button", { name: "Load more" })).toBeNull();
	});

	test("a day that spans two pages keeps one header, with the later page's totals", async () => {
		const { user } = renderPage("", {
			list: ({ path }) =>
				pathOf(path).searchParams.get("cursor") === null ?
					ok(
						page({
							items: [golden(13)],
							groups: [day("2026-10-01", 0, 8500000, 2)],
							nextCursor: "c1",
						}),
					)
				:	ok(
						page({
							items: [golden(12)],
							groups: [day("2026-10-01", 1800000, 8500000, 2)],
						}),
					),
		});
		await grid();

		await user.click(screen.getByRole("button", { name: "Load more" }));

		await waitFor(() => expect(rowNames()).toHaveLength(2));
		expect(headers()).toEqual(["Thu, 1 Oct In ₹85,000.00 · Out ₹18,000.00"]);
	});
});

describe("the live region (D-530)", () => {
	test("announces a second page of 50 again, though its words are the same", async () => {
		const pages = ({ path }: { path: string }) => {
			const n = Number(pathOf(path).searchParams.get("cursor")?.slice(1) ?? 0);
			return ok(
				page({
					items: Array.from({ length: 50 }, (_, i) =>
						row({
							id: idOf(n * 50 + i + 1),
							payee: `Payee ${n * 50 + i + 1}`,
						}),
					),
					nextCursor: n < 3 ? `p${n + 1}` : null,
				}),
			);
		};
		const { user } = renderPage("?sort=amount", { list: pages });
		await grid();
		const live = listLive;

		await user.click(screen.getByRole("button", { name: "Load more" }));
		await waitFor(() =>
			expect(live()).toHaveTextContent("Loaded 50 more Transactions"),
		);
		const first = live().firstElementChild;

		await user.click(screen.getByRole("button", { name: "Load more" }));
		await waitFor(() => expect(rowNames()).toHaveLength(150));

		expect(live()).toHaveTextContent("Loaded 50 more Transactions");
		expect(live().firstElementChild).not.toBe(first);
	});

	test("is polite and hidden from sight", async () => {
		renderPage(CHECK_B);
		await grid();

		const live = listLive();
		expect(live).toBeDefined();
		expect(live).not.toHaveAttribute("aria-live", "assertive");
	});
});

describe("the notice and later changes (D-531)", () => {
	test("goes when the filter changes, as Clear filters does", async () => {
		const { user } = renderPage("?cat=travel&min=abc", {
			list: () => ok(page()),
		});
		await screen.findByText("No Transactions match these filters.");
		expect(
			screen.getByText(
				"Some filters in this link weren't valid and were removed.",
			),
		).toBeVisible();

		await user.click(screen.getByRole("button", { name: "Clear filters" }));

		expect(
			screen.queryByText(
				"Some filters in this link weren't valid and were removed.",
			),
		).toBeNull();
	});

	test("stays when only the grouping or sort changes, which is not a filter", async () => {
		const { user } = renderPage("?cat=nope");
		await grid();

		await user.click(screen.getByRole("button", { name: /^Group and sort/ }));
		await user.click(await screen.findByRole("radio", { name: "Payee" }));
		await user.keyboard("{Escape}");

		expect(
			screen.getByText(
				"Some filters in this link weren't valid and were removed.",
			),
		).toBeVisible();
	});
});

describe("another profile's formats", () => {
	test("labels, figures and amounts follow its locale, currency and zone", async () => {
		route(network, "get", "/api/transactions", () =>
			ok(
				page({
					items: [row({ ...golden(25), currency: "EUR" })],
					groups: [day("2026-10-31", 38000)],
					currency: "EUR",
				}),
			),
		);
		route(network, "get", "/api/transactions/summary", () =>
			ok(summary({ count: 1, spendingMinor: 38000, currency: "EUR" })),
		);
		const { Url } = urlHarness("");
		renderInApp(
			<Url>
				<TransactionsPage
					weekStart="monday"
					locale={{
						today: "2026-11-02",
						dateLocale: "de-DE",
						timezone: "Europe/Berlin",
						numberLocale: "de-DE",
						currency: "EUR",
					}}
				/>
			</Url>,
		);
		await grid();

		expect(headers()).toEqual(["Sa., 31. Okt. Out 380,00\u00a0€"]);
		expect(rowNames()).toEqual(["Swiggy, Food, 19:20, −380,00\u00a0€"]);
		await waitFor(() => expect(figure("Out")).toBe("380,00\u00a0€"));
	});
});

describe("the skeleton", () => {
	test("has seven rows, each an avatar, two lines and an amount, hidden from screen readers", async () => {
		renderPage(CHECK_B, { list: () => new Promise(() => {}) });

		const loading = await screen.findByRole("status", {
			name: "Loading Transactions",
		});
		expect(loading.children).toHaveLength(7);
		for (const each of loading.children)
			expect(each.querySelectorAll("[aria-hidden='true']")).toHaveLength(4);
	});
});

/** Check B's filter counts (F03 section 5). */
const CHECK_B_FACETS = {
	type: {
		income: 0,
		expense: 4,
		refund: 0,
		goal_contribution: 0,
		goal_withdrawal: 0,
	},
	category: {
		food: 4,
		entertainment: 2,
		shopping: 2,
		housing: 1,
		salary: 1,
		transportation: 1,
	},
	date: {
		all: 7,
		this_month: 1,
		last_month: 4,
		last_3_months: 7,
		year_to_date: 7,
		last_12_months: 7,
	},
	source: { manual: 4, subscription: 0 },
};

/** Check B's histogram (F03 section 5). */
const CHECK_B_HISTOGRAM = {
	edges: [
		31500, 40000, 50000, 63000, 80000, 100000, 125000, 160000, 200000, 250000,
		315000,
	],
	counts: [1, 0, 0, 1, 0, 0, 0, 0, 1, 1],
	currency: "INR",
};

/** The page with the filter counts and the histogram served too. */
function renderFiltered(search: string) {
	const facets = route(network, "get", "/api/transactions/facets", () =>
		ok(CHECK_B_FACETS),
	);
	const histograms = route(
		network,
		"get",
		"/api/transactions/amount-histogram",
		() => ok(CHECK_B_HISTOGRAM),
	);
	return { ...renderPage(search), facets, histograms };
}

const menu = (name: string) =>
	screen.getByRole("button", { name: new RegExp(`^${name}`), hidden: true });
const searchBox = () =>
	screen.getByRole("searchbox", { name: "Search Transactions" });
const requestOf = (seen: { path: string }) => {
	const address = new URL(seen.path, "http://x");
	return address.pathname + address.search;
};

describe("filters (BR-F03-39, D-523)", () => {
	test("a page load asks for no filter counts and no histogram", async () => {
		const { facets, histograms } = renderFiltered(CHECK_B);
		await grid();

		await new Promise((resolve) => setTimeout(resolve, 100));

		expect(facets).toHaveLength(0);
		expect(histograms).toHaveLength(0);
	});

	// AC-F03-40
	test("the first control opened asks for the counts once, and every control shows them", async () => {
		const { user, facets } = renderFiltered(CHECK_B);
		await grid();

		await user.click(menu("Type"));
		expect(
			await screen.findByRole("checkbox", { name: "Expense 4" }),
		).toBeInTheDocument();
		await user.keyboard("{Escape}");
		await user.click(menu("Category"));

		expect(
			await screen.findByRole("checkbox", { name: "Food 4" }),
		).toBeChecked();
		expect(facets).toHaveLength(1);
		expect(requestOf(facets[0]!)).toBe(
			"/api/transactions/facets?from=2026-10-01&to=2026-10-31&cat=food",
		);
	});

	test("the Amount control asks for the histogram when it first opens, and only it", async () => {
		const { user, histograms } = renderFiltered(`${CHECK_B}&min=400.00`);
		await grid();

		await user.click(menu("Type"));
		await user.keyboard("{Escape}");
		expect(histograms).toHaveLength(0);
		await user.click(menu("Amount"));
		await screen.findByRole("slider", { name: /^Minimum amount/ });
		await user.keyboard("{Escape}");
		await user.click(menu("Amount"));

		expect(histograms).toHaveLength(1);
		// The histogram ignores the amount bounds (BR-F03-60).
		expect(requestOf(histograms[0]!)).toBe(
			"/api/transactions/amount-histogram?from=2026-10-01&to=2026-10-31&cat=food",
		);
	});

	test("closed controls never follow the filter; reopening asks for the new filter's counts", async () => {
		const { user, facets, histograms } = renderFiltered(CHECK_B);
		await grid();

		await user.click(menu("Type"));
		await screen.findByRole("checkbox", { name: "Expense 4" });
		await user.keyboard("{Escape}");
		await user.click(menu("Amount"));
		await screen.findByRole("slider", { name: /^Minimum amount/ });
		await user.keyboard("{Escape}");
		await user.click(screen.getByRole("button", { name: "Remove Food" }));
		await waitFor(() => expect(menu("Category Any")).toBeInTheDocument());
		await new Promise((resolve) => setTimeout(resolve, 100));
		expect(facets).toHaveLength(1);
		expect(histograms).toHaveLength(1);

		await user.click(menu("Type"));

		await waitFor(() => expect(facets).toHaveLength(2));
		expect(requestOf(facets[1]!)).toBe(
			"/api/transactions/facets?from=2026-10-01&to=2026-10-31",
		);
		expect(histograms).toHaveLength(1);
	});

	test("the Amount control asks for no counts, as it shows none", async () => {
		const { user, facets, histograms } = renderFiltered("");
		await grid();

		await user.click(menu("Amount"));
		await screen.findByRole("slider", { name: /^Minimum amount/ });
		await new Promise((resolve) => setTimeout(resolve, 100));

		expect(histograms).toHaveLength(1);
		expect(facets).toHaveLength(0);
	});

	test("an open control's counts follow a choice made in it", async () => {
		const { user, facets } = renderFiltered("");
		await grid();

		await user.click(menu("Type"));
		await screen.findByRole("checkbox", { name: "Expense 4" });
		await user.click(screen.getByRole("checkbox", { name: "Refund 0" }));

		await waitFor(() => expect(facets).toHaveLength(2));
		expect(requestOf(facets[1]!)).toBe("/api/transactions/facets?type=refund");
	});

	test("while the counts load, each option holds a placeholder", async () => {
		const { user } = renderPage("");
		route(network, "get", "/api/transactions/facets", async () => {
			await new Promise((resolve) => setTimeout(resolve, 300));
			return ok(CHECK_B_FACETS);
		});
		await grid();

		await user.click(menu("Type"));
		const dialog = await screen.findByRole("dialog", { name: "Type" });

		expect(dialog.querySelectorAll("label .bg-track")).toHaveLength(3);
		expect(
			await screen.findByRole("checkbox", { name: "Expense 4" }),
		).toBeInTheDocument();
		expect(dialog.querySelectorAll("label .bg-track")).toHaveLength(0);
	});

	test("offline no placeholders show, as the counts never come", async () => {
		const { user } = renderFiltered("");
		await grid();
		goOffline();
		act(() => onlineManager.setOnline(false));

		await user.click(menu("Type"));
		const dialog = await screen.findByRole("dialog", { name: "Type" });

		expect(dialog.querySelectorAll("label .bg-track")).toHaveLength(0);
		expect(
			screen.getByRole("checkbox", { name: "Expense" }),
		).toBeInTheDocument();
	});

	test.each([
		["Type", "checkbox", /^Refund/, "/transactions?type=refund"],
		["Category", "checkbox", /^Health/, "/transactions?cat=health"],
		["More", "radio", /^Added by you/, "/transactions?src=manual"],
		[
			"Date",
			"radio",
			/^Last month/,
			"/transactions?from=2026-10-01&to=2026-10-31",
		],
	])("%s: a choice pushes its URL at once", async (control, role, name, href) => {
		const { user, calls } = renderFiltered("");
		await grid();

		await user.click(menu(control));
		await user.click(await screen.findByRole(role, { name }));

		expect(calls).toEqual([{ mode: "push", href }]);
	});

	test("unticking the only type pushes the URL without it", async () => {
		const { user, calls } = renderFiltered("?type=refund");
		await grid();

		await user.click(menu("Type"));
		await user.click(await screen.findByRole("checkbox", { name: /^Refund/ }));

		expect(calls).toEqual([{ mode: "push", href: "/transactions" }]);
	});

	test("Amount: a quick range pushes its min and max", async () => {
		const { user, calls } = renderFiltered("");
		await grid();

		await user.click(menu("Amount"));
		await user.click(await screen.findByRole("radio", { name: "₹400 to ₹800" }));

		expect(calls).toEqual([
			{ mode: "push", href: "/transactions?min=400.00&max=799.99" },
		]);
	});

	test("a filter change keeps the grouping and sort", async () => {
		const { user, calls } = renderFiltered("?sort=amount&group=payee");
		await grid();

		await user.click(menu("Type"));
		await user.click(await screen.findByRole("checkbox", { name: /^Income/ }));

		expect(calls.at(-1)).toEqual({
			mode: "push",
			href: "/transactions?type=income&sort=amount&group=payee",
		});
	});

	test("a new filter asks for its list and its totals", async () => {
		const { user, lists, summaries } = renderFiltered("");
		await grid();
		const before = { lists: lists.length, summaries: summaries.length };

		await user.click(menu("Type"));
		await user.click(await screen.findByRole("checkbox", { name: /^Refund/ }));

		await waitFor(() => expect(lists.length).toBe(before.lists + 1));
		expect(requestOf(lists.at(-1)!)).toBe("/api/transactions?type=refund");
		expect(summaries.length).toBe(before.summaries + 1);
	});

	test("check B shows its chips, and the trigger values", async () => {
		renderFiltered(CHECK_B);
		await grid();

		const chips = screen.getByRole("grid", { name: "Active filters" });
		expect(
			within(chips)
				.getAllByRole("row")
				.map((row) => row.textContent),
		).toEqual(["Last month", "Food"]);
		expect(menu("Date Last month")).toBeInTheDocument();
		expect(menu("Category Food")).toBeInTheDocument();
		expect(menu("Type Any")).toBeInTheDocument();
		expect(menu("Filters \\(2\\)")).toBeInTheDocument();
	});

	test("removing a chip pushes the URL without that filter", async () => {
		const { user, calls } = renderFiltered(CHECK_B);
		await grid();

		await user.click(screen.getByRole("button", { name: "Remove Food" }));

		expect(calls).toEqual([
			{ mode: "push", href: "/transactions?from=2026-10-01&to=2026-10-31" },
		]);
	});

	test("Clear all drops every filter and keeps the grouping and sort", async () => {
		const { user, calls } = renderFiltered(`${CHECK_B}&q=swiggy&sort=amount`);
		await grid();

		await user.click(screen.getByRole("button", { name: "Clear all" }));

		expect(calls).toEqual([{ mode: "push", href: "/transactions?sort=amount" }]);
		expect(searchBox()).toHaveValue("");
	});

	test("no filter shows no chips", async () => {
		renderFiltered("");
		await grid();

		expect(screen.queryByRole("grid", { name: "Active filters" })).toBeNull();
		expect(menu("Filters$")).toBeInTheDocument();
	});
});

describe("search (BR-F03-38, golden check H)", () => {
	test("commits after typing stops, after the other filters in the URL", async () => {
		const { user, calls } = renderFiltered(CHECK_B);
		await grid();

		await user.type(searchBox(), "swiggy");
		expect(calls).toEqual([]);

		await waitFor(() =>
			expect(calls).toEqual([
				{
					mode: "push",
					href: "/transactions?from=2026-10-01&to=2026-10-31&cat=food&q=swiggy",
				},
			]),
		);
		expect(
			within(screen.getByRole("grid", { name: "Active filters" })).getByRole(
				"row",
				{
					name: "“swiggy”",
				},
			),
		).toBeInTheDocument();
	});

	test("a search from the URL shows in the box, and its chip removed empties it", async () => {
		const { user, calls } = renderFiltered("?q=649");
		await grid();
		expect(searchBox()).toHaveValue("649");

		await user.click(screen.getByRole("button", { name: "Remove “649”" }));

		expect(calls).toEqual([{ mode: "push", href: "/transactions" }]);
		expect(searchBox()).toHaveValue("");
	});

	test("/ focuses the box from the list", async () => {
		const { user } = renderFiltered("");
		await grid();
		listRows()[0]!.focus();

		await user.keyboard("/");

		expect(searchBox()).toHaveFocus();
	});

	test("offline the box is disabled and says search needs a connection", async () => {
		renderFiltered("");
		await grid();

		goOffline();

		expect(searchBox()).toBeDisabled();
		expect(searchBox()).toHaveAttribute(
			"placeholder",
			"Search needs a connection",
		);
	});
});

describe("the phone sheet (BR-F03-39)", () => {
	// AC-F03-61
	test("Show writes check B's URL as one history entry", async () => {
		const { user, calls } = renderFiltered("");
		await grid();

		await user.click(menu("Filters"));
		const sheet = await screen.findByRole("dialog", { name: "Filters" });
		await user.click(within(sheet).getByRole("radio", { name: "Last month" }));
		await user.click(within(sheet).getByRole("button", { name: "Food" }));
		expect(calls).toEqual([]);
		const show = within(sheet).getByRole("button", { name: /^Show/ });
		await waitFor(() => expect(show).not.toHaveAttribute("data-pending"));
		await user.click(show);

		expect(calls).toEqual([{ mode: "push", href: `/transactions${CHECK_B}` }]);
	});
});

describe("history (D-547)", () => {
	// AC-F03-69
	test("one visit to a menu adds one entry, and its later changes replace it", async () => {
		const { user, calls } = renderFiltered("");
		await grid();

		await user.click(menu("Type"));
		await user.click(await screen.findByRole("checkbox", { name: /^Expense/ }));
		await user.click(screen.getByRole("checkbox", { name: /^Refund/ }));

		expect(calls).toEqual([
			{ mode: "push", href: "/transactions?type=expense" },
			{ mode: "replace", href: "/transactions?type=expense,refund" },
		]);
	});

	// AC-F03-69
	test("a second visit adds a second entry", async () => {
		const { user, calls } = renderFiltered("");
		await grid();

		await user.click(menu("Type"));
		await user.click(await screen.findByRole("checkbox", { name: /^Expense/ }));
		await user.keyboard("{Escape}");
		await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
		await user.click(menu("Category"));
		await user.click(await screen.findByRole("checkbox", { name: /^Food/ }));

		expect(calls.map((call) => call.mode)).toEqual(["push", "push"]);
		expect(calls.at(-1)!.href).toBe("/transactions?type=expense&cat=food");
	});

	// AC-F03-69
	test("removing a chip, and Clear all, each add their own entry", async () => {
		const { user, calls } = renderFiltered(`${CHECK_B}&type=expense`);
		await grid();

		await user.click(screen.getByRole("button", { name: "Remove Food" }));
		await user.click(screen.getByRole("button", { name: "Remove Expense" }));
		await user.click(screen.getByRole("button", { name: "Clear all" }));

		expect(calls.map((call) => call.mode)).toEqual(["push", "push", "push"]);
	});

	test("the Amount menu's quick range and typed Min in one visit are one entry", async () => {
		const { user, calls } = renderFiltered("");
		await grid();

		await user.click(menu("Amount"));
		await user.click(await screen.findByRole("radio", { name: "₹400 to ₹800" }));
		await user.clear(screen.getByRole("textbox", { name: "Min" }));
		await user.type(screen.getByRole("textbox", { name: "Min" }), "500");

		await waitFor(() => expect(calls).toHaveLength(2));
		expect(calls).toEqual([
			{ mode: "push", href: "/transactions?min=400.00&max=799.99" },
			{ mode: "replace", href: "/transactions?min=500.00&max=799.99" },
		]);
	});

	// AC-F03-69
	test("one focus of the search box is one entry, however many pauses it has", async () => {
		const { user, calls } = renderFiltered("");
		await grid();

		await user.type(searchBox(), "swiggy");
		await waitFor(() => expect(calls).toHaveLength(1));
		await user.type(searchBox(), " monthly");
		await waitFor(() => expect(calls).toHaveLength(2));

		expect(calls).toEqual([
			{ mode: "push", href: "/transactions?q=swiggy" },
			{ mode: "replace", href: "/transactions?q=swiggy%20monthly" },
		]);
	});

	test("Escape clearing the search is part of its visit", async () => {
		const { user, calls } = renderFiltered("");
		await grid();

		await user.type(searchBox(), "uber{Enter}");
		await user.keyboard("{Escape}");

		expect(calls).toEqual([
			{ mode: "push", href: "/transactions?q=uber" },
			{ mode: "replace", href: "/transactions" },
		]);
	});

	test("focusing the search box again starts a new entry", async () => {
		const { user, calls } = renderFiltered("");
		await grid();

		await user.type(searchBox(), "uber{Enter}");
		await user.click(menu("Type"));
		await user.keyboard("{Escape}");
		await user.clear(searchBox());

		expect(calls.map((call) => call.mode)).toEqual(["push", "push"]);
	});

	test("leaving the search box and coming back starts a new entry", async () => {
		const { user, calls } = renderFiltered("");
		await grid();

		await user.type(searchBox(), "uber{Enter}");
		await user.click(screen.getByRole("heading", { name: "Transactions" }));
		await user.clear(searchBox());

		expect(calls.map((call) => call.mode)).toEqual(["push", "push"]);
	});

	test("a Date preset adds one entry and closes the menu", async () => {
		const { user, calls } = renderFiltered("");
		await grid();

		await user.click(menu("Date"));
		await user.click(await screen.findByRole("radio", { name: /^This month/ }));
		await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
		await user.click(menu("Date"));
		await user.click(await screen.findByRole("radio", { name: /^Last month/ }));

		expect(calls.map((call) => call.mode)).toEqual(["push", "push"]);
	});

	test("no menu offers Done", async () => {
		const { user } = renderFiltered("");
		await grid();

		for (const name of ["Date", "Type", "Category", "Amount", "More"]) {
			await user.click(menu(name));
			await screen.findByRole("dialog", { name });
			expect(screen.queryByRole("button", { name: "Done" })).toBeNull();
			await user.keyboard("{Escape}");
			await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
		}
	});
});
