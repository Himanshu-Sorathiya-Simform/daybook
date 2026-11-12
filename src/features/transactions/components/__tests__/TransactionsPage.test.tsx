import { onlineManager } from "@tanstack/react-query";
import {
	act,
	cleanup,
	render,
	screen,
	waitFor,
	within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { I18nProvider } from "react-aria-components";
import { toast } from "sonner";
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

import {
	GOLDEN_BLOCK,
	meFor,
	renderInApp,
} from "@/components/app/__tests__/helpers";
import { AppProviders } from "@/components/app/AppProviders";
import { Toaster } from "@/components/feedback/Toaster";
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
import {
	CHECK_A_SUMMARY,
	GOLDEN_CATEGORIES,
	GOLDEN_PAYEES,
	idOf,
	page,
	row,
} from "../../lib/__tests__/fixtures";
import type { LabelLocale } from "../../lib/labels";
import {
	transactionListOptions,
	transactionSummaryOptions,
	viewsOptions,
} from "../../lib/queries";
import { PAGE_BREAKDOWNS, type SummaryAnswer } from "../../lib/types";
import { EntryDialogHost } from "../EntryDialogHost";
import { TransactionDeletesHost } from "../TransactionDeletesHost";
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
 * the observers of matching elements that they came into view, as scrolling would. An element
 * `stays` matches is reported in view as soon as it is watched, as a browser's observer
 * reports an element's state when it starts watching it. */
const observers = new Set<{
	callback: IntersectionObserverCallback;
	targets: Element[];
}>();
let stays: ((target: Element) => boolean) | null = null;
class FakeObserver {
	private entry: { callback: IntersectionObserverCallback; targets: Element[] };
	constructor(callback: IntersectionObserverCallback) {
		this.entry = { callback, targets: [] };
		observers.add(this.entry);
	}
	observe(target: Element) {
		this.entry.targets.push(target);
		if (!stays?.(target)) return;
		const { callback } = this.entry;
		setTimeout(() => {
			if (!observers.has(this.entry)) return;
			act(() => {
				callback(
					[{ isIntersecting: true, target } as IntersectionObserverEntry],
					{} as IntersectionObserver,
				);
			});
		}, 0);
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
	stays = null;
	vi.stubGlobal("IntersectionObserver", FakeObserver);
	// The entry dialog's host reads the profile, and the dialog the payees.
	route(network, "get", "/api/me", () => ok(meFor("u1")));
	route(network, "get", "/api/payees", () =>
		ok({ items: GOLDEN_PAYEES, categories: GOLDEN_CATEGORIES }),
	);
	// The views bar reads the saved views; tests that need some answer them later.
	route(network, "get", "/api/transaction-views", () =>
		ok({ items: [], currency: "INR" }),
	);
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
/** The list's end, the area holding Load more, comes into view. */
const scrollToEnd = () => intersect((target) => target.textContent === "Load more");
const scrollToTop = () =>
	intersect((target) => target.textContent === "Load earlier");
/** The list's end, or its top, comes into view and stays there while pages load. */
const scrollToEndAndStay = () => {
	stays = (target) => target.textContent === "Load more";
	scrollToEnd();
};
const scrollToTopAndStay = () => {
	stays = (target) => target.textContent === "Load earlier";
	scrollToTop();
};

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
			<TransactionDeletesHost profile={GOLDEN_BLOCK}>
				<EntryDialogHost profile={GOLDEN_BLOCK}>
					<TransactionsPage
						locale={IN}
						weekStart="monday"
					/>
				</EntryDialogHost>
			</TransactionDeletesHost>
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
					<TransactionDeletesHost profile={GOLDEN_BLOCK}>
						<EntryDialogHost profile={GOLDEN_BLOCK}>
							<TransactionsPage
								locale={IN}
								weekStart="monday"
							/>
						</EntryDialogHost>
					</TransactionDeletesHost>
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

	test("the saved views bar sits between the title and the search box", async () => {
		renderPage("");
		await grid();

		const bar = await screen.findByRole("radiogroup", { name: "Saved views" });
		const title = screen.getByRole("heading", { level: 1 });
		const search = screen.getByRole("searchbox");
		expect(
			title.compareDocumentPosition(bar) & Node.DOCUMENT_POSITION_FOLLOWING,
		).toBeTruthy();
		expect(
			bar.compareDocumentPosition(search) & Node.DOCUMENT_POSITION_FOLLOWING,
		).toBeTruthy();
	});

	// BR-F03-65: view never enters a query key
	test("choosing a view whose filter the URL already has asks for nothing new", async () => {
		route(network, "get", "/api/transaction-views", () =>
			ok({
				items: [
					{
						id: idOf(1),
						name: "October food",
						filter: {
							from: "2026-10-01",
							to: "2026-10-31",
							cat: ["food"],
						},
						sort: "date",
						dir: "desc",
						group: "day",
						version: 1,
						createdAt: "2026-11-01T06:30:00.000Z",
						updatedAt: "2026-11-01T06:30:00.000Z",
					},
				],
				currency: "INR",
			}),
		);
		const { calls, lists, summaries, user } = renderPage(CHECK_B);
		await grid();
		await user.click(await screen.findByRole("radio", { name: "October food" }));

		expect(calls.at(-1)).toEqual({
			mode: "push",
			href: `/transactions${CHECK_B}&view=${idOf(1)}`,
		});
		await new Promise((resolve) => setTimeout(resolve, 50));
		expect(lists).toHaveLength(1);
		expect(summaries).toHaveLength(1);
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

	// BR-F03-30: each load watches the end afresh, so one still in view loads the next page.
	test("while the end stays in view, each next page loads in turn", async () => {
		const { lists } = renderPage("?sort=amount", { list: threePages() });
		await grid();

		scrollToEndAndStay();

		// Two loads in a row: more time than one, for full runs under coverage.
		await waitFor(() => expect(rowNames()).toHaveLength(120), { timeout: 3000 });
		expect(
			lists.map((each) => pathOf(each.path).searchParams.get("cursor")),
		).toEqual([null, "p1", "p2"]);
		expect(screen.queryByRole("button", { name: "Load more" })).toBeNull();
	});

	// AC-F03-22, BR-F03-30: a page loaded at the top sets off nothing at the end, so it is never
	// trimmed straight away; the end loads only as it comes into view.
	test("loading an earlier page asks for no next page", async () => {
		const { lists, user } = renderPage("?sort=amount", { list: threePages() });
		await grid();
		await user.click(screen.getByRole("button", { name: "Load more" }));
		await waitFor(() => expect(rowNames()).toHaveLength(100));
		const asked = lists.length;

		scrollToTop();
		await new Promise((resolve) => setTimeout(resolve, 50));

		expect(
			lists
				.slice(asked)
				.map((each) => pathOf(each.path).searchParams.get("cursor")),
		).not.toContain("p2");
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

	// AC-F03-64: a next page that fails keeps what is loaded, and Load more tries again.
	test("a failed next page keeps the rows and Load more, says nothing, and a second press loads it", async () => {
		const pages = threePages();
		let failed = false;
		const { lists, user } = renderPage("?sort=amount", {
			list: (request) => {
				if (
					pathOf(request.path).searchParams.get("cursor") === "p1"
					&& !failed
				) {
					failed = true;
					return refuse(500, "internal");
				}
				return pages(request);
			},
		});
		await grid();

		await user.click(screen.getByRole("button", { name: "Load more" }));
		await waitFor(() => expect(lists).toHaveLength(2));
		await waitFor(() =>
			expect(
				screen.getByRole("button", { name: "Load more" }),
			).not.toHaveAttribute("aria-disabled"),
		);
		expect(rowNames()).toHaveLength(50);
		expect(listLive()).not.toHaveTextContent("Loaded");
		expect(screen.queryByText("Transactions could not be loaded.")).toBeNull();

		await user.click(screen.getByRole("button", { name: "Load more" }));
		await waitFor(() => expect(rowNames()).toHaveLength(100));
		expect(listLive()).toHaveTextContent("Loaded 50 more Transactions");
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

	// BR-F03-30: each load watches the top afresh, so one still in view loads the page before.
	test("while the top stays in view, each trimmed page loads in turn, up to the newest", async () => {
		const { user, lists } = renderPage("?sort=amount", { list: sevenPages() });
		await grid();
		await loadSix(user);
		await user.click(screen.getByRole("button", { name: "Load more" }));
		await waitFor(() => expect(rowNames()[0]).toMatch(/^Payee 5,/));
		const before = lists.length;

		scrollToTopAndStay();

		// Two loads in a row: more time than one, for full runs under coverage.
		await waitFor(() => expect(rowNames()[0]).toMatch(/^Payee 1,/), {
			timeout: 3000,
		});
		expect(
			lists
				.slice(before)
				.map((each) => pathOf(each.path).searchParams.get("cursor")),
		).toEqual(["q2", "q1"]);
		expect(screen.queryByRole("button", { name: "Load earlier" })).toBeNull();
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
				<TransactionDeletesHost profile={GOLDEN_BLOCK}>
					<EntryDialogHost profile={GOLDEN_BLOCK}>
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
					</EntryDialogHost>
				</TransactionDeletesHost>
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

describe("adding (BR-F03-21, BR-F03-22, BR-F03-53, D-548)", () => {
	// The golden clock (TST-3); only `Date` is frozen, so user-event's timers stay real.
	beforeEach(() => {
		vi.useFakeTimers({ toFake: ["Date"] });
		vi.setSystemTime(new Date("2026-11-02T06:30:00.000Z"));
	});
	afterEach(() => {
		act(() => {
			toast.dismiss();
		});
	});

	/** The page at `search` with the toasts, and the create answering the row it was sent. */
	function renderAdding(search: string, list = () => ok(CHECK_B_PAGE)) {
		route(network, "get", "/api/transactions", list);
		route(network, "get", "/api/transactions/summary", () =>
			ok(CHECK_B_SUMMARY),
		);
		const created = route(network, "post", "/api/transactions", ({ body }) =>
			ok(row(body as Partial<Transaction>), 201),
		);
		const { calls, Url } = urlHarness(search);
		const view = renderInApp(
			<I18nProvider locale="en-IN">
				<Url>
					<TransactionDeletesHost profile={GOLDEN_BLOCK}>
						<EntryDialogHost profile={GOLDEN_BLOCK}>
							<TransactionsPage
								locale={IN}
								weekStart="monday"
							/>
						</EntryDialogHost>
					</TransactionDeletesHost>
				</Url>
				<Toaster />
			</I18nProvider>,
		);
		return { ...view, calls, created, user: userEvent.setup() };
	}

	type User = ReturnType<typeof userEvent.setup>;
	const entry = () => screen.findByRole("dialog", { name: "New Transaction" });
	const noEntry = () =>
		waitFor(() =>
			expect(
				screen.queryByRole("dialog", {
					name: "New Transaction",
					hidden: true,
				}),
			).toBeNull(),
		);

	/** Fills an expense of 640.00 to Kirana for Food, today, and presses `how`. */
	async function addExpense(user: User, how = "Save") {
		await user.click(
			screen.getByRole("textbox", { name: "Amount", hidden: true }),
		);
		await user.keyboard("640");
		await user.click(
			screen.getByRole("combobox", { name: "Payee", hidden: true }),
		);
		await user.keyboard("Kirana{Escape}");
		await user.click(
			screen
				.getByRole("radio", { name: "Food", hidden: true })
				.closest("label")!,
		);
		await user.click(screen.getByRole("button", { name: how, hidden: true }));
	}

	const idOfCreate = (created: { body: unknown }[]) =>
		(created[0]!.body as { id: string }).id;

	// AC-F03-70, AC-F03-58
	test("a plain Save of a row the filter shows selects it and says Transaction saved.", async () => {
		const { user, calls, created } = renderAdding("");
		await grid();

		await user.keyboard("n");
		await entry();
		await addExpense(user);
		await noEntry();

		expect(await screen.findByText("Transaction saved.")).toBeInTheDocument();
		expect(calls).toEqual([
			{ mode: "replace", href: `/transactions?txn=${idOfCreate(created)}` },
		]);
	});

	test("a search the new row matches still selects it", async () => {
		const { user, calls, created } = renderAdding("?q=kirana");
		await grid();

		await user.keyboard("n");
		await entry();
		await addExpense(user);
		await noEntry();

		expect(calls.at(-1)).toEqual({
			mode: "replace",
			href: `/transactions?q=kirana&txn=${idOfCreate(created)}`,
		});
	});

	// AC-F03-70, BR-F03-22
	test("a row the filter hides says so, selects nothing, and Show clears the filters", async () => {
		const { user, calls } = renderAdding("?type=income");
		await grid();

		await user.keyboard("n");
		await entry();
		await addExpense(user);
		await noEntry();

		expect(
			await screen.findByText("Saved. It's hidden by your filters."),
		).toBeInTheDocument();
		expect(calls).toEqual([]);
		await user.click(screen.getByRole("button", { name: "Show" }));

		expect(calls).toEqual([{ mode: "push", href: "/transactions" }]);
	});

	test("Show keeps the grouping and sort", async () => {
		const { user, calls } = renderAdding("?type=income&sort=amount");
		await grid();

		await user.keyboard("n");
		await entry();
		await addExpense(user);
		await user.click(await screen.findByRole("button", { name: "Show" }));

		expect(calls.at(-1)).toEqual({
			mode: "push",
			href: "/transactions?sort=amount",
		});
	});

	test("a date range that ends before today hides the new row", async () => {
		const { user } = renderAdding(CHECK_B);
		await grid();

		await user.keyboard("n");
		await entry();
		await addExpense(user);

		expect(
			await screen.findByText("Saved. It's hidden by your filters."),
		).toBeInTheDocument();
	});

	// BR-F03-21: only a plain Save selects
	test("Save and add another selects nothing and keeps the dialog open", async () => {
		const { user, calls } = renderAdding("");
		await grid();

		await user.keyboard("n");
		await entry();
		await addExpense(user, "Save and add another");

		expect(await screen.findByText("Transaction saved.")).toBeInTheDocument();
		expect(calls).toEqual([]);
		expect(
			screen.getByRole("dialog", { name: "New Transaction", hidden: true }),
		).toBeInTheDocument();
	});

	// BR-F03-53
	test("new=1 opens the dialog, and closing it removes the parameter", async () => {
		const { user, calls } = renderAdding("?cat=food&new=1");

		expect(await entry()).toBeInTheDocument();
		await user.keyboard("{Escape}");
		await noEntry();

		expect(calls).toEqual([{ mode: "replace", href: "/transactions?cat=food" }]);
	});

	test("new=1 then Save both lands the selection and removes the parameter", async () => {
		const { user, calls, created } = renderAdding("?new=1");

		await entry();
		await addExpense(user);
		await noEntry();

		expect(calls.at(-1)).toEqual({
			mode: "replace",
			href: `/transactions?txn=${idOfCreate(created)}`,
		});
	});

	test("after new=1 closes, it stays closed", async () => {
		const { user } = renderAdding("?new=1");

		await entry();
		await user.keyboard("{Escape}");
		await noEntry();
		await new Promise((resolve) => setTimeout(resolve, 50));

		expect(
			screen.queryByRole("dialog", { name: "New Transaction", hidden: true }),
		).toBeNull();
	});

	test("new given twice or empty opens nothing", async () => {
		renderAdding("?new=1&new=1");
		await grid();
		await new Promise((resolve) => setTimeout(resolve, 50));

		expect(
			screen.queryByRole("dialog", { name: "New Transaction", hidden: true }),
		).toBeNull();
	});

	// F03 section 6: the empty state's Add
	test("the empty state's Add Transaction opens the dialog", async () => {
		const { user } = renderAdding("", () => ok(page()));

		await user.click(
			await screen.findByRole("button", { name: "Add Transaction" }),
		);

		expect(await entry()).toBeInTheDocument();
	});

	test("a filtered empty state has no Add, only Clear filters", async () => {
		renderAdding("?type=income", () => ok(page()));

		expect(
			await screen.findByRole("button", { name: "Clear filters" }),
		).toBeInTheDocument();
		expect(screen.queryByRole("button", { name: "Add Transaction" })).toBeNull();
	});
});

describe("the panel and selection (BR-F03-70 to BR-F03-73, D-554)", () => {
	beforeEach(() => {
		vi.useFakeTimers({ toFake: ["Date"] });
		vi.setSystemTime(new Date("2026-11-02T06:30:00.000Z"));
		route(network, "get", "/api/payees/history", () =>
			ok({
				count: 4,
				inMinor: 0,
				outMinor: 329000,
				usualDay: 3,
				currency: "INR",
			}),
		);
	});
	afterEach(() => {
		act(() => {
			toast.dismiss();
		});
		// @ts-expect-error jsdom has none; the docked tests set one.
		delete window.matchMedia;
	});

	/** A window at least 1180 px wide, where the panel docks. jsdom has no `matchMedia`, which
	 * the page reads as narrower. */
	function docked() {
		window.matchMedia = vi.fn((query: string) => ({
			matches: query === "(min-width: 1180px)",
			media: query,
			addEventListener: () => {},
			removeEventListener: () => {},
		})) as unknown as typeof window.matchMedia;
	}

	/** Golden row `n` as the API answers it at M1, where charges are unlinked (D-475). */
	const m1 = (n: number): Transaction => ({ ...golden(n), subscriptionId: null });

	// Newest first on golden data (F03 section 5): #26, #27, #25, #24.
	const NEWEST = page({
		items: [26, 27, 25, 24].map(m1),
		groups: [
			day("2026-11-01", 1842000, 0, 2),
			day("2026-10-31", 38000),
			day("2026-10-19", 64000),
		],
	});

	function renderPanel(
		search: string,
		{
			list = () => ok(NEWEST),
			one,
		}: {
			list?: Parameters<typeof route>[3];
			one?: { id: string; respond: Parameters<typeof route>[3] };
		} = {},
	) {
		const lists = route(network, "get", "/api/transactions", list);
		const summaries = route(network, "get", "/api/transactions/summary", () =>
			ok(CHECK_A_SUMMARY),
		);
		const alone =
			one ?
				route(network, "get", `/api/transactions/${one.id}`, one.respond)
			:	[];
		const { calls, Url } = urlHarness(search);
		const view = renderInApp(
			<I18nProvider locale="en-IN">
				<Url>
					<TransactionDeletesHost profile={GOLDEN_BLOCK}>
						<EntryDialogHost profile={GOLDEN_BLOCK}>
							<TransactionsPage
								locale={IN}
								weekStart="monday"
							/>
						</EntryDialogHost>
					</TransactionDeletesHost>
				</Url>
				<Toaster />
			</I18nProvider>,
		);
		return {
			...view,
			calls,
			lists,
			summaries,
			alone,
			user: userEvent.setup(),
		};
	}

	const rowNamed = (name: RegExp) =>
		within(screen.getByRole("grid", { name: "Transactions", hidden: true }))
			.getAllByRole("row", { hidden: true })
			.find((each) => name.test(each.getAttribute("aria-label") ?? ""))!;
	const panel = () =>
		screen.getByRole("complementary", { name: "Transaction details" });
	const replaced = (calls: { mode: string; href: string }[]) =>
		calls.filter((call) => call.mode === "replace").map((call) => call.href);

	describe("docked, from 1180 px", () => {
		// AC-F03-56
		test("with nothing selected, the panel shows check A's summary with 4 top payees", async () => {
			docked();
			renderPanel("?from=2026-10-01&to=2026-10-31");
			await grid();

			expect(panel()).toHaveTextContent("This list");
			expect(panel()).toHaveTextContent("11 Transactions");
			expect(panel()).toHaveTextContent("1 Oct to 31 Oct");
			expect(
				within(
					within(panel()).getByRole("region", {
						name: "Top payees by Out",
					}),
				).getAllByRole("listitem"),
			).toHaveLength(4);
			expect(screen.queryByRole("dialog")).toBeNull();
		});

		test("a click selects the row, writes txn by replacing, and the panel shows it", async () => {
			docked();
			const { calls, user } = renderPanel("");
			await grid();

			await user.click(rowNamed(/^Swiggy, Food, 10:15 pm/));

			expect(rowNamed(/^Swiggy, Food, 10:15 pm/)).toHaveAttribute(
				"aria-selected",
				"true",
			);
			expect(replaced(calls)).toEqual([`/transactions?txn=${m1(24).id}`]);
			expect(calls.filter((call) => call.mode === "push")).toEqual([]);
			expect(panel()).toHaveTextContent("Mon, 19 Oct, 2026 · 10:15 pm");
			expect(
				await within(panel()).findByText(
					"4 Transactions · ₹3,290.00 · usually around the 3rd",
				),
			).toBeInTheDocument();
		});

		// BR-F03-73: a filter change keeps txn and the panel, even when the row leaves the list.
		test("a filter that hides the selected row keeps it in the panel and in the URL", async () => {
			docked();
			// Outside the list, the panel asks for the row on its own (BR-F03-53).
			const { alone, calls, user } = renderPanel(`?txn=${m1(24).id}`, {
				list: ({ path }) =>
					ok(pathOf(path).searchParams.has("q") ? page() : NEWEST),
				one: {
					id: m1(24).id,
					respond: () => ok({ ...m1(24), currency: "INR" }),
				},
			});
			await grid();
			expect(panel()).toHaveTextContent("−₹640.00");

			await user.type(screen.getByRole("searchbox"), "acme");

			await waitFor(() =>
				expect(calls.at(-1)?.href).toBe(
					`/transactions?q=acme&txn=${m1(24).id}`,
				),
			);
			await screen.findByText("No Transactions match these filters.");
			await waitFor(() => expect(panel()).toHaveTextContent("−₹640.00"));
			expect(panel()).toHaveTextContent("Swiggy");
			expect(alone).toHaveLength(1);
		});

		// F03 section 13: the selected row edited on another device.
		test("a selected row changed elsewhere shows its new values once the list reloads", async () => {
			docked();
			let amountMinor = 64000;
			const { queryClient } = renderPanel(`?txn=${m1(24).id}`, {
				list: () =>
					ok({
						...NEWEST,
						items: NEWEST.items.map((each) =>
							each.id === m1(24).id ?
								{
									...each,
									amountMinor,
									version: amountMinor === 64000 ? 1 : 2,
								}
							:	each,
						),
					}),
			});
			await grid();
			expect(panel()).toHaveTextContent("−₹640.00");

			amountMinor = 66000;
			await act(() => queryClient.invalidateQueries());

			await waitFor(() => expect(panel()).toHaveTextContent("−₹660.00"));
			expect(rowNamed(/^Swiggy, Food, 10:15 pm/)).toHaveTextContent(
				"−₹660.00",
			);
		});

		// AC-F03-72
		test("a press on the selected row keeps it selected", async () => {
			docked();
			const { calls, user } = renderPanel("");
			await grid();

			await user.click(rowNamed(/^Swiggy, Food, 10:15 pm/));
			await user.click(rowNamed(/^Swiggy, Food, 10:15 pm/));

			expect(rowNamed(/^Swiggy, Food, 10:15 pm/)).toHaveAttribute(
				"aria-selected",
				"true",
			);
			expect(replaced(calls)).not.toContain("/transactions");
			expect(panel()).toHaveTextContent("Mon, 19 Oct, 2026 · 10:15 pm");
		});

		// AC-F03-58
		test("with #26 selected, Down selects #27 and replaces txn, adding no history entry", async () => {
			docked();
			const { calls, user } = renderPanel(`?txn=${m1(26).id}`);
			await grid();
			expect(rowNamed(/^Swiggy, Food, 12:30 am/)).toHaveAttribute(
				"aria-selected",
				"true",
			);

			await user.click(rowNamed(/^Swiggy, Food, 12:30 am/));
			await user.keyboard("{ArrowDown}");

			expect(rowNamed(/^Sunrise Apartments/)).toHaveAttribute(
				"aria-selected",
				"true",
			);
			expect(replaced(calls).at(-1)).toBe(`/transactions?txn=${m1(27).id}`);
			expect(calls.filter((call) => call.mode === "push")).toEqual([]);
			expect(panel()).toHaveTextContent("From a deleted Subscription");
		});

		// AC-F03-58
		test("Enter and E open Edit Transaction for the selected row, and D duplicates it", async () => {
			docked();
			const { user } = renderPanel(`?txn=${m1(24).id}`);
			await grid();
			await user.click(rowNamed(/^Swiggy, Food, 10:15 pm/));
			await user.keyboard("{Enter}");
			const edit = await screen.findByRole("dialog", {
				name: "Edit Transaction",
			});
			expect(
				within(edit).getByRole("textbox", { name: "Amount" }),
			).toHaveValue("640.00");
			await user.keyboard("{Escape}");
			await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

			await user.keyboard("e");
			expect(
				await screen.findByRole("dialog", { name: "Edit Transaction" }),
			).toBeInTheDocument();
			await user.keyboard("{Escape}");
			await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

			await user.keyboard("d");
			expect(
				await screen.findByRole("dialog", { name: "Duplicate Transaction" }),
			).toBeInTheDocument();
		});

		test("the panel's Edit and Duplicate open the dialog too", async () => {
			docked();
			const { user } = renderPanel(`?txn=${m1(24).id}`);
			await grid();

			await user.click(
				within(panel()).getByRole("button", { name: "Duplicate" }),
			);
			expect(
				await screen.findByRole("dialog", { name: "Duplicate Transaction" }),
			).toBeInTheDocument();
		});

		// AC-F03-58
		test("Escape clears the selection and removes txn, and the summary comes back", async () => {
			docked();
			const { calls, user } = renderPanel(`?txn=${m1(24).id}`);
			await grid();
			await user.click(rowNamed(/^Swiggy, Food, 10:15 pm/));

			await user.keyboard("{Escape}");

			await waitFor(() =>
				expect(replaced(calls).at(-1)).toBe("/transactions"),
			);
			expect(panel()).toHaveTextContent("11 Transactions");
		});

		test("Escape from the panel's buttons clears it too", async () => {
			docked();
			const { calls, user } = renderPanel(`?txn=${m1(24).id}`);
			await grid();

			within(panel()).getByRole("button", { name: "Edit" }).focus();
			await user.keyboard("{Escape}");

			expect(replaced(calls).at(-1)).toBe("/transactions");
		});

		test("Close details clears the selection", async () => {
			docked();
			const { calls, user } = renderPanel(`?txn=${m1(24).id}`);
			await grid();

			await user.click(
				within(panel()).getByRole("button", { name: "Close details" }),
			);

			expect(replaced(calls).at(-1)).toBe("/transactions");
		});

		test("E and D do nothing while typing in the search box", async () => {
			docked();
			const { user } = renderPanel(`?txn=${m1(24).id}`);
			await grid();

			await user.click(screen.getByRole("searchbox"));
			await user.keyboard("ed");

			expect(screen.queryByRole("dialog")).toBeNull();
		});

		test("the keys do nothing with nothing selected", async () => {
			docked();
			const { calls, user } = renderPanel("");
			await grid();

			await user.keyboard("ed{Escape}");

			expect(screen.queryByRole("dialog")).toBeNull();
			expect(calls).toEqual([]);
		});

		test("the page's keys wait while the dialog is open", async () => {
			docked();
			const { user } = renderPanel(`?txn=${m1(24).id}`);
			await grid();

			await user.click(within(panel()).getByRole("button", { name: "Edit" }));
			const edit = await screen.findByRole("dialog", {
				name: "Edit Transaction",
			});
			within(edit).getByRole("button", { name: "Cancel" }).focus();
			await user.keyboard("d");

			expect(
				screen.queryByRole("dialog", { name: "Duplicate Transaction" }),
			).toBeNull();
			expect(
				screen.getByRole("dialog", { name: "Edit Transaction" }),
			).toBeInTheDocument();
		});

		test("the page's keys wait while a view's Rename or Delete dialog is open", async () => {
			docked();
			route(network, "get", "/api/transaction-views", () =>
				ok({
					items: [
						{
							id: idOf(1),
							name: "Everything",
							filter: {},
							sort: "date",
							dir: "desc",
							group: "day",
							version: 1,
							createdAt: "2026-11-01T06:30:00.000Z",
							updatedAt: "2026-11-01T06:30:00.000Z",
						},
					],
					currency: "INR",
				}),
			);
			const { calls, user } = renderPanel(`?view=${idOf(1)}&txn=${m1(24).id}`);
			const dialogs = () => [
				...screen.queryAllByRole("dialog"),
				...screen.queryAllByRole("alertdialog"),
			];
			await grid();

			for (const action of ["Rename", "Delete"]) {
				await user.click(
					await screen.findByRole("button", { name: "View options" }),
				);
				await user.click(
					await screen.findByRole("menuitem", { name: action }),
				);
				const dialog = await screen.findByRole(
					action === "Rename" ? "dialog" : "alertdialog",
				);
				within(dialog).getByRole("button", { name: "Cancel" }).focus();
				await user.keyboard("de{Delete}");

				expect(dialogs()).toEqual([dialog]);
				await user.keyboard("{Escape}");
				await waitFor(() => expect(dialogs()).toEqual([]));
			}
			expect(calls).toEqual([]);
			expect(panel()).toBeInTheDocument();

			// Closed, the keys work again.
			await user.keyboard("d");
			expect(
				await screen.findByRole("dialog", { name: "Duplicate Transaction" }),
			).toBeInTheDocument();
		});

		test("a saved edit says Changes saved. and the row stays selected with its new amount", async () => {
			docked();
			const edited = route(
				network,
				"patch",
				`/api/transactions/${m1(24).id}`,
				({ body }) =>
					ok({
						...m1(24),
						...(body as object),
						version: 2,
						currency: "INR",
					}),
			);
			const { calls, user } = renderPanel(`?txn=${m1(24).id}`);
			await grid();

			await user.click(within(panel()).getByRole("button", { name: "Edit" }));
			await screen.findByRole("dialog", { name: "Edit Transaction" });
			const amount = screen.getByRole("textbox", { name: "Amount" });
			await user.clear(amount);
			await user.keyboard("700");
			await user.click(screen.getByRole("button", { name: "Save" }));

			expect(await screen.findByText("Changes saved.")).toBeInTheDocument();
			expect(edited).toHaveLength(1);
			await waitFor(() => expect(panel()).toHaveTextContent("−₹700.00"));
			expect(replaced(calls)).not.toContain("/transactions");
		});

		// AC-F03-71
		test("a conflict shows both versions; Escape goes back, and Keep mine saves at the saved version", async () => {
			docked();
			const current = {
				...m1(24),
				amountMinor: 66000,
				note: "Split",
				version: 2,
				currency: "INR",
			};
			const edited = route(
				network,
				"patch",
				`/api/transactions/${m1(24).id}`,
				({ body }, index) =>
					index < 2 ?
						refuse(409, "version_conflict", { details: { current } })
					:	ok({ ...current, ...(body as object), version: 3 }),
			);
			const { user } = renderPanel(`?txn=${m1(24).id}`);
			await grid();
			const conflictOf = async () => {
				await user.click(
					within(panel()).getByRole("button", { name: "Edit" }),
				);
				await screen.findByRole("dialog", { name: "Edit Transaction" });
				await user.clear(screen.getByRole("textbox", { name: "Amount" }));
				await user.keyboard("700");
				await user.click(screen.getByRole("button", { name: "Save" }));
				return screen.findByRole("dialog", {
					name: "This Transaction changed on another device",
				});
			};

			const view = await conflictOf();
			const amountRow = within(view)
				.getByRole("rowheader", { name: /^Amount/ })
				.closest("tr")!;
			expect(amountRow).toHaveTextContent("AmountDiffers₹700.00₹660.00");
			expect(view).toHaveTextContent(
				"Keep mine saves your change to Amount and keeps the rest as it is saved now.",
			);
			await user.keyboard("{Escape}");
			await waitFor(() =>
				expect(
					screen.queryByRole("dialog", {
						name: "This Transaction changed on another device",
					}),
				).toBeNull(),
			);
			expect(screen.getByRole("textbox", { name: "Amount" })).toHaveValue(
				"700.00",
			);
			await user.click(screen.getByRole("button", { name: "Save" }));
			await user.click(
				within(
					await screen.findByRole("dialog", {
						name: "This Transaction changed on another device",
					}),
				).getByRole("button", { name: "Keep mine" }),
			);

			expect(await screen.findByText("Changes saved.")).toBeInTheDocument();
			expect(edited[2]!.body).toEqual({ amountMinor: 70000, currency: "INR" });
			expect(edited[2]!.headers.get("If-Match")).toBe('"2"');
			expect(edited[2]!.headers.get("Idempotency-Key")).not.toBe(
				edited[1]!.headers.get("Idempotency-Key"),
			);
			await waitFor(() => expect(panel()).toHaveTextContent("−₹700.00"));
		});

		// AC-F03-71, BR-F03-78: Keep mine that meets another 409 shows the newer version.
		test("Keep mine meeting a newer version shows it, and Keep mine again saves at that version", async () => {
			docked();
			const v2 = {
				...m1(24),
				amountMinor: 66000,
				version: 2,
				currency: "INR",
			};
			const v3 = { ...v2, amountMinor: 68000, version: 3 };
			const edited = route(
				network,
				"patch",
				`/api/transactions/${m1(24).id}`,
				({ body }, index) =>
					index === 0 ?
						refuse(409, "version_conflict", { details: { current: v2 } })
					: index === 1 ?
						refuse(409, "version_conflict", { details: { current: v3 } })
					:	ok({ ...v3, ...(body as object), version: 4 }),
			);
			const { user } = renderPanel(`?txn=${m1(24).id}`);
			await grid();
			await user.click(within(panel()).getByRole("button", { name: "Edit" }));
			await screen.findByRole("dialog", { name: "Edit Transaction" });
			await user.clear(screen.getByRole("textbox", { name: "Amount" }));
			await user.keyboard("700");
			await user.click(screen.getByRole("button", { name: "Save" }));
			const conflict = () =>
				screen.findByRole("dialog", {
					name: "This Transaction changed on another device",
				});
			const amountRow = async () =>
				within(await conflict())
					.getByRole("rowheader", { name: /^Amount/ })
					.closest("tr")!;

			expect(await amountRow()).toHaveTextContent(
				"AmountDiffers₹700.00₹660.00",
			);
			await user.click(
				within(await conflict()).getByRole("button", { name: "Keep mine" }),
			);
			await waitFor(async () =>
				expect(await amountRow()).toHaveTextContent(
					"AmountDiffers₹700.00₹680.00",
				),
			);
			await user.click(
				within(await conflict()).getByRole("button", { name: "Keep mine" }),
			);

			expect(await screen.findByText("Changes saved.")).toBeInTheDocument();
			expect(edited.map((each) => each.headers.get("If-Match"))).toEqual([
				'"1"',
				'"2"',
				'"3"',
			]);
			expect(edited[2]!.body).toEqual({ amountMinor: 70000, currency: "INR" });
		});

		// AC-F03-71
		test("a conflict's Keep theirs sends nothing more and the panel shows the saved row", async () => {
			docked();
			const current = {
				...m1(24),
				amountMinor: 66000,
				note: "Split",
				version: 2,
				currency: "INR",
			};
			const edited = route(
				network,
				"patch",
				`/api/transactions/${m1(24).id}`,
				() => refuse(409, "version_conflict", { details: { current } }),
			);
			const { user } = renderPanel(`?txn=${m1(24).id}`);
			await grid();

			await user.click(within(panel()).getByRole("button", { name: "Edit" }));
			await screen.findByRole("dialog", { name: "Edit Transaction" });
			await user.clear(screen.getByRole("textbox", { name: "Amount" }));
			await user.keyboard("700");
			await user.click(screen.getByRole("button", { name: "Save" }));
			await user.click(
				within(
					await screen.findByRole("dialog", {
						name: "This Transaction changed on another device",
					}),
				).getByRole("button", { name: "Keep theirs" }),
			);

			await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
			expect(edited).toHaveLength(1);
			await waitFor(() => expect(panel()).toHaveTextContent("−₹660.00"));
			expect(panel()).toHaveTextContent("Split");
			expect(screen.queryByText("Changes saved.")).toBeNull();
		});

		// BR-F03-25
		test("an edit of a row deleted elsewhere says so and clears the selection", async () => {
			docked();
			route(network, "patch", `/api/transactions/${m1(24).id}`, () =>
				refuse(404, "not_found"),
			);
			const { calls, user } = renderPanel(`?txn=${m1(24).id}`);
			await grid();

			await user.click(within(panel()).getByRole("button", { name: "Edit" }));
			await screen.findByRole("dialog", { name: "Edit Transaction" });
			await user.clear(screen.getByRole("textbox", { name: "Amount" }));
			await user.keyboard("700");
			await user.click(screen.getByRole("button", { name: "Save" }));

			expect(
				await screen.findByText(
					"This Transaction was deleted on another device.",
				),
			).toBeInTheDocument();
			await waitFor(() =>
				expect(replaced(calls).at(-1)).toBe("/transactions"),
			);
			expect(
				screen.getAllByText(
					"This Transaction was deleted on another device.",
				),
			).toHaveLength(1);
		});

		// AC-F03-58
		test("txn of a row outside the loaded pages shows it after asking for it alone", async () => {
			docked();
			const { alone } = renderPanel(`?txn=${m1(13).id}`, {
				one: {
					id: m1(13).id,
					respond: () => ok({ ...m1(13), currency: "INR" }),
				},
			});

			expect(
				await within(panel()).findByText("Thu, 1 Oct, 2026 · 10:05 am", {
					exact: false,
				}),
			).toBeInTheDocument();
			expect(alone.map((each) => each.path)).toEqual([
				`/api/transactions/${m1(13).id}`,
			]);
		});

		test("a row in the loaded pages is never asked for alone", async () => {
			docked();
			const { alone } = renderPanel(`?txn=${m1(24).id}`, {
				one: {
					id: m1(24).id,
					respond: () => ok({ ...m1(24), currency: "INR" }),
				},
			});
			await grid();

			expect(panel()).toHaveTextContent("Mon, 19 Oct, 2026");
			expect(alone).toEqual([]);
		});

		test("while the row loads alone the panel shows skeleton lines", async () => {
			docked();
			let release = () => {};
			const { alone } = renderPanel(`?txn=${m1(13).id}`, {
				one: {
					id: m1(13).id,
					respond: () =>
						new Promise((resolve) => {
							release = () =>
								resolve(ok({ ...m1(13), currency: "INR" }));
						}),
				},
			});

			await waitFor(() => expect(alone).toHaveLength(1));
			expect(
				await within(panel()).findByRole("status", {
					name: "Loading the Transaction",
				}),
			).toBeInTheDocument();
			release();
			expect(
				await within(panel()).findByText("Acme Corp"),
			).toBeInTheDocument();
		});

		test("a row that fails to load alone offers Retry, which asks again", async () => {
			docked();
			const { alone, user } = renderPanel(`?txn=${m1(13).id}`, {
				one: {
					id: m1(13).id,
					respond: (_, index) =>
						index === 0 ?
							refuse(500, "internal")
						:	ok({ ...m1(13), currency: "INR" }),
				},
			});

			await user.click(
				await within(panel()).findByRole("button", { name: "Retry" }),
			);

			expect(
				await within(panel()).findByText("Acme Corp"),
			).toBeInTheDocument();
			expect(alone).toHaveLength(2);
		});

		test("when the list fails, the selected row is still asked for alone and shown", async () => {
			docked();
			renderPanel(`?txn=${m1(13).id}`, {
				list: () => refuse(500, "internal"),
				one: {
					id: m1(13).id,
					respond: () => ok({ ...m1(13), currency: "INR" }),
				},
			});

			expect(
				await within(panel()).findByText("Acme Corp"),
			).toBeInTheDocument();
		});

		// AC-F03-58. Another user's id takes this same path: the server answers it 404, never 403
		// (SEC-2, proven in app/api/transactions/[id]/__tests__/route.integration.test.ts).
		test("an unknown txn says We couldn't find that Transaction. and loses txn", async () => {
			docked();
			const unknown = idOf(999);
			const { calls } = renderPanel(`?txn=${unknown}`, {
				one: { id: unknown, respond: () => refuse(404, "not_found") },
			});

			expect(
				await screen.findByText("We couldn't find that Transaction."),
			).toBeInTheDocument();
			await waitFor(() =>
				expect(replaced(calls).at(-1)).toBe("/transactions"),
			);
			expect(panel()).toHaveTextContent("11 Transactions");
		});

		// BR-F03-73, AC-F03-72
		test("a shown row that leaves the pages on a refetch and is gone says it was deleted", async () => {
			docked();
			const { calls, queryClient } = renderPanel(`?txn=${m1(24).id}`, {
				list: (_, index) =>
					ok(index === 0 ? NEWEST : page({ items: [26, 27, 25].map(m1) })),
				one: { id: m1(24).id, respond: () => refuse(404, "not_found") },
			});
			await grid();
			expect(panel()).toHaveTextContent("Mon, 19 Oct, 2026");

			await act(() =>
				queryClient.invalidateQueries({ queryKey: ["transactions"] }),
			);

			expect(
				await screen.findByText(
					"This Transaction was deleted on another device.",
				),
			).toBeInTheDocument();
			await waitFor(() =>
				expect(replaced(calls).at(-1)).toBe("/transactions"),
			);
		});

		test("a Goal row shows no actions, and E and D do nothing, until M2", async () => {
			docked();
			const goalRow = { ...golden(22) };
			const { user } = renderPanel(`?txn=${goalRow.id}`, {
				list: () =>
					ok(page({ items: [goalRow], groups: [day("2026-10-15", 0)] })),
			});
			await grid();

			expect(
				within(panel()).queryByRole("button", { name: "Edit" }),
			).toBeNull();
			await user.keyboard("ed{Enter}");
			expect(screen.queryByRole("dialog")).toBeNull();
		});
	});

	describe("deleting (BR-F03-26, BR-F03-52, BR-F03-73)", () => {
		// The Undo window runs on fake timers that keep moving, so React Aria and user-event run.
		beforeEach(() => {
			vi.useFakeTimers({ shouldAdvanceTime: true });
			vi.setSystemTime(new Date("2026-11-02T06:30:00.000Z"));
		});
		afterEach(() => {
			// Unmount while the timers are still fake, so a waiting delete never leaks.
			cleanup();
		});

		const endWindow = () =>
			act(() => {
				vi.advanceTimersByTime(5000);
			});
		const swiggy24 = () => rowNamed(/^Swiggy, Food, 10:15 pm/);
		const has24 = () =>
			within(screen.getByRole("grid", { name: "Transactions", hidden: true }))
				.queryAllByRole("row", { hidden: true })
				.some((each) =>
					/^Swiggy, Food, 10:15 pm/.test(
						each.getAttribute("aria-label") ?? "",
					),
				);
		const keys = () =>
			userEvent.setup({ advanceTimers: vi.advanceTimersByTime.bind(vi) });
		const confirmView = () =>
			screen.findByRole("alertdialog", { name: "Delete this Transaction?" });
		/** Presses Delete in the confirm (D-84). */
		const confirm = async (user: ReturnType<typeof userEvent.setup>) => {
			await user.click(
				within(await confirmView()).getByRole("button", { name: "Delete" }),
			);
			await waitFor(() =>
				expect(screen.queryByRole("alertdialog")).toBeNull(),
			);
		};

		// AC-F03-73
		test("the panel's Delete takes the row out at once, clears the selection, and sends after 5 seconds", async () => {
			docked();
			const sent = route(
				network,
				"delete",
				`/api/transactions/${m1(24).id}`,
				() => new HttpResponse(null, { status: 204 }),
			);
			const { calls, user } = renderPanel(`?txn=${m1(24).id}`);
			await grid();

			await user.click(
				within(panel()).getByRole("button", { name: "Delete" }),
			);
			await confirm(user);

			expect(has24()).toBe(false);
			expect(
				await screen.findByText("Transaction deleted."),
			).toBeInTheDocument();
			await waitFor(() =>
				expect(replaced(calls).at(-1)).toBe("/transactions"),
			);
			expect(panel()).toHaveTextContent("11 Transactions");
			expect(sent).toEqual([]);
			endWindow();

			await waitFor(() => expect(sent).toHaveLength(1));
			expect(sent[0]!.headers.get("If-Match")).toBe('"1"');
			expect(has24()).toBe(false);
		});

		// BR-F03-73, AC-F03-73
		test("Undo brings the row back selected, and nothing is sent", async () => {
			docked();
			const sent = route(
				network,
				"delete",
				`/api/transactions/${m1(24).id}`,
				() => new HttpResponse(null, { status: 204 }),
			);
			const { calls, user } = renderPanel(`?txn=${m1(24).id}`);
			await grid();

			await user.click(
				within(panel()).getByRole("button", { name: "Delete" }),
			);
			await confirm(user);
			await user.click(await screen.findByRole("button", { name: "Undo" }));
			endWindow();

			expect(has24()).toBe(true);
			await waitFor(() =>
				expect(replaced(calls).at(-1)).toBe(
					`/transactions?txn=${m1(24).id}`,
				),
			);
			expect(swiggy24()).toHaveAttribute("aria-selected", "true");
			expect(sent).toEqual([]);
		});

		// AC-F03-73, AC-F03-24
		test("Delete and Backspace ask first, and once confirmed by keyboard focus moves to the next row", async () => {
			docked();
			route(
				network,
				"delete",
				`/api/transactions/${m1(24).id}`,
				() => new HttpResponse(null, { status: 204 }),
			);
			route(
				network,
				"delete",
				`/api/transactions/${m1(25).id}`,
				() => new HttpResponse(null, { status: 204 }),
			);
			const { calls } = renderPanel(`?txn=${m1(24).id}`);
			await grid();
			const user = keys();

			await user.click(swiggy24());
			await user.keyboard("{Delete}");
			expect(await confirmView()).toHaveTextContent("Swiggy");
			expect(has24()).toBe(true);
			// From Cancel, which has focus, to Delete.
			await user.keyboard("{Tab}{Enter}");

			expect(has24()).toBe(false);
			// #24 is the last row, so focus moves to the one before it, selecting nothing: the
			// delete cleared the selection (BR-F03-73).
			await waitFor(() =>
				expect(document.activeElement).toBe(
					rowNamed(/^Swiggy, Food, 11:50 pm/),
				),
			);
			expect(replaced(calls).at(-1)).toBe("/transactions");

			// Space selects the focused row, and Backspace deletes it.
			await user.keyboard(" ");
			await waitFor(() =>
				expect(replaced(calls).at(-1)).toBe(
					`/transactions?txn=${m1(25).id}`,
				),
			);
			await user.keyboard("{Backspace}");
			expect(await confirmView()).toHaveTextContent("11:50 pm");
			await user.keyboard("{Tab}{Enter}");

			await waitFor(() =>
				expect(document.activeElement).toBe(rowNamed(/^Sunrise Apartments/)),
			);
			expect(
				within(screen.getByRole("grid", { name: "Transactions" }))
					.queryAllByRole("row")
					.some((each) =>
						/11:50 pm/.test(each.getAttribute("aria-label") ?? ""),
					),
			).toBe(false);
			expect(screen.getAllByText("Transaction deleted.")).toHaveLength(2);
		});

		test("deleting a row in the middle moves focus to the row after it", async () => {
			docked();
			route(
				network,
				"delete",
				`/api/transactions/${m1(27).id}`,
				() => new HttpResponse(null, { status: 204 }),
			);
			renderPanel(`?txn=${m1(27).id}`);
			await grid();
			const user = keys();

			await user.click(rowNamed(/^Sunrise Apartments/));
			await user.keyboard("{Delete}");
			await confirmView();
			await user.keyboard("{Tab}{Enter}");

			await waitFor(() =>
				expect(document.activeElement).toBe(
					rowNamed(/^Swiggy, Food, 11:50 pm/),
				),
			);
		});

		test("a delete by mouse leaves focus where the browser puts it, off the list", async () => {
			docked();
			route(
				network,
				"delete",
				`/api/transactions/${m1(24).id}`,
				() => new HttpResponse(null, { status: 204 }),
			);
			const { user } = renderPanel(`?txn=${m1(24).id}`);
			await grid();

			await user.click(
				within(panel()).getByRole("button", { name: "Delete" }),
			);
			await confirm(user);
			// Long enough for the focus move after a keyboard delete to have run.
			await act(() => new Promise((resolve) => setTimeout(resolve, 100)));

			expect(document.activeElement?.getAttribute("role")).not.toBe("row");
		});

		test("Cancel in the confirm keeps the row selected and sends nothing", async () => {
			docked();
			const sent = route(
				network,
				"delete",
				`/api/transactions/${m1(24).id}`,
				() => new HttpResponse(null, { status: 204 }),
			);
			const { calls, user } = renderPanel(`?txn=${m1(24).id}`);
			await grid();

			await user.click(
				within(panel()).getByRole("button", { name: "Delete" }),
			);
			// AC-F03-73: the confirm shows #24 as the list does, with its day.
			const asking = await confirmView();
			for (const text of [
				"Swiggy",
				"Food",
				"Mon, 19 Oct",
				"10:15 pm",
				"−₹640.00",
			])
				expect(asking).toHaveTextContent(text);
			await user.click(within(asking).getByRole("button", { name: "Cancel" }));
			endWindow();

			expect(has24()).toBe(true);
			expect(replaced(calls)).not.toContain("/transactions");
			expect(sent).toEqual([]);
		});

		test("the panel's Delete pressed by keyboard moves focus to the next row", async () => {
			docked();
			route(
				network,
				"delete",
				`/api/transactions/${m1(24).id}`,
				() => new HttpResponse(null, { status: 204 }),
			);
			renderPanel(`?txn=${m1(24).id}`);
			await grid();
			const user = keys();

			within(panel()).getByRole("button", { name: "Delete" }).focus();
			await user.keyboard("{Enter}");
			await confirmView();
			await user.keyboard("{Tab}{Enter}");

			await waitFor(() =>
				expect(document.activeElement).toBe(
					rowNamed(/^Swiggy, Food, 11:50 pm/),
				),
			);
		});

		test("the page's keys wait while the confirm is open", async () => {
			docked();
			renderPanel(`?txn=${m1(24).id}`);
			await grid();
			const user = keys();

			await user.click(swiggy24());
			await user.keyboard("{Delete}");
			const view = await confirmView();
			await user.keyboard("e");

			expect(
				screen.queryByRole("dialog", { name: "Edit Transaction" }),
			).toBeNull();
			expect(view).toBeInTheDocument();
		});

		test("in the drawer, below 1180 px, Delete asks, then closes the drawer and removes txn", async () => {
			route(
				network,
				"delete",
				`/api/transactions/${m1(24).id}`,
				() => new HttpResponse(null, { status: 204 }),
			);
			const { calls, user } = renderPanel(`?txn=${m1(24).id}`);
			const drawer = await screen.findByRole("dialog", {
				name: "Transaction details",
			});

			await user.click(
				await within(drawer).findByRole("button", { name: "Delete" }),
			);
			await confirm(user);

			await waitFor(() =>
				expect(
					screen.queryByRole("dialog", { name: "Transaction details" }),
				).toBeNull(),
			);
			expect(replaced(calls).at(-1)).toBe("/transactions");
			expect(has24()).toBe(false);
		});

		// AC-F03-73
		test("Delete and Backspace do nothing while typing in the search box", async () => {
			docked();
			renderPanel(`?txn=${m1(24).id}`);
			await grid();
			const user = keys();

			await user.click(screen.getByRole("searchbox"));
			await user.keyboard("ab{Backspace}{Delete}");

			expect(has24()).toBe(true);
			expect(screen.queryByText("Transaction deleted.")).toBeNull();
		});

		// AC-F03-73
		// AC-F03-73
		test("the edit dialog's Delete asks over it, and once confirmed closes it and deletes with Undo", async () => {
			docked();
			route(
				network,
				"delete",
				`/api/transactions/${m1(24).id}`,
				() => new HttpResponse(null, { status: 204 }),
			);
			const { user } = renderPanel(`?txn=${m1(24).id}`);
			await grid();

			await user.click(within(panel()).getByRole("button", { name: "Edit" }));
			const edit = await screen.findByRole("dialog", {
				name: "Edit Transaction",
			});
			const amount = within(edit).getByRole("textbox", { name: "Amount" });
			await user.clear(amount);
			await user.type(amount, "700");
			await user.click(within(edit).getByRole("button", { name: "Delete" }));
			// Cancel goes back to the dialog with what was typed; Delete then closes it.
			await user.click(
				within(await confirmView()).getByRole("button", { name: "Cancel" }),
			);
			expect(
				screen.getByRole("dialog", { name: "Edit Transaction" }),
			).toBeInTheDocument();
			expect(
				within(
					screen.getByRole("dialog", { name: "Edit Transaction" }),
				).getByRole("textbox", { name: "Amount" }),
			).toHaveValue("700.00");
			expect(has24()).toBe(true);
			await user.click(
				within(
					screen.getByRole("dialog", { name: "Edit Transaction" }),
				).getByRole("button", { name: "Delete" }),
			);
			await confirm(user);

			await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
			expect(has24()).toBe(false);
			expect(screen.getByRole("button", { name: "Undo" })).toBeInTheDocument();
		});

		// AC-F03-30
		test("a 409 after the window opens the conflict view, and Keep it brings the row back selected", async () => {
			docked();
			const current = {
				...m1(24),
				amountMinor: 70000,
				version: 2,
				currency: "INR",
			};
			const sent = route(
				network,
				"delete",
				`/api/transactions/${m1(24).id}`,
				() => refuse(409, "version_conflict", { details: { current } }),
			);
			const { calls, user } = renderPanel(`?txn=${m1(24).id}`);
			await grid();

			await user.click(
				within(panel()).getByRole("button", { name: "Delete" }),
			);
			await confirm(user);
			endWindow();
			const view = await screen.findByRole("dialog", {
				name: "This Transaction changed on another device",
			});
			await user.click(within(view).getByRole("button", { name: "Keep it" }));

			await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
			expect(has24()).toBe(true);
			await waitFor(() =>
				expect(replaced(calls).at(-1)).toBe(
					`/transactions?txn=${m1(24).id}`,
				),
			);
			await waitFor(() => expect(panel()).toHaveTextContent("−₹700.00"));
			expect(sent).toHaveLength(1);
		});

		// AC-F03-73
		test("a delete the server can't take brings the row back with the message", async () => {
			docked();
			route(network, "delete", `/api/transactions/${m1(24).id}`, () =>
				HttpResponse.error(),
			);
			const { user } = renderPanel(`?txn=${m1(24).id}`);
			await grid();

			await user.click(
				within(panel()).getByRole("button", { name: "Delete" }),
			);
			await confirm(user);
			endWindow();

			expect(
				await screen.findByText(
					"Couldn't delete. Check your connection and try again.",
				),
			).toBeInTheDocument();
			expect(has24()).toBe(true);
		});

		// AC-F03-73
		test("a confirmed delete refreshes the header totals", async () => {
			docked();
			route(
				network,
				"delete",
				`/api/transactions/${m1(24).id}`,
				() => new HttpResponse(null, { status: 204 }),
			);
			const { summaries, user } = renderPanel(`?txn=${m1(24).id}`);
			await grid();
			const before = summaries.length;

			await user.click(
				within(panel()).getByRole("button", { name: "Delete" }),
			);
			await confirm(user);
			expect(summaries).toHaveLength(before);
			endWindow();

			await waitFor(() => expect(summaries.length).toBeGreaterThan(before));
		});
	});

	describe("as a drawer, below 1180 px", () => {
		// AC-F03-56
		test("no panel shows until a row is selected, which opens the drawer", async () => {
			const { user } = renderPanel("");
			await grid();

			expect(screen.queryByRole("complementary")).toBeNull();
			expect(screen.queryByText("This list")).toBeNull();
			await user.click(rowNamed(/^Swiggy, Food, 10:15 pm/));

			const drawer = await screen.findByRole("dialog", {
				name: "Transaction details",
			});
			expect(drawer).toHaveTextContent("Mon, 19 Oct, 2026 · 10:15 pm");
		});

		// AC-F03-56
		test("Close details, Escape and the scrim each close it and remove txn", async () => {
			const { calls, user } = renderPanel(`?txn=${m1(24).id}`);
			// The drawer, once its row has arrived.
			const drawer = async () => {
				const open = await screen.findByRole("dialog", {
					name: "Transaction details",
				});
				await within(open).findByRole("button", { name: "Close details" });
				return open;
			};
			const goneDrawer = () =>
				waitFor(() =>
					expect(
						screen.queryByRole("dialog", {
							name: "Transaction details",
						}),
					).toBeNull(),
				);

			await user.click(
				within(await drawer()).getByRole("button", {
					name: "Close details",
				}),
			);
			await goneDrawer();
			expect(replaced(calls).at(-1)).toBe("/transactions");

			await user.click(rowNamed(/^Swiggy, Food, 10:15 pm/));
			await drawer();
			await user.keyboard("{Escape}");
			await goneDrawer();
			expect(replaced(calls).at(-1)).toBe("/transactions");

			await user.click(rowNamed(/^Swiggy, Food, 10:15 pm/));
			const open = await drawer();
			await user.pointer({
				keys: "[MouseLeft]",
				target: open.closest(".bg-scrim")!,
			});
			await goneDrawer();
			expect(replaced(calls).at(-1)).toBe("/transactions");
		});

		// D-554, AC-F03-72
		test("the arrow keys only move between rows, and Enter opens the drawer", async () => {
			const { calls, user } = renderPanel("");
			await grid();

			await user.click(rowNamed(/^Swiggy, Food, 12:30 am/));
			await user.click(
				within(
					await screen.findByRole("dialog", {
						name: "Transaction details",
					}),
				).getByRole("button", { name: "Close details" }),
			);
			await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
			rowNamed(/^Swiggy, Food, 12:30 am/).focus();
			await user.keyboard("{ArrowDown}");

			expect(document.activeElement).toBe(rowNamed(/^Sunrise Apartments/));
			expect(screen.queryByRole("dialog")).toBeNull();
			const before = calls.length;
			await user.keyboard("{Enter}");

			expect(
				await screen.findByRole("dialog", { name: "Transaction details" }),
			).toHaveTextContent("Sunrise Apartments");
			expect(calls.slice(before)).toEqual([
				{ mode: "replace", href: `/transactions?txn=${m1(27).id}` },
			]);
		});

		test("E in the drawer opens the edit dialog", async () => {
			const { user } = renderPanel(`?txn=${m1(24).id}`);
			await screen.findByRole("dialog", { name: "Transaction details" });

			await user.keyboard("e");

			expect(
				await screen.findByRole("dialog", { name: "Edit Transaction" }),
			).toBeInTheDocument();
		});
	});
});
