import { onlineManager } from "@tanstack/react-query";
import {
	act,
	fireEvent,
	render,
	screen,
	waitFor,
	within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse } from "msw";
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
import type { ExpenseCategory } from "@/lib/budgets/model";
import type { Month } from "@/lib/budgets/months";
import {
	ok,
	refuse,
	route,
	testClient,
	urlHarness,
} from "../../hooks/__tests__/helpers";
import { resetUnsavedView, VIEW_KEY } from "../../hooks/useBudgetsView";
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
	network.resetHandlers();
	onlineManager.setOnline(true);
	vi.useRealTimers();
	vi.restoreAllMocks();
	resetUnsavedView();
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
		onRemoveMonthLimit,
	}: {
		months?: (month: Month) => Response | Promise<Response>;
		seed?: BudgetMonthAnswer;
		onRemoveMonthLimit?: (category: ExpenseCategory, month: Month) => void;
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
				<BudgetsPage
					locale={IN}
					{...(onRemoveMonthLimit ? { onRemoveMonthLimit } : {})}
				/>
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

	// AC-F04-29
	test("housing selected in October clears in August, where it shows nowhere", async () => {
		const { user } = renderPage("?month=2026-10", {
			months: (month) =>
				ok(month === "2026-08" ? nothing(month) : monthAnswer(month)),
		});
		await screen.findByText("Not budgeted · 1");
		await user.click(rowOf("unbudgeted:housing"));
		await user.click(monthButton("Previous month"));
		await user.click(monthButton("Previous month"));
		expect(await screen.findByText("No Budgets for August 2026.")).toBeVisible();
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

describe("Remove in the limit history (BR-F04-25)", () => {
	beforeEach(() => media({ wide: true, docked: true }));

	/** Golden October with food's 7,000.00 for December 2026 only. */
	const withMonthLimit = (month: Month) => {
		const view = monthAnswer(month);
		return {
			...view,
			budgets: view.budgets.map((row) =>
				row.category === "food" ?
					{ ...row, overrides: [{ month: "2026-12", limitMinor: 700000 }] }
				:	row,
			),
		};
	};
	const food = () =>
		document.querySelector(
			'[role="row"][data-key="budget:food"]',
		) as HTMLElement;
	const remove = () =>
		screen.getByRole("button", { name: "Remove ₹7,000.00 in Dec 2026 only" });

	test("reaches the page with the category and the month", async () => {
		const onRemoveMonthLimit = vi.fn();
		const { user } = renderPage("?month=2026-10", {
			months: (month) => ok(withMonthLimit(month)),
			onRemoveMonthLimit,
		});
		await screen.findByText("Needs attention · 4");
		await user.click(food());
		await user.click(remove());
		expect(onRemoveMonthLimit).toHaveBeenCalledExactlyOnceWith(
			"food",
			"2026-12",
		);
	});

	test("without a handler yet, it does nothing", async () => {
		const { user } = renderPage("?month=2026-10", {
			months: (month) => ok(withMonthLimit(month)),
		});
		await screen.findByText("Needs attention · 4");
		await user.click(food());
		await user.click(remove());
		expect(screen.getByRole("region", { name: "Limit history" })).toBeVisible();
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
