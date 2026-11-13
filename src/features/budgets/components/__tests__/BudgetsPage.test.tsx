import { onlineManager } from "@tanstack/react-query";
import { act, render, screen, waitFor, within } from "@testing-library/react";
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
import { monthAnswer } from "../../lib/__tests__/fixtures";
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
});
afterEach(() => {
	network.resetHandlers();
	onlineManager.setOnline(true);
	vi.useRealTimers();
	vi.restoreAllMocks();
	resetUnsavedView();
	window.localStorage.clear();
});
afterAll(() => network.close());

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
		onAdd,
	}: {
		months?: (month: Month) => Response;
		seed?: BudgetMonthAnswer;
		onAdd?: () => void;
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
					{...(onAdd ? { onAdd } : {})}
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

	test("Add a Budget, either button, calls the page's Add", async () => {
		const onAdd = vi.fn();
		const { user } = renderPage("?month=2026-10", { onAdd });
		for (const button of screen.getAllByRole("button", {
			name: "Add a Budget",
		})) {
			await user.click(button);
		}
		expect(onAdd).toHaveBeenCalledTimes(2);
	});

	test("Add a Budget does nothing harmful before the page has a dialog to open", async () => {
		const { user } = renderPage("?month=2026-10");
		await user.click(
			screen.getAllByRole("button", {
				name: "Add a Budget",
			})[0] as HTMLElement,
		);
		expect(
			screen.getByRole("heading", { level: 1, name: "Budgets" }),
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
		const onAdd = vi.fn();
		const { user } = renderPage("?month=2026-08", {
			months: (month) => ok(nothing(month)),
			onAdd,
		});
		expect(await screen.findByText("No Budgets for August 2026.")).toBeVisible();
		expect(
			screen.getByText("Budgets apply from the month you choose."),
		).toBeVisible();
		const adds = screen.getAllByRole("button", { name: "Add a Budget" });
		expect(adds).toHaveLength(3);
		await user.click(adds[2] as HTMLElement);
		expect(onAdd).toHaveBeenCalledOnce();
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
