import { onlineManager } from "@tanstack/react-query";
import { renderToString } from "react-dom/server";
import {
	act,
	fireEvent,
	render,
	screen,
	waitFor,
	within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { delay, HttpResponse } from "msw";
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

import { AppProviders } from "@/components/app/AppProviders";
import { goldenBudget, goldenBudgets } from "@/lib/budgets/__tests__/golden";
import type { ExpenseCategory } from "@/lib/budgets/model";
import type { Month } from "@/lib/budgets/months";
import { isUuidV7 } from "@/lib/ids";
import {
	ok,
	refuse,
	route,
	testClient,
	urlHarness,
} from "../../hooks/__tests__/helpers";
import { resetUnsavedChoices } from "@/hooks/useStoredChoice";
import { VIEW_KEY } from "../../lib/view";
import { budgetKeys } from "../../lib/keys";
import {
	budgetAnswer,
	historyAnswer,
	monthAnswer,
	payeeSummary,
} from "../../lib/__tests__/fixtures";
import type { BudgetMonthAnswer, BudgetsLocale } from "../../lib/types";
import { BudgetsPage } from "../BudgetsPage";

const network = setupServer();
beforeAll(() => network.listen({ onUnhandledFrame: "error" }));
beforeEach(() => {
	window.localStorage.clear();
	// The month grid reads the year summary when it opens.
	route(network, "get", "/api/budgets/summary", ({ path }) =>
		ok({ year: Number(path.slice(-4)), months: [] }),
	);
	// The panel reads a selection's last 6 months and its payees.
	route(network, "get", "/api/budgets/history", ({ path }) => {
		const query = new URL(path, "http://x").searchParams;
		return ok(
			historyAnswer(
				query.get("category") as ExpenseCategory,
				query.get("to") as Month,
			),
		);
	});
	route(network, "get", "/api/transactions/summary", () => ok(payeeSummary()));
});
afterEach(() => {
	for (const name of [VIEW_KEY, "daybook_wide"]) {
		document.cookie = `${name}=; Max-Age=0; Path=/`;
	}
	network.resetHandlers();
	onlineManager.setOnline(true);
	vi.useRealTimers();
	vi.restoreAllMocks();
	resetUnsavedChoices();
	window.localStorage.clear();
	// @ts-expect-error jsdom has none; some tests set one.
	delete window.matchMedia;
});
afterAll(() => network.close());

/** A window's width: jsdom has no `matchMedia`, which the page reads as a narrow window, with
 * the panel as a drawer. `wide` is 768 px up, where List or Table shows; `docked` is 1180 px
 * up, where the panel docks. */
function media({ wide = false, docked = false }) {
	window.matchMedia = vi.fn((query: string) => ({
		matches:
			(wide && query === "(min-width: 48rem)")
			|| (docked && query === "(min-width: 1180px)"),
		media: query,
		addEventListener: () => {},
		removeEventListener: () => {},
	})) as unknown as typeof window.matchMedia;
}

// The golden profile on the golden clock's day (TST-3).
const IN: BudgetsLocale = {
	today: "2026-11-02",
	currency: "INR",
	numberLocale: "hi-IN-u-nu-latn",
	dateLocale: "en-IN",
	timezone: "Asia/Kolkata",
};

/** A month with no Budget record and no spending: a new user's. */
const nothing = (month: Month): BudgetMonthAnswer => ({
	...monthAnswer(month),
	overall: { limitMinor: 0, spentMinor: 0, utilizationTenths: null, state: null },
	totalSpentMinor: 0,
	unbudgetedMinor: 0,
	unbudgeted: [],
	budgets: [],
	inactive: [],
});

/** Serves `/api/budgets` with golden's month views unless `months` says otherwise, and renders
 * the page at `search`. With `seed`, the month is in the cache as the server render leaves it. */
function renderPage(
	search = "",
	{
		months = (month: Month) => ok(monthAnswer(month)),
		seed,
	}: {
		months?: (month: Month) => Response | Promise<Response>;
		seed?: BudgetMonthAnswer;
	} = {},
) {
	const reads = route(network, "get", "/api/budgets", ({ path }) =>
		months(new URL(path, "http://x").searchParams.get("month") ?? "2026-11"),
	);
	const { calls, Url } = urlHarness(search);
	const queryClient = testClient();
	if (seed) queryClient.setQueryData(budgetKeys.month(seed.month), seed);
	const view = render(
		<AppProviders
			navigate={vi.fn()}
			queryClient={queryClient}
		>
			<Url>
				<BudgetsPage locale={IN} />
			</Url>
		</AppProviders>,
	);
	return { ...view, queryClient, reads, calls, user: userEvent.setup() };
}

const monthButton = (name: string) => screen.getByRole("button", { name });

function goOffline() {
	vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
	onlineManager.setOnline(false);
	act(() => {
		window.dispatchEvent(new Event("offline"));
	});
}

describe("the header (BR-F04-14)", () => {
	test("the title, the month control, List or Table, and Add a Budget", async () => {
		renderPage("?month=2026-10");
		expect(
			screen.getByRole("heading", { level: 1, name: "Budgets" }),
		).toBeVisible();
		expect(monthButton("Previous month")).toBeVisible();
		expect(monthButton("October 2026")).toBeVisible();
		expect(monthButton("Next month")).toBeVisible();
		expect(
			screen.getByRole("radiogroup", { name: "Show Budgets as" }),
		).toBeVisible();
		expect(screen.getAllByRole("button", { name: "Add a Budget" })).toHaveLength(
			2,
		);
		await screen.findByText("Budgets", { selector: "h1" });
	});

	test("the current month reads to date", () => {
		renderPage();
		expect(monthButton("November 2026 · to date")).toBeVisible();
	});

	test("the arrows move a month and write it to the URL", async () => {
		const { user, calls } = renderPage("?month=2026-10");
		await user.click(monthButton("Previous month"));
		expect(monthButton("September 2026")).toBeVisible();
		expect(calls.at(-1)).toEqual({
			mode: "push",
			href: "/budgets?month=2026-09",
		});
		await user.click(monthButton("Next month"));
		await user.click(monthButton("Next month"));
		expect(monthButton("November 2026 · to date")).toBeVisible();
		expect(calls.at(-1)).toEqual({ mode: "push", href: "/budgets" });
	});

	test("each month shown is read from the API once", async () => {
		const { user, reads } = renderPage("?month=2026-10");
		await waitFor(() => expect(reads).toHaveLength(1));
		await user.click(monthButton("Previous month"));
		await waitFor(() => expect(reads).toHaveLength(2));
		await user.click(monthButton("Next month"));
		expect(reads.map((each) => each.path)).toEqual([
			"/api/budgets?month=2026-10",
			"/api/budgets?month=2026-09",
		]);
	});

	// BR-F04-07, AC-F04-11
	test("Previous month stops at Nov 2023 and Next month at Nov 2027", () => {
		const { unmount } = renderPage("?month=2023-11");
		expect(monthButton("Previous month")).toHaveAttribute(
			"aria-disabled",
			"true",
		);
		expect(monthButton("Next month")).not.toHaveAttribute("aria-disabled");
		unmount();
		renderPage("?month=2027-11");
		expect(monthButton("Next month")).toHaveAttribute("aria-disabled", "true");
		expect(monthButton("Previous month")).not.toHaveAttribute("aria-disabled");
	});

	test("the month opens the grid, and a month picked there is shown", async () => {
		const { user, calls } = renderPage("?month=2026-10");
		await user.click(monthButton("October 2026"));
		const dialog = await screen.findByRole("dialog", { name: "Choose a month" });
		await user.click(
			within(dialog).getByRole("option", { name: /^March 2026/ }),
		);
		await waitFor(() =>
			expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
		);
		expect(monthButton("March 2026")).toBeVisible();
		expect(calls.at(-1)).toEqual({
			mode: "push",
			href: "/budgets?month=2026-03",
		});
	});

	test("This month in the grid goes back to the current month", async () => {
		const { user } = renderPage("?month=2026-10");
		await user.click(monthButton("October 2026"));
		await user.click(await screen.findByRole("button", { name: "This month" }));
		expect(monthButton("November 2026 · to date")).toBeVisible();
	});

	test("Escape closes the grid without changing the month", async () => {
		const { user, calls } = renderPage("?month=2026-10");
		await user.click(monthButton("October 2026"));
		await screen.findByRole("dialog");
		await user.keyboard("{Escape}");
		await waitFor(() =>
			expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
		);
		expect(calls).toEqual([]);
	});

	test("Add a Budget, either button, opens Add a Budget", async () => {
		const { user } = renderPage("?month=2026-10");
		await screen.findByText("Needs attention · 4");
		for (const at of [0, 1]) {
			await user.click(
				screen.getAllByRole("button", { name: "Add a Budget" })[
					at
				] as HTMLElement,
			);
			const dialog = await screen.findByRole("dialog", {
				name: "Add a Budget",
			});
			await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
			await waitFor(() =>
				expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
			);
		}
	});

	test("pressed before the month loads, Add a Budget opens once it has", async () => {
		let release = () => {};
		const held = new Promise<void>((resolve) => (release = resolve));
		const { user } = renderPage("?month=2026-10", {
			months: async (month) => {
				await held;
				return ok(monthAnswer(month));
			},
		});
		await user.click(
			screen.getAllByRole("button", {
				name: "Add a Budget",
			})[0] as HTMLElement,
		);
		expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
		release();
		expect(
			await screen.findByRole("dialog", { name: "Add a Budget" }),
		).toBeVisible();
	});

	test("below 768 px, Add is the icon button and the month control takes its own row", () => {
		renderPage("?month=2026-10");
		const [wide, icon] = screen.getAllByRole("button", { name: "Add a Budget" });
		expect(wide).toHaveClass("max-md:hidden");
		expect(icon).toHaveClass("md:hidden", "size-11");
		expect(
			screen.getByRole("radiogroup", { name: "Show Budgets as" }),
		).toHaveClass("max-md:hidden");
		const control = monthButton("October 2026").parentElement as HTMLElement;
		expect(control).toHaveClass("max-md:order-last", "max-md:w-full");
	});
});

describe("List or Table (BR-F04-14)", () => {
	test("List is chosen at first", () => {
		renderPage("?month=2026-10");
		expect(screen.getByRole("radio", { name: "List" })).toBeChecked();
	});

	test("a choice is remembered on the device", async () => {
		const { user } = renderPage("?month=2026-10");
		await user.click(screen.getByRole("radio", { name: "Table" }));
		expect(screen.getByRole("radio", { name: "Table" })).toBeChecked();
		expect(window.localStorage.getItem(VIEW_KEY)).toBe("table");
	});

	test("a remembered Table is chosen on the next visit", () => {
		window.localStorage.setItem(VIEW_KEY, "table");
		renderPage("?month=2026-10");
		expect(screen.getByRole("radio", { name: "Table" })).toBeChecked();
	});
});

describe("what the server draws from the device's cookies (D-629)", () => {
	/** The page as the server renders it, the month in the cache as the prefetch leaves it. */
	function serverHtml(props: {
		initialView?: "list" | "table";
		initialWide?: boolean;
	}) {
		const queryClient = testClient();
		queryClient.setQueryData(
			budgetKeys.month("2026-11"),
			monthAnswer("2026-11"),
		);
		const { Url } = urlHarness("");
		return renderToString(
			<AppProviders
				navigate={vi.fn()}
				queryClient={queryClient}
			>
				<Url>
					<BudgetsPage
						locale={IN}
						{...props}
					/>
				</Url>
			</AppProviders>,
		);
	}
	const CAPTION = "Select a column heading to sort";
	/** Only the list is a list box named Budgets. */
	const LIST = 'aria-label="Budgets"';

	// AC-F04-34
	test("a remembered Table in a wide window is drawn as the table at once", () => {
		const html = serverHtml({ initialView: "table", initialWide: true });
		expect(html).toContain(CAPTION);
		expect(html).not.toContain(LIST);
	});

	// AC-F04-34
	test("a remembered Table in a narrow window is drawn as the list, as it was last shown", () => {
		const html = serverHtml({ initialView: "table", initialWide: false });
		expect(html).not.toContain(CAPTION);
		expect(html).toContain(LIST);
	});

	test("a remembered List is the list in either window", () => {
		for (const initialWide of [true, false]) {
			const html = serverHtml({ initialView: "list", initialWide });
			expect(html).not.toContain(CAPTION);
			expect(html).toContain(LIST);
		}
	});

	test("with no cookies the server draws the list", () => {
		const html = serverHtml({});
		expect(html).not.toContain(CAPTION);
		expect(html).toContain(LIST);
	});

	test("the server checks Table in the switch when the cookie said so", () => {
		const html = serverHtml({ initialView: "table", initialWide: true });
		const tag = /<input[^>]*value="table"[^>]*>/.exec(html)![0];
		expect(tag).toContain("checked");
	});

	// AC-F04-34
	test("the browser keeps the server's view where storage holds none", () => {
		media({ wide: true, docked: true });
		const queryClient = testClient();
		queryClient.setQueryData(
			budgetKeys.month("2026-11"),
			monthAnswer("2026-11"),
		);
		const { Url } = urlHarness("");
		render(
			<AppProviders
				navigate={vi.fn()}
				queryClient={queryClient}
			>
				<Url>
					<BudgetsPage
						locale={IN}
						initialView="table"
						initialWide
					/>
				</Url>
			</AppProviders>,
		);
		expect(screen.getByRole("radio", { name: "Table" })).toBeChecked();
	});

	test("storage outranks the cookie where it holds a choice", () => {
		media({ wide: true, docked: true });
		window.localStorage.setItem(VIEW_KEY, "list");
		const queryClient = testClient();
		queryClient.setQueryData(
			budgetKeys.month("2026-11"),
			monthAnswer("2026-11"),
		);
		const { Url } = urlHarness("");
		render(
			<AppProviders
				navigate={vi.fn()}
				queryClient={queryClient}
			>
				<Url>
					<BudgetsPage
						locale={IN}
						initialView="table"
						initialWide
					/>
				</Url>
			</AppProviders>,
		);
		expect(screen.getByRole("radio", { name: "List" })).toBeChecked();
	});

	// AC-F04-34
	test("the page keeps the view and the window class in cookies for the next visit", async () => {
		media({ wide: true, docked: true });
		const { user } = renderPage("?month=2026-10");
		await user.click(screen.getByRole("radio", { name: "Table" }));
		expect(document.cookie).toContain(`${VIEW_KEY}=table`);
		expect(document.cookie).toContain("daybook_wide=wide");
	});

	test("a narrow window is kept as narrow", () => {
		media({ wide: false });
		renderPage("?month=2026-10");
		expect(document.cookie).toContain("daybook_wide=narrow");
	});

	test("the list or table switch is hidden below 768 px by CSS, whatever the cookie said", () => {
		const html = serverHtml({ initialView: "table", initialWide: false });
		expect(html).toContain("max-md:hidden");
	});
});

describe("the Table view (BR-F04-18, D-570)", () => {
	/** A window at least 1180 px wide, where List or Table shows and the panel docks; or, with
	 * `false`, a phone's. */
	const wide = (matches = true) => media({ wide: matches, docked: matches });

	const table = () =>
		screen.queryByRole("grid", { name: /Select a column heading to sort/ });
	const rowOf = (key: string) =>
		document.querySelector<HTMLElement>(
			`[role="row"][data-key="${key}"]`,
		) as HTMLElement;

	test("choosing Table shows the month as a table, under the overview", async () => {
		wide();
		const { user } = renderPage("?month=2026-10");
		await screen.findByText("Needs attention · 4");
		await user.click(screen.getByRole("radio", { name: "Table" }));
		expect(
			screen.getByRole("grid", {
				name: "October 2026. Select a column heading to sort.",
			}),
		).toBeVisible();
		expect(screen.queryByText("Needs attention · 4")).not.toBeInTheDocument();
		expect(screen.getByText("Budgeted spending in October")).toBeVisible();
	});

	// BR-F04-18, D-570
	test("a sort holds across months, a month that still loads between them included", async () => {
		wide();
		window.localStorage.setItem(VIEW_KEY, "table");
		const { user } = renderPage("?month=2026-10", {
			months: async (month) => {
				// September has not been read: the page shows its skeleton while it loads.
				if (month === "2026-09") await delay(150);
				return ok(monthAnswer(month));
			},
		});
		await waitFor(() => expect(table()).toBeVisible());
		const spent = screen.getByRole("columnheader", { name: "Spent" });
		await user.click(spent);
		expect(spent).toHaveAttribute("aria-sort", "descending");

		await user.click(screen.getByRole("button", { name: "Previous month" }));
		// The table gave way to the loading page and is back, still sorted by Spent.
		await waitFor(() =>
			expect(
				screen.getByRole("grid", {
					name: "September 2026. Select a column heading to sort.",
				}),
			).toBeVisible(),
		);
		expect(screen.getByRole("columnheader", { name: "Spent" })).toHaveAttribute(
			"aria-sort",
			"descending",
		);
		// September: food 5,050.00, shopping 2,400.00, entertainment 649.00.
		const keys = within(table() as HTMLElement)
			.getAllByRole("row")
			.slice(1, 4)
			.map((row) => row.getAttribute("data-key"));
		expect(keys).toEqual([
			"budget:food",
			"budget:shopping",
			"budget:entertainment",
		]);
	});

	test("a remembered Table shows on the next visit, and List brings the list back", async () => {
		wide();
		window.localStorage.setItem(VIEW_KEY, "table");
		const { user } = renderPage("?month=2026-10");
		await waitFor(() => expect(table()).toBeVisible());
		await user.click(screen.getByRole("radio", { name: "List" }));
		expect(table()).not.toBeInTheDocument();
		expect(screen.getByText("Needs attention · 4")).toBeVisible();
	});

	test("below 768 px, where the switch is hidden, a remembered Table shows the list", async () => {
		wide(false);
		window.localStorage.setItem(VIEW_KEY, "table");
		renderPage("?month=2026-10");
		expect(await screen.findByText("Needs attention · 4")).toBeVisible();
		expect(table()).not.toBeInTheDocument();
	});

	test("a month with no Budget shows the list instead, with its Not budgeted rows", async () => {
		wide();
		window.localStorage.setItem(VIEW_KEY, "table");
		renderPage("?month=2026-10", {
			months: (month) =>
				ok({
					...monthAnswer(month),
					overall: {
						limitMinor: 0,
						spentMinor: 0,
						utilizationTenths: null,
						state: null,
					},
					budgets: [],
					inactive: [],
				}),
		});
		expect(await screen.findByText("Not budgeted · 1")).toBeVisible();
		expect(table()).not.toBeInTheDocument();
	});

	// AC-F04-26
	test("the counts filter the table: Over budget keeps the total and hides housing; On track gives the empty text", async () => {
		wide();
		window.localStorage.setItem(VIEW_KEY, "table");
		const { user } = renderPage("?month=2026-10");
		await waitFor(() => expect(table()).toBeVisible());
		await user.click(screen.getByRole("button", { name: /^Over budget/ }));
		expect(rowOf("budget:entertainment")).toBeVisible();
		expect(rowOf("budget:food")).toBeVisible();
		expect(rowOf("total")).toHaveTextContent("₹13,168.00");
		expect(rowOf("total")).toHaveTextContent("₹11,000.00");
		expect(rowOf("unbudgeted:housing")).toBeNull();
		expect(rowOf("budget:shopping")).toBeNull();
		await user.click(screen.getByRole("button", { name: /^On track/ }));
		expect(
			screen.getByText("No Budgets are on track in October 2026."),
		).toBeVisible();
		expect(table()).not.toBeInTheDocument();
	});

	test("the filter and the selection carry over between List and Table", async () => {
		wide();
		const { user } = renderPage("?month=2026-10");
		await screen.findByText("Needs attention · 4");
		await user.click(rowOf("budget:food"));
		await user.click(screen.getByRole("button", { name: /^Over budget/ }));
		await user.click(screen.getByRole("radio", { name: "Table" }));
		expect(rowOf("budget:food")).toHaveAttribute("aria-selected", "true");
		expect(rowOf("budget:shopping")).toBeNull();
		expect(screen.getByText("Showing")).toBeVisible();
		await user.click(screen.getByRole("radio", { name: "List" }));
		expect(rowOf("budget:food")).toHaveAttribute("aria-selected", "true");
		expect(screen.getByText("Needs attention · 2")).toBeVisible();
	});

	// AC-F04-29
	test("a selection in the table stays across months while its category shows", async () => {
		wide();
		window.localStorage.setItem(VIEW_KEY, "table");
		const { user } = renderPage("?month=2026-10");
		await waitFor(() => expect(table()).toBeVisible());
		await user.click(rowOf("budget:food"));
		await user.click(monthButton("Previous month"));
		expect(
			await screen.findByRole("grid", {
				name: "September 2026. Select a column heading to sort.",
			}),
		).toBeVisible();
		expect(rowOf("budget:food")).toHaveAttribute("aria-selected", "true");
	});

	// BR-F04-32
	test("Down on the page selects the table's first row", async () => {
		wide();
		window.localStorage.setItem(VIEW_KEY, "table");
		const { user } = renderPage("?month=2026-10");
		await waitFor(() => expect(table()).toBeVisible());
		await user.click(screen.getByRole("heading", { level: 1, name: "Budgets" }));
		await user.keyboard("{ArrowDown}");
		expect(rowOf("budget:entertainment")).toHaveAttribute(
			"aria-selected",
			"true",
		);
		expect(rowOf("budget:entertainment")).toHaveFocus();
	});
});

describe("the invalid-link notice (FIL-5, D-566)", () => {
	test("a month outside the range shows the current month with the notice, and cleans the URL", async () => {
		const { calls } = renderPage("?month=2030-01");
		expect(
			await screen.findByText(
				"Some filters in this link weren't valid and were removed.",
			),
		).toBeVisible();
		expect(monthButton("November 2026 · to date")).toBeVisible();
		await waitFor(() =>
			expect(calls).toEqual([{ mode: "replace", href: "/budgets" }]),
		);
	});

	test("Dismiss hides the notice", async () => {
		const { user } = renderPage("?month=bad");
		await user.click(await screen.findByRole("button", { name: "Dismiss" }));
		expect(
			screen.queryByText(
				"Some filters in this link weren't valid and were removed.",
			),
		).not.toBeInTheDocument();
	});

	test("changing the month hides it", async () => {
		const { user } = renderPage("?month=bad");
		await screen.findByRole("button", { name: "Dismiss" });
		await user.click(monthButton("Previous month"));
		expect(
			screen.queryByRole("button", { name: "Dismiss" }),
		).not.toBeInTheDocument();
	});

	test("a valid link shows no notice", () => {
		renderPage("?month=2026-10");
		expect(
			screen.queryByRole("button", { name: "Dismiss" }),
		).not.toBeInTheDocument();
	});
});

describe("the page's states (section 6)", () => {
	test("while the month loads, a skeleton overview and three skeleton rows", () => {
		renderPage("?month=2026-10", {
			months: () => new Promise<Response>(() => {}) as never,
		});
		const loading = screen.getByRole("status", { name: "Loading Budgets" });
		expect(loading).toHaveAttribute("aria-busy", "true");
	});

	test("a month with Budgets shows no empty or error message", async () => {
		const { reads } = renderPage("?month=2026-10");
		await waitFor(() => expect(reads).toHaveLength(1));
		await waitFor(() =>
			expect(
				screen.queryByRole("status", { name: "Loading Budgets" }),
			).not.toBeInTheDocument(),
		);
		expect(screen.queryByText(/^No Budgets for/)).not.toBeInTheDocument();
		expect(
			screen.queryByText("Budgets could not be loaded."),
		).not.toBeInTheDocument();
	});

	test("a month the server prefetched shows at once, with no request", async () => {
		const { reads } = renderPage("?month=2026-10", {
			seed: monthAnswer("2026-10"),
		});
		expect(
			screen.queryByRole("status", { name: "Loading Budgets" }),
		).not.toBeInTheDocument();
		await new Promise((resolve) => setTimeout(resolve, 30));
		expect(reads).toHaveLength(0);
	});

	// F04 section 5: golden August has no Budget and no spending.
	test("a new user's month shows only the message and Add a Budget", async () => {
		const { user } = renderPage("?month=2026-08", {
			months: (month) => ok(nothing(month)),
		});
		expect(await screen.findByText("No Budgets for August 2026.")).toBeVisible();
		expect(
			screen.getByText("Budgets apply from the month you choose."),
		).toBeVisible();
		const adds = screen.getAllByRole("button", { name: "Add a Budget" });
		expect(adds).toHaveLength(3);
		await user.click(adds[2] as HTMLElement);
		expect(
			await screen.findByRole("dialog", { name: "Add a Budget" }),
		).toBeVisible();
	});

	// F04 section 5: golden September has spending but transportation starts in October;
	// a month with records but no limit shows the same message.
	test("a month with no Budget shows the empty message", async () => {
		renderPage("?month=2026-10", {
			months: (month) => ok({ ...monthAnswer(month), budgets: [] }),
		});
		expect(
			await screen.findByText("No Budgets for October 2026."),
		).toBeVisible();
	});

	test("a failed load says so, and Retry asks again", async () => {
		let fail = true;
		const { user, reads } = renderPage("?month=2026-10", {
			months: (month) =>
				fail ? refuse(500, "internal") : ok(monthAnswer(month)),
		});
		expect(
			await screen.findByText("Budgets could not be loaded."),
		).toBeVisible();
		expect(
			screen.getByText(
				"Check your connection, then try again. Your Budgets are safe.",
			),
		).toBeVisible();
		fail = false;
		await user.click(screen.getByRole("button", { name: "Retry" }));
		await waitFor(() =>
			expect(
				screen.queryByText("Budgets could not be loaded."),
			).not.toBeInTheDocument(),
		);
		expect(reads).toHaveLength(2);
	});

	test("no answer at all is the error state too", async () => {
		renderPage("?month=2026-10", { months: () => HttpResponse.error() });
		expect(
			await screen.findByText("Budgets could not be loaded."),
		).toBeVisible();
	});

	test("the header stays usable in the error state", async () => {
		const { user } = renderPage("?month=2026-10", {
			months: () => refuse(500, "internal"),
		});
		await screen.findByText("Budgets could not be loaded.");
		await user.click(monthButton("Previous month"));
		expect(monthButton("September 2026")).toBeVisible();
	});
});

describe("offline (section 10)", () => {
	test('the current month stays, with "as of" the time it was loaded', async () => {
		vi.useFakeTimers({
			toFake: ["Date"],
			now: new Date("2026-11-02T06:30:00.000Z"),
		});
		renderPage("", { seed: monthAnswer("2026-11") });
		await waitFor(() =>
			expect(
				screen.queryByRole("status", { name: "Loading Budgets" }),
			).not.toBeInTheDocument(),
		);
		goOffline();
		expect(screen.getByText("as of 12:00 pm")).toBeVisible();
		expect(
			screen.queryByText(/isn't saved on this device/),
		).not.toBeInTheDocument();
	});

	test('online, there is no "as of"', () => {
		renderPage("", { seed: monthAnswer("2026-11") });
		expect(screen.queryByText(/^as of /)).not.toBeInTheDocument();
	});

	test("another month says it isn't kept, and Go to November goes back", async () => {
		const { user, calls } = renderPage("?month=2026-10", {
			seed: monthAnswer("2026-10"),
		});
		goOffline();
		expect(
			screen.getByText(
				"You're offline. This month isn't saved on this device.",
			),
		).toBeVisible();
		expect(
			screen.getByText("Only November 2026 is kept for offline use."),
		).toBeVisible();
		await user.click(screen.getByRole("button", { name: "Go to November" }));
		expect(calls.at(-1)).toEqual({ mode: "push", href: "/budgets" });
		expect(monthButton("November 2026 · to date")).toBeVisible();
	});

	test("the current month with nothing loaded and no connection is the error state", async () => {
		goOffline();
		const { reads } = renderPage("");
		expect(
			await screen.findByText("Budgets could not be loaded."),
		).toBeVisible();
		expect(reads).toHaveLength(0);
	});

	test("coming back online shows the month again", async () => {
		renderPage("?month=2026-10", { seed: monthAnswer("2026-10") });
		goOffline();
		expect(screen.getByText(/isn't saved on this device/)).toBeVisible();
		vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
		onlineManager.setOnline(true);
		act(() => {
			window.dispatchEvent(new Event("online"));
		});
		expect(
			screen.queryByText(/isn't saved on this device/),
		).not.toBeInTheDocument();
	});
});

describe("the overview and the list (BR-F04-15)", () => {
	const rowOf = (key: string) =>
		document.querySelector<HTMLElement>(
			`[role="row"][data-key="${key}"]`,
		) as HTMLElement;

	// F04 section 5: the October page.
	test("golden October shows the overview, then Needs attention and Not budgeted", async () => {
		renderPage("?month=2026-10");
		expect(
			await screen.findByText("Budgeted spending in October"),
		).toBeVisible();
		expect(screen.getByText("Needs attention · 4")).toBeVisible();
		expect(screen.getByText("Not budgeted · 1")).toBeVisible();
		expect(screen.queryByText(/^Blue: day/)).not.toBeInTheDocument();
		expect(document.querySelector('[data-part="today"]')).toBeNull();
	});

	// The golden clock's day 2 of November.
	test("the current month marks today in the overview and on each bar", async () => {
		renderPage("", { seed: monthAnswer("2026-11") });
		expect(await screen.findByText("Blue: day 2 of 30")).toBeVisible();
		expect(
			rowOf("budget:food").querySelector('[data-part="today"]'),
		).not.toBeNull();
	});

	// Section 6: golden September with no limits still has spending and a record.
	test("a month with no Budget shows the message, with Not budgeted and Not active under it", async () => {
		renderPage("?month=2026-09", {
			months: (month) => ok({ ...monthAnswer(month), budgets: [] }),
		});
		expect(
			await screen.findByText("No Budgets for September 2026."),
		).toBeVisible();
		expect(screen.queryByText(/^Budgeted spending/)).not.toBeInTheDocument();
		expect(screen.getByText("Not budgeted · 3")).toBeVisible();
		expect(
			screen.getByRole("button", { name: "Not active this month · 1" }),
		).toBeVisible();
	});

	test("Add a Budget on a Not budgeted row opens Add with that category chosen", async () => {
		const { user } = renderPage("?month=2026-10");
		await screen.findByText("Not budgeted · 1");
		await user.click(
			within(rowOf("unbudgeted:housing")).getByRole("button", {
				name: "Add a Budget",
			}),
		);
		const dialog = await screen.findByRole("dialog", { name: "Add a Budget" });
		expect(
			within(dialog).getByRole("radio", { name: /^Housing/ }),
		).toBeChecked();
	});

	test("the header's Add a Budget opens Add with no category chosen", async () => {
		const { user } = renderPage("?month=2026-10");
		await screen.findByText("Needs attention · 4");
		await user.click(
			screen.getAllByRole("button", {
				name: "Add a Budget",
			})[0] as HTMLElement,
		);
		const dialog = await screen.findByRole("dialog", { name: "Add a Budget" });
		const tiles = within(
			within(dialog).getByRole("radiogroup", { name: "Category" }),
		).getAllByRole("radio");
		expect(tiles.every((tile) => !(tile as HTMLInputElement).checked)).toBe(
			true,
		);
	});
});

describe("the state filter on the page (BR-F04-31)", () => {
	// AC-F04-26
	test("a count filters the list, and changing the month clears it", async () => {
		const { user } = renderPage("?month=2026-10");
		await user.click(
			await screen.findByRole("button", { name: /^Over budget/ }),
		);
		expect(screen.getByText("Showing")).toBeVisible();
		expect(screen.getByText("Needs attention · 2")).toBeVisible();
		await user.click(monthButton("Previous month"));
		expect(await screen.findByText("Needs attention · 2")).toBeVisible();
		expect(screen.queryByText("Showing")).not.toBeInTheDocument();
		expect(screen.getByRole("button", { name: /^Over budget/ })).toHaveAttribute(
			"aria-pressed",
			"false",
		);
		await user.click(monthButton("Next month"));
		expect(await screen.findByText("Needs attention · 4")).toBeVisible();
		expect(screen.queryByText("Showing")).not.toBeInTheDocument();
	});

	// AC-F04-26
	test("a state with no Budget shows the empty text, and Show all Budgets clears it", async () => {
		const { user } = renderPage("?month=2026-10");
		await user.click(await screen.findByRole("button", { name: /^On track/ }));
		expect(
			screen.getByText("No Budgets are on track in October 2026."),
		).toBeVisible();
		await user.click(screen.getByRole("button", { name: "Show all Budgets" }));
		expect(screen.getByText("Needs attention · 4")).toBeVisible();
	});
});

describe("the selection across months (BR-F04-17, D-249)", () => {
	beforeEach(() => media({ wide: true, docked: true }));
	const rowOf = (key: string) =>
		document.querySelector<HTMLElement>(
			`[role="row"][data-key="${key}"]`,
		) as HTMLElement;

	// AC-F04-29
	test("Food selected in October stays selected in September", async () => {
		const { user } = renderPage("?month=2026-10");
		await screen.findByText("Needs attention · 4");
		await user.click(rowOf("budget:food"));
		await user.click(monthButton("Previous month"));
		await screen.findByText("Needs attention · 2");
		expect(rowOf("budget:food")).toHaveAttribute("aria-selected", "true");
	});

	// AC-F04-29: on golden, August has rows (food, shopping, entertainment and transportation,
	// Not active) but no housing, so only the selection can explain housing clearing.
	test("housing selected in October clears in August, where other rows still show", async () => {
		const { user } = renderPage("?month=2026-10");
		await screen.findByText("Not budgeted · 1");
		await user.click(rowOf("unbudgeted:housing"));
		expect(rowOf("unbudgeted:housing")).toHaveAttribute("aria-selected", "true");
		await user.click(monthButton("Previous month"));
		await user.click(monthButton("Previous month"));
		// Food, shopping, entertainment and transportation show as Not active, so this is no
		// empty month; housing is nowhere, and the selection went with it.
		expect(
			await screen.findByRole("button", { name: "Not active this month · 4" }),
		).toBeVisible();
		expect(rowOf("unbudgeted:housing")).not.toBeInTheDocument();
		expect(screen.queryByText("Housing")).not.toBeInTheDocument();
		// Back in October it is not selected any more.
		await user.click(monthButton("Next month"));
		await user.click(monthButton("Next month"));
		await screen.findByText("Not budgeted · 1");
		expect(rowOf("unbudgeted:housing")).toHaveAttribute(
			"aria-selected",
			"false",
		);
	});

	// BR-F04-32
	test("Escape on the page clears the selection", async () => {
		const { user } = renderPage("?month=2026-10");
		await screen.findByText("Needs attention · 4");
		await user.click(rowOf("budget:food"));
		await user.click(screen.getByRole("heading", { level: 1, name: "Budgets" }));
		await user.keyboard("{Escape}");
		expect(rowOf("budget:food")).toHaveAttribute("aria-selected", "false");
	});

	// BR-F04-32
	test("Down on the page selects the first row and focuses it", async () => {
		const { user } = renderPage("?month=2026-10");
		await screen.findByText("Needs attention · 4");
		await user.click(screen.getByRole("heading", { level: 1, name: "Budgets" }));
		await user.keyboard("{ArrowDown}");
		expect(rowOf("budget:entertainment")).toHaveAttribute(
			"aria-selected",
			"true",
		);
		expect(rowOf("budget:entertainment")).toHaveFocus();
	});
});

describe("the panel (BR-F04-30, D-571)", () => {
	const rowOf = (key: string) =>
		document.querySelector<HTMLElement>(
			`[role="row"][data-key="${key}"]`,
		) as HTMLElement;
	const panel = () =>
		screen.queryByRole("complementary", { name: "Budget details" });
	const drawer = () => screen.queryByRole("dialog", { name: "Budget details" });

	describe("docked, from 1180 px", () => {
		beforeEach(() => media({ wide: true, docked: true }));

		test("beside the list, the month's summary", async () => {
			const { container } = renderPage("?month=2026-10");
			await screen.findByText("Needs attention · 4");
			expect(panel()).toBeVisible();
			expect(
				within(panel() as HTMLElement).getByRole("region", {
					name: "Compared with September",
				}),
			).toBeVisible();
			expect(container.firstElementChild).toHaveClass("dock:grid");
		});

		test("while the month loads, the panel has the summary's shape for that month", async () => {
			renderPage("?month=2026-10");
			const loading = within(panel() as HTMLElement);
			expect(
				loading.getByRole("heading", { level: 2, name: "October 2026" }),
			).toBeVisible();
			expect(
				loading.getByRole("region", { name: "Compared with September" }),
			).not.toHaveTextContent("₹");
			await screen.findByText("Needs attention · 4");
			expect(
				within(panel() as HTMLElement).getByRole("region", {
					name: "Compared with September",
				}),
			).toHaveTextContent("₹13,168.00");
		});

		test("with a selection, a month that is still loading keeps the selection's shape", async () => {
			let release = () => {};
			const held = new Promise<void>((resolve) => (release = resolve));
			const { user } = renderPage("?month=2026-10", {
				months: async (month) => {
					if (month === "2026-11") await held;
					return ok(monthAnswer(month));
				},
			});
			await screen.findByText("Needs attention · 4");
			await user.click(rowOf("budget:food"));
			await user.click(monthButton("Next month"));
			const loading = panel() as HTMLElement;
			expect(within(loading).getByText("Food")).toBeVisible();
			expect(
				within(loading).queryByRole("heading", { level: 2 }),
			).not.toBeInTheDocument();
			release();
			expect(
				await within(loading).findByRole("heading", {
					level: 2,
					name: "Budget",
				}),
			).toBeVisible();
		});

		test("selecting a row shows it; selecting it again goes back to the summary", async () => {
			const { user } = renderPage("?month=2026-10");
			await screen.findByText("Needs attention · 4");
			await user.click(rowOf("budget:food"));
			const details = panel() as HTMLElement;
			expect(
				within(details).getByRole("heading", { level: 2, name: "Budget" }),
			).toBeVisible();
			expect(
				await within(details).findByRole("link", {
					name: "See 4 Transactions",
				}),
			).toHaveAttribute(
				"href",
				"/transactions?from=2026-10-01&to=2026-10-31&cat=food",
			);
			await user.click(rowOf("budget:food"));
			expect(
				within(details).getByRole("region", {
					name: "Compared with September",
				}),
			).toBeVisible();
		});

		test("Close details clears the selection", async () => {
			const { user } = renderPage("?month=2026-10");
			await screen.findByText("Needs attention · 4");
			await user.click(rowOf("budget:food"));
			await user.click(screen.getByRole("button", { name: "Close details" }));
			expect(rowOf("budget:food")).toHaveAttribute("aria-selected", "false");
			expect(
				screen.getByRole("region", { name: "Compared with September" }),
			).toBeVisible();
		});

		// BR-F04-32
		test("Up and Down select, and the panel follows", async () => {
			const { user } = renderPage("?month=2026-10");
			await screen.findByText("Needs attention · 4");
			await user.click(
				screen.getByRole("heading", { level: 1, name: "Budgets" }),
			);
			await user.keyboard("{ArrowDown}{ArrowDown}");
			expect(rowOf("budget:food")).toHaveAttribute("aria-selected", "true");
			expect(
				await within(panel() as HTMLElement).findByRole("region", {
					name: "Where it went in October",
				}),
			).toBeVisible();
		});

		test("Not budgeted September transportation shows as Not budgeted with its history", async () => {
			const { user } = renderPage("?month=2026-09");
			await screen.findByText("Not budgeted · 3");
			await user.click(rowOf("unbudgeted:transportation"));
			expect(
				within(panel() as HTMLElement).getByRole("heading", {
					level: 2,
					name: "Not budgeted",
				}),
			).toBeVisible();
			expect(
				screen.getByRole("region", { name: "Limit history" }),
			).toBeVisible();
			await screen.findByRole("region", { name: "Last 6 months" });
		});
	});

	describe("left out", () => {
		beforeEach(() => media({ wide: true, docked: true }));

		test("in the error state", async () => {
			const { container } = renderPage("?month=2026-10", {
				months: () => refuse(500, "internal"),
			});
			await screen.findByText("Budgets could not be loaded.");
			expect(panel()).not.toBeInTheDocument();
			expect(container.firstElementChild).not.toHaveClass("dock:grid");
		});

		test("for a new user", async () => {
			renderPage("?month=2026-08", {
				months: (month) => ok(nothing(month)),
			});
			await screen.findByText("No Budgets for August 2026.");
			expect(panel()).not.toBeInTheDocument();
		});

		test("offline in another month", async () => {
			renderPage("?month=2026-10", { seed: monthAnswer("2026-10") });
			goOffline();
			expect(
				await screen.findByText(
					"You're offline. This month isn't saved on this device.",
				),
			).toBeVisible();
			expect(panel()).not.toBeInTheDocument();
		});

		test("a month with no Budget but other rows keeps it", async () => {
			renderPage("?month=2026-08", {
				months: (month) => ok(monthAnswer(month)),
			});
			await screen.findByText("No Budgets for August 2026.");
			expect(panel()).toBeVisible();
		});
	});

	describe("a drawer, below 1180 px", () => {
		beforeEach(() => media({ wide: true }));

		test("no panel shows until a row is selected, and a click opens the drawer", async () => {
			const { user } = renderPage("?month=2026-10");
			await screen.findByText("Needs attention · 4");
			expect(panel()).not.toBeInTheDocument();
			expect(drawer()).not.toBeInTheDocument();
			await user.click(rowOf("budget:food"));
			const open = await screen.findByRole("dialog", {
				name: "Budget details",
			});
			expect(open).toHaveTextContent(
				"L to change limit · S to stop · Delete to delete · Esc to close",
			);
			await within(open).findByRole("region", { name: "Last 6 months" });
		});

		test("Escape closes it and clears the selection", async () => {
			const { user } = renderPage("?month=2026-10");
			await screen.findByText("Needs attention · 4");
			await user.click(rowOf("budget:food"));
			await screen.findByRole("dialog", { name: "Budget details" });
			await user.keyboard("{Escape}");
			await waitFor(() => expect(drawer()).not.toBeInTheDocument());
			expect(rowOf("budget:food")).toHaveAttribute("aria-selected", "false");
		});

		test("opened from the keyboard, it gives focus back to the row when it closes", async () => {
			const { user } = renderPage("?month=2026-10");
			await screen.findByText("Needs attention · 4");
			await user.click(
				screen.getByRole("heading", { level: 1, name: "Budgets" }),
			);
			await user.keyboard("{ArrowDown}{ArrowDown}{Enter}");
			const open = await screen.findByRole("dialog", {
				name: "Budget details",
			});
			await user.click(
				within(open).getByRole("button", { name: "Close details" }),
			);
			await waitFor(() => expect(drawer()).not.toBeInTheDocument());
			expect(rowOf("budget:food")).toHaveAttribute("aria-selected", "false");
			await waitFor(() => expect(rowOf("budget:food")).toHaveFocus());
		});

		// BR-F04-32, D-571
		test("Down only moves focus; Enter selects and opens the drawer", async () => {
			const { user } = renderPage("?month=2026-10");
			await screen.findByText("Needs attention · 4");
			await user.click(
				screen.getByRole("heading", { level: 1, name: "Budgets" }),
			);
			await user.keyboard("{ArrowDown}{ArrowDown}");
			expect(rowOf("budget:food")).toHaveFocus();
			expect(rowOf("budget:food")).toHaveAttribute("aria-selected", "false");
			expect(drawer()).not.toBeInTheDocument();
			await user.keyboard("{Enter}");
			expect(
				await screen.findByRole("dialog", { name: "Budget details" }),
			).toBeVisible();
			expect(rowOf("budget:food")).toHaveAttribute("aria-selected", "true");
		});

		// D-571
		test("while the drawer is open, Up and Down leave the selection alone", async () => {
			const { user } = renderPage("?month=2026-10");
			await screen.findByText("Needs attention · 4");
			await user.click(rowOf("budget:food"));
			const open = await screen.findByRole("dialog", {
				name: "Budget details",
			});
			await within(open).findByRole("region", { name: "Last 6 months" });
			await user.keyboard("{ArrowDown}{ArrowDown}");
			expect(rowOf("budget:food")).toHaveAttribute("aria-selected", "true");
			expect(open.contains(document.activeElement)).toBe(true);
			// The keys stay the drawer's own, so it can scroll with them.
			expect(
				fireEvent.keyDown(document.activeElement as Element, {
					key: "ArrowDown",
				}),
			).toBe(true);
		});
	});

	describe("L opens Change limit (BR-F04-32)", () => {
		beforeEach(() => media({ wide: true, docked: true }));

		test("for a selected Budget", async () => {
			const { user } = renderPage("?month=2026-10");
			await screen.findByText("Needs attention · 4");
			await user.click(rowOf("budget:food"));
			await user.click(
				screen.getByRole("heading", { level: 1, name: "Budgets" }),
			);
			await user.keyboard("l");
			expect(
				await screen.findByRole("dialog", { name: "Change the Food limit" }),
			).toBeVisible();
		});

		test("for a Not budgeted category with a Budget record: September transportation", async () => {
			const { user } = renderPage("?month=2026-09");
			await screen.findByText("Not budgeted · 3");
			await user.click(rowOf("unbudgeted:transportation"));
			await user.click(
				screen.getByRole("heading", { level: 1, name: "Budgets" }),
			);
			await user.keyboard("L");
			expect(
				await screen.findByRole("dialog", {
					name: "Change the Transportation limit",
				}),
			).toBeVisible();
		});

		test("not for a category with no Budget record, nor with nothing selected", async () => {
			const { user } = renderPage("?month=2026-09");
			await screen.findByText("Not budgeted · 3");
			await user.click(
				screen.getByRole("heading", { level: 1, name: "Budgets" }),
			);
			await user.keyboard("l");
			await user.click(rowOf("unbudgeted:health"));
			await user.click(
				screen.getByRole("heading", { level: 1, name: "Budgets" }),
			);
			await user.keyboard("l");
			expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
			await screen.findByRole("region", { name: "Last 6 months" });
		});

		test("from inside the drawer", async () => {
			media({ wide: true });
			const { user } = renderPage("?month=2026-10");
			await screen.findByText("Needs attention · 4");
			await user.click(rowOf("budget:food"));
			const open = await screen.findByRole("dialog", {
				name: "Budget details",
			});
			await within(open).findByRole("region", { name: "Last 6 months" });
			await user.keyboard("l");
			expect(
				await screen.findByRole("dialog", { name: "Change the Food limit" }),
			).toBeVisible();
		});
	});
});

describe("the dialogs (BR-F04-19 to BR-F04-21, BR-F04-06)", () => {
	beforeEach(() => media({ wide: true, docked: true }));

	const rowOf = (key: string) =>
		document.querySelector<HTMLElement>(
			`[role="row"][data-key="${key}"]`,
		) as HTMLElement;
	const panelButton = (name: string) =>
		within(
			screen.getByRole("complementary", { name: "Budget details" }),
		).getByRole("button", { name });

	test("the panel's Change limit, Stop and Delete open their dialogs for the selection", async () => {
		const { user } = renderPage("?month=2026-10");
		await screen.findByText("Needs attention · 4");
		await user.click(rowOf("budget:food"));
		for (const [name, title] of [
			["Change limit", "Change the Food limit"],
			["Stop", "Stop budgeting Food"],
		] as const) {
			await user.click(panelButton(name));
			const dialog = await screen.findByRole("dialog", { name: title });
			await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
			await waitFor(() =>
				expect(
					screen.queryByRole("dialog", { name: title }),
				).not.toBeInTheDocument(),
			);
		}
		await user.click(panelButton("Delete"));
		expect(
			await screen.findByRole("alertdialog", {
				name: "Delete the Food Budget?",
			}),
		).toBeVisible();
	});

	test("a Not active row's Change limit and Delete open for its Budget", async () => {
		const { user } = renderPage("?month=2026-09");
		await screen.findByText("Not budgeted · 3");
		await user.click(
			screen.getByRole("button", { name: "Not active this month · 1" }),
		);
		const row = rowOf("inactive:transportation");
		await user.click(within(row).getByRole("button", { name: "Change limit" }));
		const dialog = await screen.findByRole("dialog", {
			name: "Change the Transportation limit",
		});
		expect(within(dialog).getByRole("textbox")).toHaveValue("2,000.00");
		await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
		await waitFor(() =>
			expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
		);
		await user.click(
			within(rowOf("inactive:transportation")).getByRole("button", {
				name: "Delete",
			}),
		);
		expect(
			await screen.findByRole("alertdialog", {
				name: "Delete the Transportation Budget?",
			}),
		).toBeVisible();
	});

	test("Stop that would remove every month turns into the Delete confirmation", async () => {
		const { user } = renderPage("?month=2026-10");
		await screen.findByText("Needs attention · 4");
		await user.click(rowOf("budget:food"));
		await user.click(panelButton("Stop"));
		const dialog = await screen.findByRole("dialog", {
			name: "Stop budgeting Food",
		});
		await user.click(within(dialog).getByRole("radio", { name: "Other month" }));
		await user.click(screen.getByRole("option", { name: /September/ }));
		await user.click(
			within(dialog).getByRole("button", { name: "Delete Budget instead" }),
		);
		expect(
			await screen.findByRole("alertdialog", {
				name: "Delete the Food Budget?",
			}),
		).toBeVisible();
		expect(
			screen.queryByRole("dialog", { name: "Stop budgeting Food" }),
		).not.toBeInTheDocument();
	});

	test("a confirmed change closes the dialog and the month is read again", async () => {
		const patches = route(network, "patch", "/api/budgets/:id", () =>
			ok(budgetAnswer("food", { version: 2 })),
		);
		const { user, reads } = renderPage("?month=2026-10");
		await screen.findByText("Needs attention · 4");
		const before = reads.length;
		await user.click(rowOf("budget:food"));
		await user.click(panelButton("Change limit"));
		const dialog = await screen.findByRole("dialog", {
			name: "Change the Food limit",
		});
		const box = within(dialog).getByRole("textbox");
		await user.clear(box);
		await user.type(box, "7000");
		await user.click(
			within(dialog).getByRole("button", { name: "Change from November" }),
		);
		await waitFor(() =>
			expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
		);
		expect(patches).toHaveLength(1);
		expect(reads.length).toBeGreaterThan(before);
	});

	test("a confirmed delete closes the confirmation", async () => {
		const deletes = route(
			network,
			"delete",
			"/api/budgets/:id",
			() => new HttpResponse(null, { status: 204 }),
		);
		const { user } = renderPage("?month=2026-10");
		await screen.findByText("Needs attention · 4");
		await user.click(rowOf("budget:food"));
		await user.click(panelButton("Delete"));
		const confirm = await screen.findByRole("alertdialog");
		await user.click(
			within(confirm).getByRole("button", { name: "Delete Budget" }),
		);
		await waitFor(() =>
			expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument(),
		);
		expect(deletes).toHaveLength(1);
	});

	test("while a dialog is open, the page's Up, Down and L rest", async () => {
		const { user } = renderPage("?month=2026-10");
		await screen.findByText("Needs attention · 4");
		await user.click(rowOf("budget:food"));
		await user.click(panelButton("Stop"));
		const dialog = await screen.findByRole("dialog", {
			name: "Stop budgeting Food",
		});
		within(dialog)
			.getByRole("radio", { name: /^From a month onward/ })
			.focus();
		await user.keyboard("{ArrowDown}");
		expect(rowOf("budget:food")).toHaveAttribute("aria-selected", "true");
		// Nor from the dialog itself, which no widget claims the keys of.
		act(() => dialog.focus());
		await user.keyboard("{ArrowDown}{ArrowUp}{ArrowUp}");
		expect(rowOf("budget:food")).toHaveAttribute("aria-selected", "true");
		await user.keyboard("l");
		expect(screen.getAllByRole("dialog")).toHaveLength(1);
		expect(
			screen.queryByRole("dialog", { name: "Change the Food limit" }),
		).not.toBeInTheDocument();
	});

	test("Add a Budget on a month with no Budget, from the empty message", async () => {
		const { user } = renderPage("?month=2026-08");
		expect(await screen.findByText("No Budgets for August 2026.")).toBeVisible();
		const adds = screen.getAllByRole("button", { name: "Add a Budget" });
		await user.click(adds.at(-1) as HTMLElement);
		expect(
			await screen.findByRole("dialog", { name: "Add a Budget" }),
		).toBeVisible();
	});
});

describe("the Undo notice (BR-F04-29, D-562, AC-F04-25, AC-F04-29)", () => {
	const rowOf = (key: string) =>
		document.querySelector<HTMLElement>(
			`[role="row"][data-key="${key}"]`,
		) as HTMLElement;
	const panel = () =>
		screen.getByRole("complementary", { name: "Budget details" });
	const panelButton = (name: string) =>
		within(panel()).getByRole("button", { name });
	const FOOD_SCHEDULE = [
		{ from: "2026-09", limitMinor: 600000 },
		{ from: "2026-10", limitMinor: 500000 },
	];
	const CHANGED = "Food limit is now ₹7,000.00 from November 2026.";
	const ADDED = "Health Budget added: ₹1,500.00 from November 2026.";
	const DELETED = "Food Budget deleted.";

	/** Changes food to 7,000.00 from November in its dialog, answering the PATCH as version 3. */
	async function changeFood(
		user: ReturnType<typeof userEvent.setup>,
		selectFirst = true,
	) {
		if (selectFirst) await user.click(rowOf("budget:food"));
		await user.click(panelButton("Change limit"));
		const dialog = await screen.findByRole("dialog", {
			name: "Change the Food limit",
		});
		const box = within(dialog).getByRole("textbox");
		await user.clear(box);
		await user.type(box, "7000");
		await user.click(
			within(dialog).getByRole("button", { name: "Change from November" }),
		);
		await waitFor(() =>
			expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
		);
	}
	const answerChange = () =>
		route(network, "patch", "/api/budgets/:id", () =>
			ok(
				budgetAnswer("food", {
					version: 3,
					schedule: [
						...FOOD_SCHEDULE,
						{ from: "2026-11", limitMinor: 700000 },
					],
				}),
			),
		);

	describe("docked", () => {
		beforeEach(() => media({ wide: true, docked: true }));

		// AC-F04-29
		test("a change shows its notice in the panel, with the Budget selected", async () => {
			answerChange();
			const { user } = renderPage("?month=2026-10");
			await screen.findByText("Needs attention · 4");
			await changeFood(user);
			expect(await within(panel()).findByText(CHANGED)).toBeVisible();
			expect(screen.getAllByText(CHANGED)).toHaveLength(1);
			expect(
				within(panel()).getByRole("button", { name: "Undo" }),
			).toBeVisible();
			expect(
				within(panel()).getByRole("button", { name: "Dismiss" }),
			).toBeVisible();
			expect(rowOf("budget:food")).toHaveAttribute("aria-selected", "true");
		});

		test("with nothing selected, a write selects its Budget so the notice shows", async () => {
			route(network, "post", "/api/budgets", () =>
				ok(
					budgetAnswer("food", {
						id: "0192f1a0-0000-7000-8000-0000000000aa",
						category: "health",
						version: 1,
						schedule: [{ from: "2026-11", limitMinor: 150000 }],
					}),
					201,
				),
			);
			const { user } = renderPage("?month=2026-09");
			await screen.findByText("Not budgeted · 3");
			expect(rowOf("unbudgeted:health")).toHaveAttribute(
				"aria-selected",
				"false",
			);
			await user.click(
				screen.getAllByRole("button", { name: "Add a Budget" })[0]!,
			);
			const dialog = await screen.findByRole("dialog", {
				name: "Add a Budget",
			});
			await user.click(within(dialog).getByText("Health"));
			await user.type(within(dialog).getByRole("textbox"), "1500");
			await user.click(
				within(dialog).getByRole("button", {
					name: "Add Budget from November",
				}),
			);
			expect(await within(panel()).findByText(ADDED)).toBeVisible();
			expect(rowOf("unbudgeted:health")).toHaveAttribute(
				"aria-selected",
				"true",
			);
		});

		// AC-F04-25
		test("Undo after a change sends a restoring PATCH at the version the change returned", async () => {
			const patches = answerChange();
			const { user } = renderPage("?month=2026-10");
			await screen.findByText("Needs attention · 4");
			await changeFood(user);
			await within(panel()).findByText(CHANGED);
			await user.click(within(panel()).getByRole("button", { name: "Undo" }));
			await waitFor(() => expect(patches).toHaveLength(2));
			expect(patches[1]?.path).toBe(`/api/budgets/${goldenBudget("food").id}`);
			expect(patches[1]?.headers.get("if-match")).toBe('"3"');
			expect(patches[1]?.body).toEqual({
				schedule: FOOD_SCHEDULE,
				overrides: [],
				currency: "INR",
			});
			expect(patches[1]?.headers.get("idempotency-key")).not.toBe(
				patches[0]?.headers.get("idempotency-key"),
			);
			await waitFor(() =>
				expect(screen.queryByText(CHANGED)).not.toBeInTheDocument(),
			);
		});

		test("Undo after a create sent as POST sends DELETE at the version it returned", async () => {
			route(network, "post", "/api/budgets", () =>
				ok(
					budgetAnswer("food", {
						id: "0192f1a0-0000-7000-8000-0000000000aa",
						category: "health",
						version: 1,
						schedule: [{ from: "2026-11", limitMinor: 150000 }],
						overrides: [],
					}),
					201,
				),
			);
			const deletes = route(
				network,
				"delete",
				"/api/budgets/:id",
				() => new HttpResponse(null, { status: 204 }),
			);
			const { user } = renderPage("?month=2026-09");
			await screen.findByText("Not budgeted · 3");
			await user.click(
				within(rowOf("unbudgeted:health")).getByRole("button", {
					name: "Add a Budget",
				}),
			);
			const dialog = await screen.findByRole("dialog", {
				name: "Add a Budget",
			});
			await user.type(within(dialog).getByRole("textbox"), "1500");
			await user.click(
				within(dialog).getByRole("button", {
					name: "Add Budget from November",
				}),
			);
			await waitFor(() =>
				expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
			);
			expect(await screen.findByText(ADDED)).toBeVisible();
			await user.click(screen.getByRole("button", { name: "Undo" }));
			await waitFor(() => expect(deletes).toHaveLength(1));
			expect(deletes[0]?.path).toBe(
				"/api/budgets/0192f1a0-0000-7000-8000-0000000000aa",
			);
			expect(deletes[0]?.headers.get("if-match")).toBe('"1"');
			await waitFor(() =>
				expect(screen.queryByText(ADDED)).not.toBeInTheDocument(),
			);
		});

		// AC-F04-29
		test("a delete shows its notice above the list, clears the selection, and Undo restores with a new id", async () => {
			const deletes = route(
				network,
				"delete",
				"/api/budgets/:id",
				() => new HttpResponse(null, { status: 204 }),
			);
			const posts = route(network, "post", "/api/budgets", () =>
				ok(budgetAnswer("food", { version: 1 }), 201),
			);
			const { user } = renderPage("?month=2026-10");
			await screen.findByText("Needs attention · 4");
			await user.click(rowOf("budget:food"));
			await user.click(panelButton("Delete"));
			const confirm = await screen.findByRole("alertdialog");
			await user.click(
				within(confirm).getByRole("button", { name: "Delete Budget" }),
			);
			const notice = await screen.findByText(DELETED);
			expect(within(panel()).queryByText(DELETED)).not.toBeInTheDocument();
			expect(notice).toBeVisible();
			expect(deletes[0]?.headers.get("if-match")).toBe('"2"');
			expect(
				within(panel()).queryByRole("button", { name: "Change limit" }),
			).not.toBeInTheDocument();
			await user.click(screen.getByRole("button", { name: "Undo" }));
			await waitFor(() => expect(posts).toHaveLength(1));
			const body = posts[0]?.body as Record<string, unknown>;
			expect(body).toEqual({
				id: expect.any(String),
				category: "food",
				schedule: FOOD_SCHEDULE,
				overrides: [],
				currency: "INR",
			});
			expect(body["id"]).not.toBe(goldenBudget("food").id);
			expect(isUuidV7(body["id"] as string)).toBe(true);
			await waitFor(() =>
				expect(screen.queryByText(DELETED)).not.toBeInTheDocument(),
			);
		});

		test("a delete's notice stays above the list when the category is selected again", async () => {
			let deleted = false;
			route(network, "delete", "/api/budgets/:id", () => {
				deleted = true;
				return new HttpResponse(null, { status: 204 });
			});
			// Food keeps its spending, so once deleted it is a Not budgeted row.
			const { user } = renderPage("?month=2026-10", {
				months: (month) => {
					const view = monthAnswer(month);
					if (!deleted) return ok(view);
					const food = view.budgets.find(
						(row) => row.category === "food",
					)!;
					return ok({
						...view,
						budgets: view.budgets.filter(
							(row) => row.category !== "food",
						),
						unbudgeted: [
							...view.unbudgeted,
							{
								category: "food",
								spentMinor: food.spentMinor,
								budgetId: null,
							},
						],
					});
				},
			});
			await screen.findByText("Needs attention · 4");
			await user.click(rowOf("budget:food"));
			await user.click(panelButton("Delete"));
			await user.click(
				within(await screen.findByRole("alertdialog")).getByRole("button", {
					name: "Delete Budget",
				}),
			);
			await screen.findByText(DELETED);
			await waitFor(() => expect(rowOf("unbudgeted:food")).not.toBeNull());
			await user.click(rowOf("unbudgeted:food"));
			expect(rowOf("unbudgeted:food")).toHaveAttribute(
				"aria-selected",
				"true",
			);
			expect(within(panel()).queryByText(DELETED)).not.toBeInTheDocument();
			expect(screen.getByText(DELETED)).toBeVisible();
		});

		test("Dismiss ends the notice without sending anything", async () => {
			const patches = answerChange();
			const { user } = renderPage("?month=2026-10");
			await screen.findByText("Needs attention · 4");
			await changeFood(user);
			await within(panel()).findByText(CHANGED);
			await user.click(
				within(panel()).getByRole("button", { name: "Dismiss" }),
			);
			expect(screen.queryByText(CHANGED)).not.toBeInTheDocument();
			expect(patches).toHaveLength(1);
		});

		test("a change of month ends it", async () => {
			answerChange();
			const { user } = renderPage("?month=2026-10");
			await screen.findByText("Needs attention · 4");
			await changeFood(user);
			await within(panel()).findByText(CHANGED);
			await user.click(monthButton("Previous month"));
			expect(screen.queryByText(CHANGED)).not.toBeInTheDocument();
			await user.click(monthButton("Next month"));
			expect(screen.queryByText(CHANGED)).not.toBeInTheDocument();
		});

		test("the next write replaces it", async () => {
			answerChange();
			route(network, "post", "/api/budgets", () =>
				ok(
					budgetAnswer("food", {
						id: "0192f1a0-0000-7000-8000-0000000000aa",
						category: "health",
						version: 1,
						schedule: [{ from: "2026-11", limitMinor: 150000 }],
					}),
					201,
				),
			);
			const { user } = renderPage("?month=2026-09");
			await screen.findByText("Not budgeted · 3");
			await user.click(rowOf("budget:food"));
			await changeFood(user, false);
			await within(panel()).findByText(CHANGED);
			await user.click(
				within(rowOf("unbudgeted:health")).getByRole("button", {
					name: "Add a Budget",
				}),
			);
			const dialog = await screen.findByRole("dialog", {
				name: "Add a Budget",
			});
			await user.type(within(dialog).getByRole("textbox"), "1500");
			await user.click(
				within(dialog).getByRole("button", {
					name: "Add Budget from November",
				}),
			);
			await within(panel()).findByText(ADDED);
			expect(screen.queryByText(CHANGED)).not.toBeInTheDocument();
			expect(screen.getAllByRole("button", { name: "Undo" })).toHaveLength(1);
			expect(rowOf("unbudgeted:health")).toHaveAttribute(
				"aria-selected",
				"true",
			);
		});
	});

	// AC-F04-25
	describe("when Undo fails", () => {
		beforeEach(() => media({ wide: true, docked: true }));

		async function changeThenUndo(
			answer: () => Response,
			user: ReturnType<typeof userEvent.setup>,
		) {
			let calls = 0;
			route(network, "patch", "/api/budgets/:id", () => {
				calls += 1;
				return calls === 1 ?
						ok(budgetAnswer("food", { version: 3 }))
					:	answer();
			});
			await screen.findByText("Needs attention · 4");
			await changeFood(user);
			await within(panel()).findByText(CHANGED);
			await user.click(within(panel()).getByRole("button", { name: "Undo" }));
		}

		test("no answer reads the failure with Dismiss and no Undo, and nothing else changes", async () => {
			const { user } = renderPage("?month=2026-10");
			await changeThenUndo(() => HttpResponse.error(), user);
			const alert = await within(panel()).findByRole("alert");
			expect(alert).toHaveTextContent(
				"The Budget could not be saved. Check your connection and try again.",
			);
			expect(
				within(panel()).queryByRole("button", { name: "Undo" }),
			).not.toBeInTheDocument();
			await user.click(
				within(panel()).getByRole("button", { name: "Dismiss" }),
			);
			expect(screen.queryByRole("alert")).not.toBeInTheDocument();
		});

		test("a 404 says the Budget was deleted on another device", async () => {
			const { user } = renderPage("?month=2026-10");
			await changeThenUndo(() => refuse(404, "not_found"), user);
			expect(await within(panel()).findByRole("alert")).toHaveTextContent(
				"This Budget was deleted on another device.",
			);
		});

		test("a 401 is the app's to answer: the notice stays as it was", async () => {
			const { user } = renderPage("?month=2026-10");
			await changeThenUndo(() => refuse(401, "unauthorized"), user);
			await waitFor(() =>
				expect(
					within(panel()).getByRole("button", { name: "Undo" }),
				).not.toHaveAttribute("aria-disabled", "true"),
			);
			expect(within(panel()).getByText(CHANGED)).toBeVisible();
			expect(screen.queryByRole("alert")).not.toBeInTheDocument();
		});

		test("Undo is sent once however often it is pressed while it waits", async () => {
			let calls = 0;
			const patches = route(network, "patch", "/api/budgets/:id", async () => {
				calls += 1;
				if (calls > 1) await delay(100);
				return ok(budgetAnswer("food", { version: 3 }));
			});
			const { user } = renderPage("?month=2026-10");
			await screen.findByText("Needs attention · 4");
			await changeFood(user);
			await within(panel()).findByText(CHANGED);
			const undo = within(panel()).getByRole("button", { name: "Undo" });
			await user.click(undo);
			await user.click(undo);
			await user.click(undo);
			await waitFor(() =>
				expect(screen.queryByText(CHANGED)).not.toBeInTheDocument(),
			);
			expect(patches).toHaveLength(2);
		});

		test("while Undo waits, Dismiss rests and the button shows it is busy", async () => {
			let calls = 0;
			route(network, "patch", "/api/budgets/:id", async () => {
				calls += 1;
				if (calls > 1) await delay(150);
				return ok(budgetAnswer("food", { version: 3 }));
			});
			const { user } = renderPage("?month=2026-10");
			await screen.findByText("Needs attention · 4");
			await changeFood(user);
			await within(panel()).findByText(CHANGED);
			await user.click(within(panel()).getByRole("button", { name: "Undo" }));
			expect(
				within(panel()).getByRole("button", { name: "Dismiss" }),
			).toHaveAttribute("aria-disabled", "true");
			await waitFor(() =>
				expect(screen.queryByText(CHANGED)).not.toBeInTheDocument(),
			);
		});
	});

	describe("Remove in the limit history (BR-F04-25)", () => {
		beforeEach(() => media({ wide: true, docked: true }));

		/** Golden October with food's 7,000.00 for December 2026 only. */
		const withMonthLimit = (month: Month) => {
			const view = monthAnswer(month);
			return {
				...view,
				budgets: view.budgets.map((row) =>
					row.category === "food" ?
						{
							...row,
							overrides: [{ month: "2026-12", limitMinor: 700000 }],
						}
					:	row,
				),
			};
		};
		const remove = () =>
			screen.getByRole("button", {
				name: "Remove ₹7,000.00 in Dec 2026 only",
			});
		const REMOVED = "One-month limit for December 2026 removed.";

		test("sends DELETE for the month at the Budget's version and shows its notice in the panel", async () => {
			const deletes = route(
				network,
				"delete",
				"/api/budgets/:id/overrides/:month",
				() => ok(budgetAnswer("food", { version: 3 })),
			);
			const { user } = renderPage("?month=2026-10", {
				months: (month) => ok(withMonthLimit(month)),
			});
			await screen.findByText("Needs attention · 4");
			await user.click(rowOf("budget:food"));
			await user.click(remove());
			expect(await within(panel()).findByText(REMOVED)).toBeVisible();
			expect(deletes[0]?.path).toBe(
				`/api/budgets/${goldenBudget("food").id}/overrides/2026-12`,
			);
			expect(deletes[0]?.headers.get("if-match")).toBe('"2"');
			expect(isUuidV7(deletes[0]?.headers.get("idempotency-key"))).toBe(true);
		});

		test("Undo puts the one-month limit back with a restoring PATCH at the returned version", async () => {
			route(network, "delete", "/api/budgets/:id/overrides/:month", () =>
				ok(budgetAnswer("food", { version: 3 })),
			);
			const patches = route(network, "patch", "/api/budgets/:id", () =>
				ok(budgetAnswer("food", { version: 4 })),
			);
			const { user } = renderPage("?month=2026-10", {
				months: (month) => ok(withMonthLimit(month)),
			});
			await screen.findByText("Needs attention · 4");
			await user.click(rowOf("budget:food"));
			await user.click(remove());
			await within(panel()).findByText(REMOVED);
			await user.click(within(panel()).getByRole("button", { name: "Undo" }));
			await waitFor(() => expect(patches).toHaveLength(1));
			expect(patches[0]?.headers.get("if-match")).toBe('"3"');
			expect(patches[0]?.body).toEqual({
				schedule: FOOD_SCHEDULE,
				overrides: [{ month: "2026-12", limitMinor: 700000 }],
				currency: "INR",
			});
		});

		test("the buttons rest while it is sent, and it is sent once", async () => {
			// The answer waits for the test, not for a timer: on a slow run a timer can fire between
			// the two presses, and the month view still offers Remove, so a second press is then
			// a second, legitimate write.
			let answer: () => void = () => {};
			const answered = new Promise<void>((resolve) => {
				answer = resolve;
			});
			const deletes = route(
				network,
				"delete",
				"/api/budgets/:id/overrides/:month",
				async () => {
					await answered;
					return ok(budgetAnswer("food", { version: 3 }));
				},
			);
			const { user } = renderPage("?month=2026-10", {
				months: (month) => ok(withMonthLimit(month)),
			});
			await screen.findByText("Needs attention · 4");
			await user.click(rowOf("budget:food"));
			await user.click(remove());
			expect(remove()).toHaveAttribute("aria-disabled", "true");
			await user.click(remove());
			answer();
			await within(panel()).findByText(REMOVED);
			expect(deletes).toHaveLength(1);
		});

		test("a failed Remove shows the failure in the panel and the month stays as it was", async () => {
			route(network, "delete", "/api/budgets/:id/overrides/:month", () =>
				refuse(404, "not_found"),
			);
			const { user } = renderPage("?month=2026-10", {
				months: (month) => ok(withMonthLimit(month)),
			});
			await screen.findByText("Needs attention · 4");
			await user.click(rowOf("budget:food"));
			await user.click(remove());
			expect(await within(panel()).findByRole("alert")).toHaveTextContent(
				"This Budget was deleted on another device.",
			);
			expect(
				within(panel()).queryByRole("button", { name: "Undo" }),
			).not.toBeInTheDocument();
		});

		// Section 8: another device deleted the Budget, so the page reads again and the row goes.
		test("a Remove that finds the Budget gone reads the month again, and the row and panel go", async () => {
			route(network, "delete", "/api/budgets/:id/overrides/:month", () =>
				refuse(404, "not_found"),
			);
			let reads = 0;
			const { user } = renderPage("?month=2026-10", {
				months: (month) => {
					reads += 1;
					const view = withMonthLimit(month);
					if (reads === 1) return ok(view);
					// The second read: food is no Budget any more.
					return ok({
						...view,
						budgets: view.budgets.filter(
							(row) => row.category !== "food",
						),
					});
				},
			});
			await screen.findByText("Needs attention · 4");
			await user.click(rowOf("budget:food"));
			await user.click(remove());
			expect(await screen.findByRole("alert")).toHaveTextContent(
				"This Budget was deleted on another device.",
			);
			await waitFor(() =>
				expect(
					document.querySelector('[role="row"][data-key="budget:food"]'),
				).toBeNull(),
			);
			// The selection went with the row, so the panel no longer shows food, and the failure
			// shows above the list.
			expect(
				within(panel()).queryByRole("region", { name: "Limit history" }),
			).not.toBeInTheDocument();
			expect(within(panel()).queryByRole("alert")).not.toBeInTheDocument();
			expect(screen.getByRole("alert")).toHaveTextContent(
				"This Budget was deleted on another device.",
			);
		});

		test("no answer reads the failure with Dismiss", async () => {
			route(network, "delete", "/api/budgets/:id/overrides/:month", () =>
				HttpResponse.error(),
			);
			const { user } = renderPage("?month=2026-10", {
				months: (month) => ok(withMonthLimit(month)),
			});
			await screen.findByText("Needs attention · 4");
			await user.click(rowOf("budget:food"));
			await user.click(remove());
			expect(await within(panel()).findByRole("alert")).toHaveTextContent(
				"The Budget could not be saved. Check your connection and try again.",
			);
			await user.click(
				within(panel()).getByRole("button", { name: "Dismiss" }),
			);
			expect(screen.queryByRole("alert")).not.toBeInTheDocument();
		});

		test("a 401 is the app's to answer: nothing is shown", async () => {
			route(network, "delete", "/api/budgets/:id/overrides/:month", () =>
				refuse(401, "unauthorized"),
			);
			const { user } = renderPage("?month=2026-10", {
				months: (month) => ok(withMonthLimit(month)),
			});
			await screen.findByText("Needs attention · 4");
			await user.click(rowOf("budget:food"));
			await user.click(remove());
			await waitFor(() =>
				expect(remove()).not.toHaveAttribute("aria-disabled", "true"),
			);
			expect(screen.queryByRole("alert")).not.toBeInTheDocument();
			expect(screen.queryByText(REMOVED)).not.toBeInTheDocument();
		});
	});

	describe("below 1180 px, where the panel is a drawer", () => {
		beforeEach(() => media({ wide: true, docked: false }));

		// AC-F04-29
		test("with nothing selected, a write selects nothing and opens no drawer; the notice is above the list", async () => {
			route(network, "post", "/api/budgets", () =>
				ok(
					budgetAnswer("food", {
						id: "0192f1a0-0000-7000-8000-0000000000aa",
						category: "health",
						version: 1,
						schedule: [{ from: "2026-11", limitMinor: 150000 }],
					}),
					201,
				),
			);
			const { user } = renderPage("?month=2026-09");
			await screen.findByText("Not budgeted · 3");
			await user.click(
				within(rowOf("unbudgeted:health")).getByRole("button", {
					name: "Add a Budget",
				}),
			);
			const dialog = await screen.findByRole("dialog", {
				name: "Add a Budget",
			});
			await user.type(within(dialog).getByRole("textbox"), "1500");
			await user.click(
				within(dialog).getByRole("button", {
					name: "Add Budget from November",
				}),
			);
			expect(await screen.findByText(ADDED)).toBeVisible();
			expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
			expect(rowOf("unbudgeted:health")).toHaveAttribute(
				"aria-selected",
				"false",
			);
		});

		test("with a Budget selected, the drawer shows the notice of the Budget that was changed", async () => {
			answerChange();
			const { user } = renderPage("?month=2026-10");
			await screen.findByText("Needs attention · 4");
			await user.click(rowOf("budget:food"));
			const drawer = await screen.findByRole("dialog", {
				name: "Budget details",
			});
			await user.click(
				within(drawer).getByRole("button", { name: "Change limit" }),
			);
			const dialog = await screen.findByRole("dialog", {
				name: "Change the Food limit",
			});
			const box = within(dialog).getByRole("textbox");
			await user.clear(box);
			await user.type(box, "7000");
			await user.click(
				within(dialog).getByRole("button", { name: "Change from November" }),
			);
			const shown = await screen.findByRole("dialog", {
				name: "Budget details",
			});
			expect(await within(shown).findByText(CHANGED)).toBeVisible();
		});
	});

	// AC-F04-30
	describe("the conflict view (BR-F04-23, D-567)", () => {
		beforeEach(() => media({ wide: true, docked: true }));

		/** Food as another device left it: 5,500.00 from November, as version 4. */
		const SAVED = () =>
			budgetAnswer("food", {
				version: 4,
				schedule: [
					...FOOD_SCHEDULE,
					{ from: "2026-11", limitMinor: 550000 },
				],
			});
		const conflict = () =>
			refuse(409, "version_conflict", { details: { current: SAVED() } });
		const view = () =>
			screen.getByRole("dialog", {
				name: "This Budget changed on another device",
			});
		const noView = () =>
			expect(
				screen.queryByRole("dialog", {
					name: "This Budget changed on another device",
				}),
			).not.toBeInTheDocument();
		const opened = () =>
			screen.findByRole("dialog", {
				name: "This Budget changed on another device",
			});
		/** The month view once another device's change has been read. */
		const elsewhere = (month: Month) =>
			monthAnswer(
				month,
				goldenBudgets().map((budget) =>
					budget.category === "food" ?
						{ ...budget, version: 4, schedule: SAVED().schedule }
					:	budget,
				),
			);

		/** Food at 7,000.00 from December in its dialog. */
		async function changeFromDecember(user: ReturnType<typeof userEvent.setup>) {
			await user.click(rowOf("budget:food"));
			await user.click(panelButton("Change limit"));
			const dialog = await screen.findByRole("dialog", {
				name: "Change the Food limit",
			});
			const box = within(dialog).getByRole("textbox");
			await user.clear(box);
			await user.type(box, "7000");
			await user.click(
				within(dialog).getByRole("radio", { name: "Next month (December)" }),
			);
			await user.click(
				within(dialog).getByRole("button", { name: "Change from December" }),
			);
		}

		test("a change that meets a 409 shows the Dec 2026 and Nov 2026 rows marked Differs, and the Keep mine line", async () => {
			route(network, "patch", "/api/budgets/:id", () => conflict());
			const { user } = renderPage("?month=2026-10");
			await screen.findByText("Needs attention · 4");
			await changeFromDecember(user);
			await opened();
			const row = (name: RegExp) =>
				within(view())
					.getAllByRole("row")
					.find((each) => name.test(each.textContent ?? ""))!;
			expect(row(/Dec 2026/)).toHaveAttribute("data-differs", "true");
			expect(
				within(row(/Dec 2026/)).getAllByRole("cell")[0],
			).toHaveTextContent("₹7,000.00 from Dec 2026");
			expect(
				within(row(/Dec 2026/)).getAllByRole("cell")[1],
			).toHaveTextContent("None");
			expect(row(/Nov 2026/)).toHaveAttribute("data-differs", "true");
			expect(
				within(row(/Nov 2026/)).getAllByRole("cell")[0],
			).toHaveTextContent("None");
			expect(
				within(row(/Nov 2026/)).getAllByRole("cell")[1],
			).toHaveTextContent("₹5,500.00 from Nov 2026");
			expect(
				within(view()).getByText(
					"Keep mine applies your change, ₹7,000.00 from December 2026, to the saved Budget.",
				),
			).toBeVisible();
		});

		test("Keep mine resends the PATCH at the saved version under a new key, then the notice shows", async () => {
			const patches = route(
				network,
				"patch",
				"/api/budgets/:id",
				(_, index) =>
					index === 0 ? conflict() : (
						ok(budgetAnswer("food", { version: 5 }))
					),
			);
			const { user } = renderPage("?month=2026-10");
			await screen.findByText("Needs attention · 4");
			await changeFromDecember(user);
			await opened();
			await user.click(
				within(view()).getByRole("button", { name: "Keep mine" }),
			);
			await waitFor(() => expect(patches).toHaveLength(2));
			expect(patches[1]?.headers.get("if-match")).toBe('"4"');
			expect(patches[1]?.headers.get("idempotency-key")).not.toBe(
				patches[0]?.headers.get("idempotency-key"),
			);
			expect(patches[1]?.body).toEqual(patches[0]?.body);
			await waitFor(() =>
				expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
			);
			expect(
				await within(panel()).findByText(
					"Food limit is now ₹7,000.00 from December 2026.",
				),
			).toBeVisible();
		});

		test("Keep theirs sends nothing, shows the saved Budget everywhere and closes the view and the dialog", async () => {
			let readElsewhere = false;
			const patches = route(network, "patch", "/api/budgets/:id", () => {
				readElsewhere = true;
				return conflict();
			});
			const { user } = renderPage("?month=2026-10", {
				months: (month) =>
					ok(readElsewhere ? elsewhere(month) : monthAnswer(month)),
			});
			await screen.findByText("Needs attention · 4");
			await changeFromDecember(user);
			await opened();
			await user.click(
				within(view()).getByRole("button", { name: "Keep theirs" }),
			);
			await waitFor(() =>
				expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
			);
			expect(patches).toHaveLength(1);
			// The panel's limit history now reads the saved Budget's November entry.
			expect(
				await within(panel()).findByText("₹5,500.00 from Nov 2026"),
			).toBeVisible();
			expect(screen.queryByText(/Food limit is now/)).not.toBeInTheDocument();
			// The November row reads the saved 5,500.00.
			await user.click(screen.getByRole("button", { name: "Next month" }));
			await waitFor(() =>
				expect(rowOf("budget:food")).toHaveAccessibleName(/of ₹5,500\.00/),
			);
		});

		test("closing it goes back to the dialog with what was typed", async () => {
			route(network, "patch", "/api/budgets/:id", () => conflict());
			const { user } = renderPage("?month=2026-10");
			await screen.findByText("Needs attention · 4");
			await changeFromDecember(user);
			await opened();
			await user.keyboard("{Escape}");
			noView();
			const dialog = screen.getByRole("dialog", {
				name: "Change the Food limit",
			});
			expect(within(dialog).getByRole("textbox")).toHaveValue("7,000.00");
		});

		test("Undo's 409 opens it with the Undo line, and Keep mine puts the Budget back at the saved version", async () => {
			const patches = route(
				network,
				"patch",
				"/api/budgets/:id",
				(_, index) => {
					if (index === 0) return ok(budgetAnswer("food", { version: 3 }));
					if (index === 1) return conflict();
					return ok(budgetAnswer("food", { version: 5 }));
				},
			);
			const { user } = renderPage("?month=2026-10");
			await screen.findByText("Needs attention · 4");
			await changeFood(user);
			await within(panel()).findByText(CHANGED);
			await user.click(within(panel()).getByRole("button", { name: "Undo" }));
			await opened();
			expect(
				within(view()).getByText(
					"Keep mine puts the Budget back as it was before your change.",
				),
			).toBeVisible();
			// The notice stays under the view until a choice is made.
			expect(screen.getByText(CHANGED)).toBeInTheDocument();
			await user.click(
				within(view()).getByRole("button", { name: "Keep mine" }),
			);
			await waitFor(() => expect(patches).toHaveLength(3));
			expect(patches[2]?.headers.get("if-match")).toBe('"4"');
			expect(patches[2]?.body).toEqual({
				schedule: FOOD_SCHEDULE,
				overrides: [],
				currency: "INR",
			});
			await waitFor(() =>
				expect(screen.queryByText(CHANGED)).not.toBeInTheDocument(),
			);
			noView();
		});

		test("while Undo's conflict view is open, the page's S, L, Delete and arrows rest", async () => {
			route(network, "patch", "/api/budgets/:id", (_, index) =>
				index === 0 ? ok(budgetAnswer("food", { version: 3 })) : conflict(),
			);
			const { user } = renderPage("?month=2026-10");
			await screen.findByText("Needs attention · 4");
			await changeFood(user);
			await within(panel()).findByText(CHANGED);
			await user.click(within(panel()).getByRole("button", { name: "Undo" }));
			await opened();
			await user.keyboard("slL{Delete}{ArrowDown}");
			expect(screen.getAllByRole("dialog", { hidden: true })).toHaveLength(1);
			expect(
				screen.queryByRole("dialog", { name: "Stop budgeting Food" }),
			).not.toBeInTheDocument();
			expect(
				screen.queryByRole("alertdialog", { hidden: true }),
			).not.toBeInTheDocument();
			expect(rowOf("budget:food")).toHaveAttribute("aria-selected", "true");
		});

		test("Undo's 409, Keep theirs ends the notice and sends nothing", async () => {
			const patches = route(
				network,
				"patch",
				"/api/budgets/:id",
				(_, index) =>
					index === 0 ?
						ok(budgetAnswer("food", { version: 3 }))
					:	conflict(),
			);
			const { user } = renderPage("?month=2026-10");
			await screen.findByText("Needs attention · 4");
			await changeFood(user);
			await within(panel()).findByText(CHANGED);
			await user.click(within(panel()).getByRole("button", { name: "Undo" }));
			await opened();
			await user.click(
				within(view()).getByRole("button", { name: "Keep theirs" }),
			);
			await waitFor(() =>
				expect(screen.queryByText(CHANGED)).not.toBeInTheDocument(),
			);
			expect(patches).toHaveLength(2);
			noView();
		});

		test("Undo's 409, closing the view leaves the notice with its Undo", async () => {
			route(network, "patch", "/api/budgets/:id", (_, index) =>
				index === 0 ? ok(budgetAnswer("food", { version: 3 })) : conflict(),
			);
			const { user } = renderPage("?month=2026-10");
			await screen.findByText("Needs attention · 4");
			await changeFood(user);
			await within(panel()).findByText(CHANGED);
			await user.click(within(panel()).getByRole("button", { name: "Undo" }));
			await opened();
			await user.keyboard("{Escape}");
			noView();
			expect(within(panel()).getByText(CHANGED)).toBeVisible();
			expect(
				within(panel()).getByRole("button", { name: "Undo" }),
			).toBeVisible();
		});

		test("a delete's 409 offers Delete anyway and Keep it, and Delete anyway deletes the saved Budget", async () => {
			const deletes = route(
				network,
				"delete",
				"/api/budgets/:id",
				(_, index) =>
					index === 0 ? conflict() : (
						new HttpResponse(null, { status: 204 })
					),
			);
			const { user } = renderPage("?month=2026-10");
			await screen.findByText("Needs attention · 4");
			await user.click(rowOf("budget:food"));
			await user.click(panelButton("Delete"));
			await user.click(
				within(await screen.findByRole("alertdialog")).getByRole("button", {
					name: "Delete Budget",
				}),
			);
			await opened();
			expect(
				within(view()).getByRole("button", { name: "Keep it" }),
			).toBeVisible();
			expect(within(view()).queryByText(/^Keep mine/)).not.toBeInTheDocument();
			await user.click(
				within(view()).getByRole("button", { name: "Delete anyway" }),
			);
			await waitFor(() => expect(deletes).toHaveLength(2));
			expect(deletes[1]?.headers.get("if-match")).toBe('"4"');
			expect(await screen.findByText(DELETED)).toBeVisible();
		});

		test("Remove's 409 opens it, and Keep mine removes the one-month limit from the saved Budget", async () => {
			const withLimit = (month: Month) => {
				const view = monthAnswer(month);
				return {
					...view,
					budgets: view.budgets.map((row) =>
						row.category === "food" ?
							{
								...row,
								overrides: [
									{ month: "2026-12", limitMinor: 700000 },
								],
							}
						:	row,
					),
				};
			};
			const deletes = route(
				network,
				"delete",
				"/api/budgets/:id/overrides/:month",
				(_, index) =>
					index === 0 ? conflict() : (
						ok(budgetAnswer("food", { version: 5 }))
					),
			);
			const { user } = renderPage("?month=2026-10", {
				months: (month) => ok(withLimit(month)),
			});
			await screen.findByText("Needs attention · 4");
			await user.click(rowOf("budget:food"));
			await user.click(
				screen.getByRole("button", {
					name: "Remove ₹7,000.00 in Dec 2026 only",
				}),
			);
			await opened();
			expect(
				within(view()).getByText(
					"Keep mine applies your change, the removal of the one-month limit for December 2026, to the saved Budget.",
				),
			).toBeVisible();
			await user.click(
				within(view()).getByRole("button", { name: "Keep mine" }),
			);
			await waitFor(() => expect(deletes).toHaveLength(2));
			expect(deletes[1]?.headers.get("if-match")).toBe('"4"');
			expect(
				await within(panel()).findByText(
					"One-month limit for December 2026 removed.",
				),
			).toBeVisible();
			noView();
		});
	});
});

describe("S and Delete (BR-F04-32, D-573)", () => {
	beforeEach(() => media({ wide: true, docked: true }));

	const rowOf = (key: string) =>
		document.querySelector<HTMLElement>(
			`[role="row"][data-key="${key}"]`,
		) as HTMLElement;

	test("with a Budget's row focused, S opens Stop budgeting", async () => {
		const { user } = renderPage("?month=2026-10");
		await screen.findByText("Needs attention · 4");
		await user.click(rowOf("budget:food"));
		expect(rowOf("budget:food")).toHaveFocus();
		await user.keyboard("s");
		expect(
			await screen.findByRole("dialog", { name: "Stop budgeting Food" }),
		).toBeVisible();
	});

	test.each(["{Delete}", "{Backspace}"])(
		"%s opens the Delete confirmation for a Budget",
		async (key) => {
			const { user } = renderPage("?month=2026-10");
			await screen.findByText("Needs attention · 4");
			await user.click(rowOf("budget:food"));
			await user.keyboard(key);
			expect(
				await screen.findByRole("alertdialog", {
					name: "Delete the Food Budget?",
				}),
			).toBeVisible();
		},
	);

	// August: transportation is Not active alone, with no spending.
	test("a Not active Budget: Delete opens its confirmation, S does nothing", async () => {
		const { user } = renderPage("?month=2026-08");
		await screen.findByText("No Budgets for August 2026.");
		await user.click(
			screen.getByRole("button", { name: /^Not active this month/ }),
		);
		await user.click(rowOf("inactive:transportation"));
		await user.keyboard("s");
		expect(
			screen.queryByRole("dialog", { name: /^Stop/ }),
		).not.toBeInTheDocument();
		await user.keyboard("{Delete}");
		expect(
			await screen.findByRole("alertdialog", {
				name: "Delete the Transportation Budget?",
			}),
		).toBeVisible();
	});

	test("a Not budgeted category: neither key acts", async () => {
		const { user } = renderPage("?month=2026-09");
		await screen.findByText("Not budgeted · 3");
		await user.click(rowOf("unbudgeted:transportation"));
		await user.keyboard("s{Delete}{Backspace}");
		expect(
			screen.queryByRole("dialog", { name: /^Stop/ }),
		).not.toBeInTheDocument();
		expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
		await screen.findByRole("region", { name: "Last 6 months" });
	});

	test("nothing selected: neither key acts", async () => {
		const { user } = renderPage("?month=2026-10");
		await screen.findByText("Needs attention · 4");
		await user.click(screen.getByRole("heading", { level: 1, name: "Budgets" }));
		await user.keyboard("s{Delete}");
		expect(
			screen.queryByRole("dialog", { name: /^Stop/ }),
		).not.toBeInTheDocument();
		expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
	});

	test("while a dialog is open they rest", async () => {
		const { user } = renderPage("?month=2026-10");
		await screen.findByText("Needs attention · 4");
		await user.click(rowOf("budget:food"));
		await user.keyboard("l");
		const dialog = await screen.findByRole("dialog", {
			name: "Change the Food limit",
		});
		act(() => dialog.focus());
		await user.keyboard("s{Delete}");
		expect(screen.getAllByRole("dialog")).toHaveLength(1);
		expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
	});
});
