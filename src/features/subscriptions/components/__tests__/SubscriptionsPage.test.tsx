import { onlineManager } from "@tanstack/react-query";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderToString } from "react-dom/server";
import { toast } from "sonner";
import { delay } from "msw";
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
import { GOLDEN_BLOCK, meFor } from "@/components/app/__tests__/helpers";
import { Toaster } from "@/components/feedback/Toaster";
import { InRouter, routerFake } from "@/components/app/__tests__/router";
import { resetUnsavedChoices } from "@/hooks/useStoredChoice";
import {
	ok,
	refuse,
	route,
	testClient,
	urlHarness,
} from "../../hooks/__tests__/helpers";
import { subscriptionKeys } from "../../lib/keys";
import type { SubscriptionList, SubscriptionsLocale } from "../../lib/types";
import { VIEW_KEY } from "../../lib/view";
import type { Transaction } from "@/lib/transactions/model";
import {
	charge,
	emptyList,
	listPage,
	monthsAnswer,
	subscriptionItem,
	subscriptionList,
} from "../../lib/__tests__/fixtures";
import { SubscriptionsPage } from "../SubscriptionsPage";

const network = setupServer();
beforeAll(() => network.listen({ onUnhandledFrame: "error" }));
beforeEach(() => window.localStorage.clear());
afterEach(() => {
	for (const name of [VIEW_KEY, "daybook_wide"]) {
		document.cookie = `${name}=; Max-Age=0; Path=/`;
	}
	// Sonner keeps its toasts in a module, so one test's toast would reach the next.
	toast.dismiss();
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

/** A window's width: jsdom has no `matchMedia`, which the page reads as a narrow window.
 * `wide` is 768 px up, where Table is offered; `docked` is 1180 px up, where the panel sits
 * beside the list and Up and Down select. */
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
const IN: SubscriptionsLocale = {
	today: "2026-11-02",
	currency: "INR",
	numberLocale: "hi-IN-u-nu-latn",
	dateLocale: "en-IN",
	timezone: "Asia/Kolkata",
	weekStart: "monday",
};

/** Serves `/api/subscriptions` with `answer` and renders the page. With `seed`, the list is in
 * the cache as the server render leaves it. */
function renderPage({
	answer = () => ok(subscriptionList()),
	seed,
	search = "",
	charges = [],
}: {
	answer?: () => Response | Promise<Response>;
	/** The charges Transactions holds: a month's read gets those dated in it. */
	charges?: Transaction[];
	seed?: SubscriptionList;
	/** The URL's query, such as "?open=<id>". */
	search?: string;
} = {}) {
	const reads = route(network, "get", "/api/subscriptions", answer);
	// The panel reads the selected Subscription's charges, the calendar a month's.
	route(network, "get", "/api/transactions", (request) => {
		const query = new URL(request.path, "http://localhost").searchParams;
		const [from, to] = [query.get("from"), query.get("to")];
		return ok(
			listPage(
				charges.filter(
					(each) =>
						from === null
						|| to === null
						|| (each.occurredOn >= from && each.occurredOn <= to),
				),
			),
		);
	});
	route(network, "get", "/api/subscriptions/months", (request) => {
		const query = new URL(request.path, "http://localhost").searchParams;
		return ok(monthsAnswer(query.get("from")!, query.get("to")!));
	});
	const queryClient = testClient();
	if (seed) queryClient.setQueryData(subscriptionKeys.list(), seed);
	const router = routerFake();
	const { calls, Url } = urlHarness(search);
	const view = render(
		<InRouter
			pathname="/subscriptions"
			router={router}
		>
			<Url>
				<AppProviders
					navigate={vi.fn()}
					queryClient={queryClient}
				>
					<SubscriptionsPage locale={IN} />
					<Toaster />
				</AppProviders>
			</Url>
		</InRouter>,
	);
	return { ...view, queryClient, reads, router, calls, user: userEvent.setup() };
}

function goOffline() {
	vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
	onlineManager.setOnline(false);
	act(() => {
		window.dispatchEvent(new Event("offline"));
	});
}

const loading = () =>
	screen.queryByRole("status", { name: "Loading Subscriptions" });
const switchGroup = () =>
	screen.queryByRole("radiogroup", { name: "Show Subscriptions as" });

describe("loading (section 6)", () => {
	test("shows the title, the switch and a skeleton, with no summary and no panel", () => {
		renderPage({ answer: async () => (await delay("infinite"), ok({})) });
		expect(
			screen.getByRole("heading", { level: 1, name: "Subscriptions" }),
		).toBeVisible();
		expect(loading()).toBeInTheDocument();
		expect(switchGroup()).toBeInTheDocument();
		expect(screen.queryByText("Monthly cost")).toBeNull();
		expect(screen.queryByRole("complementary")).toBeNull();
	});

	test("the skeleton gives way to the summary when the list arrives", async () => {
		renderPage();
		expect(loading()).toBeInTheDocument();
		expect(await screen.findByText("Monthly cost")).toBeVisible();
		expect(loading()).toBeNull();
	});

	test("asks the API once", async () => {
		const { reads } = renderPage();
		await screen.findByText("Monthly cost");
		expect(reads.map((each) => each.path)).toEqual(["/api/subscriptions"]);
	});
});

describe("the list, golden at 2 November (BR-F05-21)", () => {
	test("shows the summary's figures", async () => {
		renderPage();
		await screen.findByText("Monthly cost");
		expect(screen.getByText("₹20,273.92")).toBeInTheDocument();
		expect(
			screen.getByText("₹2,43,287.00 a year · 4 Subscriptions"),
		).toBeVisible();
		expect(screen.getByText("₹20,149.00 in all")).toBeVisible();
		expect(screen.getByText("Charged ₹18,000.00")).toBeVisible();
		expect(screen.getByText("Still to come ₹2,149.00")).toBeVisible();
		expect(screen.getByText("Next 30 days · 3 charges")).toBeVisible();
	});

	test("a list the server rendered shows at once and is not asked for again", async () => {
		const { reads } = renderPage({ seed: subscriptionList() });
		expect(screen.getByText("Monthly cost")).toBeVisible();
		expect(loading()).toBeNull();
		await act(() => delay(20));
		expect(reads).toHaveLength(0);
	});

	test("has Add a Subscription in the header", async () => {
		renderPage();
		await screen.findByText("Monthly cost");
		expect(
			screen.getByRole("button", { name: "Add a Subscription" }),
		).toBeVisible();
	});

	test("has no panel yet", async () => {
		renderPage();
		await screen.findByText("Monthly cost");
		expect(screen.queryByRole("complementary")).toBeNull();
	});

	test("has no empty or error message", async () => {
		renderPage();
		await screen.findByText("Monthly cost");
		expect(screen.queryByText("No Subscriptions yet.")).toBeNull();
		expect(screen.queryByText("Subscriptions could not be loaded.")).toBeNull();
	});
});

describe("empty (section 6)", () => {
	test("says there are none, with no switch, no summary and no panel", async () => {
		renderPage({ answer: () => ok(emptyList()) });
		expect(await screen.findByText("No Subscriptions yet.")).toBeVisible();
		expect(
			screen.getByText(
				"Add rent, streaming, insurance or any bill that repeats.",
			),
		).toBeVisible();
		expect(switchGroup()).toBeNull();
		expect(screen.queryByText("Monthly cost")).toBeNull();
		expect(screen.queryByRole("complementary")).toBeNull();
		expect(loading()).toBeNull();
	});

	test("offers Add a Subscription in the header and in the message", async () => {
		renderPage({ answer: () => ok(emptyList()) });
		await screen.findByText("No Subscriptions yet.");
		expect(
			screen.getAllByRole("button", { name: "Add a Subscription" }),
		).toHaveLength(2);
	});
});

describe("error (section 6)", () => {
	const failing = () => refuse(500, "internal_error");

	test("says so, with Retry, no switch, no summary and no panel", async () => {
		renderPage({ answer: failing });
		expect(
			await screen.findByText("Subscriptions could not be loaded."),
		).toBeVisible();
		expect(
			screen.getByText(
				"Check your connection, then try again. Your Subscriptions are safe.",
			),
		).toBeVisible();
		expect(screen.getByRole("button", { name: "Retry" })).toBeVisible();
		expect(switchGroup()).toBeNull();
		expect(screen.queryByText("Monthly cost")).toBeNull();
		expect(screen.queryByRole("complementary")).toBeNull();
		expect(loading()).toBeNull();
	});

	test("Retry asks again, and the list shows when it comes", async () => {
		let healthy = false;
		const { user, reads } = renderPage({
			answer: () => (healthy ? ok(subscriptionList()) : failing()),
		});
		await screen.findByText("Subscriptions could not be loaded.");
		healthy = true;
		await user.click(screen.getByRole("button", { name: "Retry" }));
		expect(await screen.findByText("Monthly cost")).toBeVisible();
		expect(reads).toHaveLength(2);
		expect(screen.queryByText("Subscriptions could not be loaded.")).toBeNull();
		expect(switchGroup()).toBeInTheDocument();
	});

	test("Retry that fails again keeps the message", async () => {
		const { user, reads } = renderPage({ answer: failing });
		await screen.findByText("Subscriptions could not be loaded.");
		await user.click(screen.getByRole("button", { name: "Retry" }));
		await waitFor(() => expect(reads).toHaveLength(2));
		expect(
			await screen.findByText("Subscriptions could not be loaded."),
		).toBeVisible();
	});

	test("a failed refresh keeps the list that was shown", async () => {
		const { queryClient, reads } = renderPage({
			answer: failing,
			seed: subscriptionList(),
		});
		await act(() =>
			queryClient.refetchQueries({ queryKey: subscriptionKeys.list() }),
		);
		expect(reads).toHaveLength(1);
		expect(screen.getByText("Monthly cost")).toBeVisible();
		expect(screen.queryByText("Subscriptions could not be loaded.")).toBeNull();
		expect(switchGroup()).toBeInTheDocument();
	});
});

describe("offline (section 10)", () => {
	test('a saved list stays, with "as of" the time it was loaded', async () => {
		vi.useFakeTimers({
			toFake: ["Date"],
			now: new Date("2026-11-02T06:30:00.000Z"),
		});
		renderPage({ seed: subscriptionList() });
		goOffline();
		expect(screen.getByText("as of 12:00 pm")).toBeVisible();
		expect(screen.getByText("Monthly cost")).toBeVisible();
		expect(screen.queryByText("Subscriptions could not be loaded.")).toBeNull();
	});

	test('online, there is no "as of"', () => {
		renderPage({ seed: subscriptionList() });
		expect(screen.queryByText(/^as of /)).toBeNull();
	});

	test("with nothing saved and no connection, the error offers Retry", async () => {
		goOffline();
		renderPage();
		expect(
			await screen.findByText("Subscriptions could not be loaded."),
		).toBeVisible();
		expect(screen.getByRole("button", { name: "Retry" })).toBeVisible();
		expect(screen.queryByText(/^as of /)).toBeNull();
	});
});

describe("the view (BR-F05-21)", () => {
	test("is List by default", async () => {
		media({ wide: true });
		renderPage({ seed: subscriptionList() });
		expect(
			screen.getByRole("radio", { name: "List", checked: true }),
		).toBeVisible();
		expect(screen.getByRole("grid", { name: "Subscriptions" })).toBeVisible();
	});

	test("from 768 px offers List, Calendar and Table", () => {
		media({ wide: true });
		renderPage({ seed: subscriptionList() });
		expect(screen.getAllByRole("radio")).toHaveLength(3);
		expect(screen.getByRole("radio", { name: "Table" })).toBeVisible();
	});

	test("below 768 px Table is still in the switch, hidden by CSS", () => {
		media({ wide: false });
		renderPage({ seed: subscriptionList() });
		expect(screen.getAllByRole("radio")).toHaveLength(3);
		expect(
			screen.getByRole("radio", { name: "Table" }).closest(".max-md\\:hidden"),
		).not.toBeNull();
	});

	test("a choice shows at once and is remembered under daybook.subscriptions.view", async () => {
		media({ wide: true });
		const { user } = renderPage({ seed: subscriptionList() });
		await user.click(screen.getByRole("radio", { name: "Calendar" }));
		expect(
			screen.getByRole("radio", { name: "Calendar", checked: true }),
		).toBeVisible();
		expect(
			await screen.findByRole("heading", { name: "November 2026" }),
		).toBeVisible();
		expect(window.localStorage.getItem("daybook.subscriptions.view")).toBe(
			"calendar",
		);
		await user.click(screen.getByRole("radio", { name: "Table" }));
		expect(window.localStorage.getItem(VIEW_KEY)).toBe("table");
	});

	test.each(["list", "calendar", "table"])(
		"a remembered %s shows from 768 px",
		(stored) => {
			media({ wide: true });
			window.localStorage.setItem(VIEW_KEY, stored);
			renderPage({ seed: subscriptionList() });
			expect(
				screen.getByRole("radio", { checked: true }),
			).toHaveAccessibleName(
				{ list: "List", calendar: "Calendar", table: "Table" }[
					stored as "list"
				],
			);
		},
	);

	test("a remembered Table shows the list below 768 px, and stays remembered", () => {
		media({ wide: false });
		window.localStorage.setItem(VIEW_KEY, "table");
		renderPage({ seed: subscriptionList() });
		expect(
			screen.getByRole("radio", { name: "List", checked: true }),
		).toBeVisible();
		expect(screen.getByRole("grid", { name: "Subscriptions" })).toBeVisible();
		expect(window.localStorage.getItem(VIEW_KEY)).toBe("table");
	});

	test("a remembered Calendar shows below 768 px", () => {
		media({ wide: false });
		window.localStorage.setItem(VIEW_KEY, "calendar");
		renderPage({ seed: subscriptionList() });
		expect(
			screen.getByRole("radio", { name: "Calendar", checked: true }),
		).toBeVisible();
	});

	test.each(["TABLE", "grid", ""])(
		"anything else remembered, here %j, is List",
		(stored) => {
			media({ wide: true });
			window.localStorage.setItem(VIEW_KEY, stored);
			renderPage({ seed: subscriptionList() });
			expect(
				screen.getByRole("radio", { name: "List", checked: true }),
			).toBeVisible();
		},
	);

	test("is kept while the list is loading, so the switch is already right", () => {
		media({ wide: true });
		window.localStorage.setItem(VIEW_KEY, "calendar");
		renderPage({ answer: async () => (await delay("infinite"), ok({})) });
		expect(
			screen.getByRole("radio", { name: "Calendar", checked: true }),
		).toBeVisible();
	});

	test("storage that refuses a write still switches the view", async () => {
		media({ wide: true });
		vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
			throw new DOMException("full", "QuotaExceededError");
		});
		const { user } = renderPage({ seed: subscriptionList() });
		await user.click(screen.getByRole("radio", { name: "Calendar" }));
		expect(
			screen.getByRole("radio", { name: "Calendar", checked: true }),
		).toBeVisible();
	});

	test("the server renders the list for a device it has no cookie for, whatever storage holds", () => {
		window.localStorage.setItem(VIEW_KEY, "table");
		const queryClient = testClient();
		queryClient.setQueryData(subscriptionKeys.list(), subscriptionList());
		const { Url } = urlHarness("");
		const html = renderToString(
			<InRouter
				pathname="/subscriptions"
				router={routerFake()}
			>
				<Url>
					<AppProviders
						navigate={vi.fn()}
						queryClient={queryClient}
					>
						<SubscriptionsPage locale={IN} />
					</AppProviders>
				</Url>
			</InRouter>,
		);
		expect(html).toContain("Calendar");
		expect(html).toContain("Netflix");
		expect(html).toContain("Within 7 days");
	});
});

describe("the list view in the page (BR-F05-21, BR-F05-22, BR-F05-37)", () => {
	const golden = subscriptionList();
	const [, cultGym] = golden.items;
	const rowNamed = (name: string | RegExp) =>
		screen.getByRole("row", {
			name: typeof name === "string" ? new RegExp(`^${name}`) : name,
		});

	test("shows the grouped list under the summary in the List view", () => {
		media({ wide: true, docked: true });
		renderPage({ seed: golden });
		expect(screen.getByText("Monthly cost")).toBeVisible();
		expect(screen.getByText("Within 7 days · 1")).toBeVisible();
		expect(rowNamed("Netflix")).toBeVisible();
		expect(screen.queryByText(/coming soon/)).toBeNull();
	});

	test("shows no list in the Calendar and Table views", async () => {
		media({ wide: true, docked: true });
		window.localStorage.setItem(VIEW_KEY, "calendar");
		renderPage({ seed: golden });
		expect(screen.queryByRole("grid", { name: "Subscriptions" })).toBeNull();
		expect(
			await screen.findByRole("heading", { name: "November 2026" }),
		).toBeVisible();
	});

	test("pressing a row selects it, and pressing it again clears it", async () => {
		media({ wide: true, docked: true });
		const { user } = renderPage({ seed: golden });
		await user.click(rowNamed("Netflix"));
		expect(rowNamed("Netflix")).toHaveAttribute("aria-selected", "true");
		await user.click(rowNamed("Netflix"));
		expect(rowNamed("Netflix")).toHaveAttribute("aria-selected", "false");
	});

	test("selecting another row moves the selection", async () => {
		media({ wide: true, docked: true });
		const { user } = renderPage({ seed: golden });
		await user.click(rowNamed("Netflix"));
		await user.click(rowNamed("Cult Gym"));
		expect(rowNamed("Netflix")).toHaveAttribute("aria-selected", "false");
		expect(rowNamed("Cult Gym")).toHaveAttribute("aria-selected", "true");
	});

	test("selecting does not change the remembered view", async () => {
		media({ wide: true, docked: true });
		const { user } = renderPage({ seed: golden });
		await user.click(rowNamed("Netflix"));
		expect(window.localStorage.getItem(VIEW_KEY)).toBeNull();
		expect(
			screen.getByRole("radio", { name: "List", checked: true }),
		).toBeVisible();
	});

	test("a Subscription that is deleted elsewhere is no longer selected after a refresh", async () => {
		media({ wide: true, docked: true });
		const { user, queryClient } = renderPage({ seed: golden });
		await user.click(rowNamed("Netflix"));
		queryClient.setQueryData(subscriptionKeys.list(), {
			...golden,
			items: golden.items.slice(1),
		});
		await waitFor(() =>
			expect(screen.queryByRole("row", { name: /^Netflix/ })).toBeNull(),
		);
		queryClient.setQueryData(subscriptionKeys.list(), golden);
		await waitFor(() => expect(rowNamed("Netflix")).toBeVisible());
		expect(rowNamed("Netflix")).toHaveAttribute("aria-selected", "false");
	});

	// BR-F05-23
	test("View charges opens Transactions filtered to the Subscription", async () => {
		media({ wide: true, docked: true });
		const { user, router } = renderPage({ seed: golden });
		await user.click(
			screen.getByRole("button", { name: "Actions for Cult Gym" }),
		);
		await user.click(screen.getByRole("menuitem", { name: "View charges" }));
		expect(router.push).toHaveBeenCalledExactlyOnceWith(
			`/transactions?sub=${cultGym!.id}`,
		);
	});

	test("the row menu does not change the selection", async () => {
		media({ wide: true, docked: true });
		const { user } = renderPage({ seed: golden });
		await user.click(
			screen.getByRole("button", { name: "Actions for Netflix" }),
		);
		await user.keyboard("{Escape}");
		expect(rowNamed("Netflix")).toHaveAttribute("aria-selected", "false");
	});

	// D-625: the server cannot know the width, so a row must not depend on it.
	test("a row is the same markup at every width: the layouts are CSS, so nothing shifts once the page has loaded", () => {
		const html = (wide: boolean, docked: boolean) => {
			media({ wide, docked });
			const view = renderPage({ seed: golden });
			const markup = [
				...view.container.querySelectorAll("[role=row][data-key]"),
			]
				.map((each) =>
					each.innerHTML
						.replace(/id="[^"]*"/g, "")
						.replace(/aria-labelledby="[^"]*"/g, ""),
				)
				.join("|");
			view.unmount();
			return markup;
		};
		const narrow = html(false, false);
		expect(narrow.length).toBeGreaterThan(0);
		expect(html(true, false)).toBe(narrow);
		expect(html(true, true)).toBe(narrow);
	});

	test("below 768 px the menu and the date column are hidden by CSS, not left out", () => {
		media({ wide: false });
		renderPage({ seed: golden });
		for (const button of screen.getAllByRole("button", {
			name: /Actions for/,
		})) {
			expect(button.closest(".max-md\\:hidden")).not.toBeNull();
		}
		expect(rowNamed("Netflix")).toBeVisible();
	});
});

describe("the deep link ?open=<id> (BR-F05-21, D-593)", () => {
	const golden = subscriptionList();
	const [netflix] = golden.items;
	const rowNamed = (name: string) =>
		screen.getByRole("row", { name: new RegExp(`^${name}`) });
	const ended = subscriptionItem("cultGym", {
		id: "0192f0c4-7a1e-7c3b-9d2a-00000000ed01",
		name: "Old plan",
		status: "ended",
		endDate: "2026-09-30",
		nextDueOn: null,
	});
	const eightEnded = Array.from({ length: 8 }, (_, i) => ({
		...ended,
		id: `0192f0c4-7a1e-7c3b-9d2a-00000000ed${String(10 + i)}`,
		name: `Old plan ${i + 1}`,
		endDate: `2026-0${i + 1}-15`,
	}));
	const withEnded = (items: typeof eightEnded): SubscriptionList => ({
		...golden,
		items: [...golden.items, ...items],
	});

	test("selects the Subscription and removes the parameter, keeping the view", async () => {
		media({ wide: true, docked: true });
		window.localStorage.setItem(VIEW_KEY, "list");
		const { calls } = renderPage({
			seed: golden,
			search: `?open=${netflix!.id}`,
		});
		expect(rowNamed("Netflix")).toHaveAttribute("aria-selected", "true");
		await waitFor(() =>
			expect(calls).toEqual([{ mode: "replace", href: "/subscriptions" }]),
		);
		expect(
			screen.getByRole("radio", { name: "List", checked: true }),
		).toBeVisible();
		expect(window.localStorage.getItem(VIEW_KEY)).toBe("list");
	});

	test("an unknown id selects nothing, and the parameter is removed", async () => {
		media({ wide: true, docked: true });
		const { calls } = renderPage({
			seed: golden,
			search: "?open=0192f0c4-0000-7000-8000-000000000000",
		});
		for (const row of screen
			.getAllByRole("row")
			.filter((r) => r.hasAttribute("data-key"))) {
			expect(row).toHaveAttribute("aria-selected", "false");
		}
		await waitFor(() => expect(calls).toHaveLength(1));
	});

	test("an ended one is selected with the Ended group open and showing every row", async () => {
		media({ wide: true, docked: true });
		const items = [...eightEnded];
		renderPage({
			seed: withEnded(items),
			search: `?open=${items[0]!.id}`,
		});
		const trigger = screen.getByRole("button", { name: /^Ended · 8/ });
		expect(trigger).toHaveAttribute("aria-expanded", "true");
		expect(screen.getByRole("button", { name: "Show fewer" })).toBeVisible();
		expect(rowNamed("Old plan 1")).toHaveAttribute("aria-selected", "true");
		expect(rowNamed("Old plan 8")).toBeVisible();
	});

	test("a running one leaves the Ended group closed", () => {
		media({ wide: true, docked: true });
		renderPage({
			seed: withEnded(eightEnded),
			search: `?open=${netflix!.id}`,
		});
		expect(screen.getByRole("button", { name: "Ended · 8" })).toHaveAttribute(
			"aria-expanded",
			"false",
		);
	});

	test("waits for the list to load, then selects", async () => {
		media({ wide: true, docked: true });
		const { calls } = renderPage({
			search: `?open=${netflix!.id}`,
			answer: async () => {
				await delay(30);
				return ok(golden);
			},
		});
		expect(calls).toEqual([]);
		await waitFor(() =>
			expect(rowNamed("Netflix")).toHaveAttribute("aria-selected", "true"),
		);
		await waitFor(() => expect(calls).toHaveLength(1));
	});

	test("in the calendar view it leaves the view as it is", async () => {
		media({ wide: true, docked: true });
		window.localStorage.setItem(VIEW_KEY, "calendar");
		const { calls } = renderPage({
			seed: golden,
			search: `?open=${netflix!.id}`,
		});
		expect(
			await screen.findByRole("heading", { name: "November 2026" }),
		).toBeVisible();
		await waitFor(() => expect(calls).toHaveLength(1));
		expect(window.localStorage.getItem(VIEW_KEY)).toBe("calendar");
	});

	test("with no list it does nothing and keeps the parameter", async () => {
		media({ wide: true, docked: true });
		const { calls } = renderPage({
			search: `?open=${netflix!.id}`,
			answer: () => refuse(500, "internal_error"),
		});
		await waitFor(() =>
			expect(
				screen.getByText("Subscriptions could not be loaded."),
			).toBeVisible(),
		);
		expect(calls).toEqual([]);
	});

	test("a user can press the selected row to clear it afterwards", async () => {
		media({ wide: true, docked: true });
		const { user } = renderPage({
			seed: golden,
			search: `?open=${netflix!.id}`,
		});
		await user.click(rowNamed("Netflix"));
		expect(rowNamed("Netflix")).toHaveAttribute("aria-selected", "false");
	});
});

describe("the panel and the keys (BR-F05-40, BR-F05-45)", () => {
	const golden = subscriptionList();
	const [netflix, cultGym] = golden.items;
	const rowNamed = (name: string) =>
		screen.getByRole("row", { name: new RegExp(`^${name}`) });
	const panel = () =>
		screen.queryByRole("complementary", { name: "Subscription" });
	const selectedNames = () =>
		screen
			.getAllByRole("row")
			.filter((row) => row.getAttribute("aria-selected") === "true")
			.map((row) => row.textContent?.split("Entertainment")[0]);

	describe("docked, from 1180 px", () => {
		test("shows the cost summary beside the list with nothing selected", () => {
			media({ wide: true, docked: true });
			renderPage({ seed: golden });
			expect(panel()).toBeVisible();
			expect(
				screen.getByRole("heading", { name: "Your Subscriptions" }),
			).toBeVisible();
			expect(
				screen.getByText(
					"Select a Subscription to see its charges. Up and down arrows move.",
				),
			).toBeVisible();
		});

		// AC-F05-39
		test("selecting a row shows it in the panel, with the charges it reads from Transactions", async () => {
			media({ wide: true, docked: true });
			const { user } = renderPage({ seed: golden });
			await user.click(rowNamed("Netflix"));
			expect(
				await screen.findByRole("heading", { name: "Netflix" }),
			).toBeVisible();
			expect(panel()).toHaveTextContent("Next charge");
			// With no charge yet, the timeline still holds the dates to come.
			expect(
				await screen.findByText("Next. Added to Transactions on the day."),
			).toBeVisible();
		});

		// AC-F05-39
		test("Close details clears the selection and brings the summary back", async () => {
			media({ wide: true, docked: true });
			const { user } = renderPage({ seed: golden });
			await user.click(rowNamed("Netflix"));
			await user.click(
				await screen.findByRole("button", { name: "Close details" }),
			);
			expect(
				screen.getByRole("heading", { name: "Your Subscriptions" }),
			).toBeVisible();
			expect(rowNamed("Netflix")).toHaveAttribute("aria-selected", "false");
		});

		// AC-F05-39
		test("Escape clears the selection", async () => {
			media({ wide: true, docked: true });
			const { user } = renderPage({ seed: golden });
			await user.click(rowNamed("Netflix"));
			await screen.findByRole("heading", { name: "Netflix" });
			await user.keyboard("{Escape}");
			expect(
				screen.getByRole("heading", { name: "Your Subscriptions" }),
			).toBeVisible();
			expect(selectedNames()).toEqual([]);
		});

		test("Escape with nothing selected does nothing", async () => {
			media({ wide: true, docked: true });
			const { user } = renderPage({ seed: golden });
			await user.keyboard("{Escape}");
			expect(
				screen.getByRole("heading", { name: "Your Subscriptions" }),
			).toBeVisible();
		});

		test("Escape inside the search of another widget is left to it: a text field keeps it", async () => {
			media({ wide: true, docked: true });
			const { user } = renderPage({ seed: golden });
			await user.click(rowNamed("Netflix"));
			const field = document.createElement("input");
			document.body.append(field);
			field.focus();
			await user.keyboard("{Escape}");
			expect(rowNamed("Netflix")).toHaveAttribute("aria-selected", "true");
			field.remove();
		});

		test("pressing the selected row again clears it", async () => {
			media({ wide: true, docked: true });
			const { user } = renderPage({ seed: golden });
			await user.click(rowNamed("Netflix"));
			await user.click(rowNamed("Netflix"));
			expect(
				screen.getByRole("heading", { name: "Your Subscriptions" }),
			).toBeVisible();
		});

		// AC-F05-39
		test("Down selects the first row, then the next, and Up goes back", async () => {
			media({ wide: true, docked: true });
			const { user } = renderPage({ seed: golden });
			await user.keyboard("{ArrowDown}");
			expect(rowNamed("Netflix")).toHaveAttribute("aria-selected", "true");
			expect(rowNamed("Netflix")).toHaveFocus();
			await user.keyboard("{ArrowDown}");
			expect(rowNamed("Cult Gym")).toHaveAttribute("aria-selected", "true");
			expect(rowNamed("Netflix")).toHaveAttribute("aria-selected", "false");
			await user.keyboard("{ArrowUp}");
			expect(rowNamed("Netflix")).toHaveAttribute("aria-selected", "true");
			expect(
				await screen.findByRole("heading", { name: "Netflix" }),
			).toBeVisible();
		});

		// AC-F05-39
		test("Down walks the rows in the order shown and stops at the last", async () => {
			media({ wide: true, docked: true });
			const { user } = renderPage({ seed: golden });
			for (let i = 0; i < 7; i++) await user.keyboard("{ArrowDown}");
			expect(rowNamed("Amazon Prime")).toHaveAttribute(
				"aria-selected",
				"true",
			);
			expect(rowNamed("Amazon Prime")).toHaveFocus();
		});

		test("the ended rows are walked only while their group is open", async () => {
			media({ wide: true, docked: true });
			const ended = subscriptionItem("netflix", {
				id: "0192f0c4-7a1e-7c3b-9d2a-00000000ed01",
				name: "Old plan",
				status: "ended",
				endDate: "2026-09-30",
				nextDueOn: null,
			});
			const { user } = renderPage({
				seed: { ...golden, items: [...golden.items, ended] },
			});
			for (let i = 0; i < 9; i++) await user.keyboard("{ArrowDown}");
			expect(rowNamed("Amazon Prime")).toHaveAttribute(
				"aria-selected",
				"true",
			);
			await user.click(screen.getByRole("button", { name: "Ended · 1" }));
			await user.keyboard("{ArrowDown}");
			expect(rowNamed("Old plan")).toHaveAttribute("aria-selected", "true");
		});

		test("the view charges button of the panel opens Transactions for it", async () => {
			media({ wide: true, docked: true });
			const { user, router } = renderPage({ seed: golden });
			await user.click(rowNamed("Cult Gym"));
			// The seeded list says Cult Gym has one charge, so the panel offers View charges.
			await user.click(
				await screen.findByRole("button", { name: "View charges" }),
			);
			expect(router.push).toHaveBeenCalledExactlyOnceWith(
				`/transactions?sub=${cultGym!.id}`,
			);
		});

		test("each selection asks for that Subscription's charges, and only once", async () => {
			media({ wide: true, docked: true });
			const { user } = renderPage({ seed: golden });
			const reads = route(network, "get", "/api/transactions", () =>
				ok(listPage([])),
			);
			await user.click(rowNamed("Netflix"));
			await screen.findByRole("heading", { name: "Netflix" });
			await waitFor(() => expect(reads).toHaveLength(1));
			await user.click(rowNamed("Cult Gym"));
			expect(
				await screen.findByRole("heading", { name: "Cult Gym" }),
			).toBeVisible();
			await waitFor(() => expect(reads).toHaveLength(2));
			expect(reads[0]!.path).toContain(`sub=${netflix!.id}`);
			expect(reads[1]!.path).toContain(`sub=${cultGym!.id}`);
		});

		test("nothing is asked for while nothing is selected", async () => {
			media({ wide: true, docked: true });
			renderPage({ seed: golden });
			const reads = route(network, "get", "/api/transactions", () =>
				ok(listPage([])),
			);
			await new Promise((resolve) => setTimeout(resolve, 50));
			expect(reads).toHaveLength(0);
		});
	});

	describe("below 1180 px, a drawer", () => {
		test("is not there until a row is selected, and the list keeps the page", () => {
			media({ wide: true });
			renderPage({ seed: golden });
			expect(screen.queryByRole("dialog")).toBeNull();
			expect(panel()).toBeNull();
			expect(rowNamed("Netflix")).toBeVisible();
		});

		// AC-F05-39
		test("pressing a row opens the drawer with it", async () => {
			media({ wide: true });
			const { user } = renderPage({ seed: golden });
			await user.click(rowNamed("Netflix"));
			const drawer = await screen.findByRole("dialog", {
				name: "Subscription",
			});
			expect(drawer).toHaveTextContent("Netflix");
		});

		// AC-F05-39
		test("Close details closes it and clears the selection", async () => {
			media({ wide: true });
			const { user } = renderPage({ seed: golden });
			await user.click(rowNamed("Netflix"));
			await user.click(
				await screen.findByRole("button", { name: "Close details" }),
			);
			await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
			expect(rowNamed("Netflix")).toHaveAttribute("aria-selected", "false");
		});

		// AC-F05-39
		test("Escape closes it and clears the selection", async () => {
			media({ wide: true });
			const { user } = renderPage({ seed: golden });
			await user.click(rowNamed("Netflix"));
			await screen.findByRole("dialog");
			await user.keyboard("{Escape}");
			await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
			expect(rowNamed("Netflix")).toHaveAttribute("aria-selected", "false");
		});

		// AC-F05-39
		test("Down only moves focus: nothing is selected and no drawer opens", async () => {
			media({ wide: true });
			const { user } = renderPage({ seed: golden });
			await user.keyboard("{ArrowDown}");
			expect(rowNamed("Netflix")).toHaveFocus();
			await user.keyboard("{ArrowDown}");
			expect(rowNamed("Cult Gym")).toHaveFocus();
			expect(selectedNames()).toEqual([]);
			expect(screen.queryByRole("dialog")).toBeNull();
		});

		// AC-F05-39
		test("while the drawer is open the arrow keys leave the list alone: focus stays in the drawer", async () => {
			media({ wide: true });
			const { user } = renderPage({ seed: golden });
			await user.click(rowNamed("Netflix"));
			const drawer = await screen.findByRole("dialog");
			await user.keyboard("{ArrowDown}{ArrowDown}{ArrowUp}");
			expect(drawer).toContainElement(document.activeElement as HTMLElement);
			expect(screen.queryByRole("heading", { name: "Cult Gym" })).toBeNull();
		});

		test("a deep link opens the drawer on that Subscription", async () => {
			media({ wide: true });
			renderPage({ seed: golden, search: `?open=${netflix!.id}` });
			const drawer = await screen.findByRole("dialog", {
				name: "Subscription",
			});
			expect(drawer).toHaveTextContent("Netflix");
		});

		test("on a phone it is the same drawer, full width, and the list has no menu", async () => {
			media({ wide: false });
			const { user } = renderPage({ seed: golden });
			await user.click(rowNamed("Netflix"));
			expect(
				await screen.findByRole("dialog", { name: "Subscription" }),
			).toBeVisible();
		});
	});

	describe("a deep link, docked", () => {
		test("shows the Subscription in the panel at once", async () => {
			media({ wide: true, docked: true });
			renderPage({ seed: golden, search: `?open=${cultGym!.id}` });
			expect(
				await screen.findByRole("heading", { name: "Cult Gym" }),
			).toBeVisible();
			expect(rowNamed("Cult Gym")).toHaveAttribute("aria-selected", "true");
		});

		test("an unknown id leaves the summary", async () => {
			media({ wide: true, docked: true });
			renderPage({ seed: golden, search: "?open=nope" });
			expect(
				screen.getByRole("heading", { name: "Your Subscriptions" }),
			).toBeVisible();
		});
	});

	describe("when the panel is left out (BR-F05-40)", () => {
		test("while the list loads", () => {
			media({ wide: true, docked: true });
			renderPage({ answer: async () => (await delay("infinite"), ok({})) });
			expect(panel()).toBeNull();
		});

		test("on error", async () => {
			media({ wide: true, docked: true });
			renderPage({ answer: () => refuse(500, "internal_error") });
			await screen.findByText("Subscriptions could not be loaded.");
			expect(panel()).toBeNull();
		});

		test("with no Subscription", () => {
			media({ wide: true, docked: true });
			renderPage({ seed: emptyList() });
			expect(panel()).toBeNull();
			expect(screen.queryByRole("dialog")).toBeNull();
		});
	});

	test("the panel shows in the Calendar and Table views too, as the page's", async () => {
		media({ wide: true, docked: true });
		window.localStorage.setItem(VIEW_KEY, "calendar");
		renderPage({ seed: golden });
		expect(panel()).toBeVisible();
	});

	test("a selection that vanishes from the list takes the panel back to the summary", async () => {
		media({ wide: true, docked: true });
		const { user, queryClient } = renderPage({ seed: golden });
		await user.click(rowNamed("Netflix"));
		await screen.findByRole("heading", { name: "Netflix" });
		queryClient.setQueryData(subscriptionKeys.list(), {
			...golden,
			items: golden.items.slice(1),
		});
		expect(
			await screen.findByRole("heading", { name: "Your Subscriptions" }),
		).toBeVisible();
	});
});

describe("filtering by a category of the panel (BR-F05-50, D-622)", () => {
	const golden = subscriptionList();
	const [netflix] = golden.items;
	const rowNamed = (name: string) =>
		screen.getByRole("row", { name: new RegExp(`^${name}`) });
	const hasRow = (name: string) =>
		screen.queryByRole("row", { name: new RegExp(`^${name}`) }) !== null;
	const summaryButton = (name: string, pressed?: boolean) =>
		screen.getByRole("button", {
			name,
			...(pressed === undefined ? {} : { pressed }),
		});
	const chip = () => screen.queryByRole("grid", { name: "Showing" });

	// AC-F05-39
	test("pressing a category narrows the list to its Subscriptions, in every group", async () => {
		media({ wide: true, docked: true });
		const { user } = renderPage({ seed: golden });
		await user.click(summaryButton("Health"));
		expect(rowNamed("Cult Gym")).toBeVisible();
		for (const other of ["Netflix", "Sunrise Apartments", "Amazon Prime"])
			expect(hasRow(other)).toBe(false);
	});

	test("shows Showing, the category as a chip and Show all above the list", async () => {
		media({ wide: true, docked: true });
		const { user } = renderPage({ seed: golden });
		await user.click(summaryButton("Health"));
		expect(chip()).toHaveTextContent("Health");
		expect(screen.getByRole("button", { name: "Show all" })).toBeVisible();
	});

	test("the pressed category reads as pressed in the summary, and the others not", async () => {
		media({ wide: true, docked: true });
		const { user } = renderPage({ seed: golden });
		await user.click(summaryButton("Health"));
		expect(summaryButton("Health", true)).toBeVisible();
		expect(summaryButton("Housing", false)).toBeVisible();
	});

	// AC-F05-39
	test("the groups follow the filtered rows: Entertainment is Netflix soon and Amazon Prime later", async () => {
		media({ wide: true, docked: true });
		const { user } = renderPage({ seed: golden });
		await user.click(summaryButton("Entertainment"));
		expect(screen.getByText("Within 7 days · 1")).toBeVisible();
		expect(screen.getByText("Later · 1")).toBeVisible();
		expect(screen.queryByText(/Within 30 days/)).toBeNull();
	});

	// AC-F05-39
	test("the summary at the top still counts every Subscription", async () => {
		media({ wide: true, docked: true });
		const { user } = renderPage({ seed: golden });
		await user.click(summaryButton("Health"));
		expect(
			screen.getByText("₹2,43,287.00 a year · 4 Subscriptions"),
		).toBeVisible();
		expect(screen.getByText("Next 30 days · 3 charges")).toBeVisible();
	});

	test("the panel's own categories stay all there", async () => {
		media({ wide: true, docked: true });
		const { user } = renderPage({ seed: golden });
		await user.click(summaryButton("Health"));
		for (const name of ["Housing", "Health", "Entertainment"])
			expect(summaryButton(name)).toBeVisible();
	});

	test("pressing the same category again clears the filter", async () => {
		media({ wide: true, docked: true });
		const { user } = renderPage({ seed: golden });
		await user.click(summaryButton("Health"));
		await user.click(summaryButton("Health", true));
		expect(chip()).toBeNull();
		expect(hasRow("Netflix")).toBe(true);
		expect(hasRow("Sunrise Apartments")).toBe(true);
	});

	test("pressing another category replaces the filter", async () => {
		media({ wide: true, docked: true });
		const { user } = renderPage({ seed: golden });
		await user.click(summaryButton("Health"));
		await user.click(summaryButton("Housing"));
		expect(chip()).toHaveTextContent("Housing");
		expect(hasRow("Sunrise Apartments")).toBe(true);
		expect(hasRow("Cult Gym")).toBe(false);
	});

	test("Show all and the chip's remove button each clear it", async () => {
		media({ wide: true, docked: true });
		const { user } = renderPage({ seed: golden });
		await user.click(summaryButton("Health"));
		await user.click(screen.getByRole("button", { name: "Show all" }));
		expect(chip()).toBeNull();
		expect(hasRow("Netflix")).toBe(true);
		await user.click(summaryButton("Health"));
		await user.click(screen.getByRole("button", { name: "Remove Health" }));
		expect(chip()).toBeNull();
		expect(hasRow("Sunrise Apartments")).toBe(true);
	});

	test("Up and Down walk only the rows shown", async () => {
		media({ wide: true, docked: true });
		const { user } = renderPage({ seed: golden });
		await user.click(summaryButton("Entertainment"));
		await user.keyboard("{ArrowDown}");
		expect(rowNamed("Netflix")).toHaveAttribute("aria-selected", "true");
		await user.keyboard("{ArrowDown}");
		expect(rowNamed("Amazon Prime")).toHaveAttribute("aria-selected", "true");
		await user.keyboard("{ArrowDown}");
		expect(rowNamed("Amazon Prime")).toHaveAttribute("aria-selected", "true");
	});

	test("selecting a row of the filtered list shows it in the panel, and Close details brings the summary and the filter back", async () => {
		media({ wide: true, docked: true });
		const { user } = renderPage({ seed: golden });
		await user.click(summaryButton("Health"));
		await user.click(rowNamed("Cult Gym"));
		expect(
			await screen.findByRole("heading", { name: "Cult Gym" }),
		).toBeVisible();
		await user.click(screen.getByRole("button", { name: "Close details" }));
		expect(summaryButton("Health", true)).toBeVisible();
		expect(chip()).toHaveTextContent("Health");
	});

	test("the Ended group is narrowed too", async () => {
		media({ wide: true, docked: true });
		const base = subscriptionList();
		const ended = (id: string, name: string, category: "health" | "housing") =>
			subscriptionItem("cultGym", {
				id,
				name,
				category,
				status: "ended",
				endDate: "2026-09-30",
				nextDueOn: null,
			});
		const seed = {
			...base,
			items: [
				...base.items,
				ended("0192f0c4-7a1e-7c3b-9d2a-00000000e001", "Old gym", "health"),
				ended("0192f0c4-7a1e-7c3b-9d2a-00000000e002", "Old flat", "housing"),
			],
		};
		const { user } = renderPage({ seed });
		expect(screen.getByRole("button", { name: "Ended · 2" })).toBeVisible();
		await user.click(summaryButton("Health"));
		expect(screen.getByRole("button", { name: "Ended · 1" })).toBeVisible();
		await user.click(screen.getByRole("button", { name: "Ended · 1" }));
		expect(hasRow("Old gym")).toBe(true);
		expect(hasRow("Old flat")).toBe(false);
	});

	test("a deep link clears a filter that would hide its row", async () => {
		media({ wide: true, docked: true });
		const { user } = renderPage({ seed: golden });
		await user.click(summaryButton("Health"));
		expect(hasRow("Netflix")).toBe(false);
		act(() => {
			window.history.pushState(null, "", `/subscriptions?open=${netflix!.id}`);
		});
		expect(
			await screen.findByRole("heading", { name: "Netflix" }),
		).toBeVisible();
		expect(chip()).toBeNull();
		expect(rowNamed("Netflix")).toHaveAttribute("aria-selected", "true");
		expect(hasRow("Cult Gym")).toBe(true);
	});

	test("a category that has lost its last Subscription stops filtering", async () => {
		media({ wide: true, docked: true });
		const { user, queryClient } = renderPage({ seed: golden });
		await user.click(summaryButton("Health"));
		queryClient.setQueryData(subscriptionKeys.list(), {
			...golden,
			items: golden.items.filter((item) => item.category !== "health"),
		});
		await waitFor(() => expect(chip()).toBeNull());
		expect(hasRow("Netflix")).toBe(true);
		expect(screen.queryByRole("button", { name: "Health" })).toBeNull();
	});

	test("the filter is not remembered across a reload", async () => {
		media({ wide: true, docked: true });
		const { user, unmount } = renderPage({ seed: golden });
		await user.click(summaryButton("Health"));
		unmount();
		renderPage({ seed: golden });
		expect(chip()).toBeNull();
		expect(hasRow("Netflix")).toBe(true);
	});

	test("the filter does not change the remembered view", async () => {
		media({ wide: true, docked: true });
		const { user } = renderPage({ seed: golden });
		await user.click(summaryButton("Health"));
		expect(window.localStorage.getItem(VIEW_KEY)).toBeNull();
	});
});

describe("the calendar in the page (BR-F05-38, BR-F05-45, D-626)", () => {
	const golden = subscriptionList();
	const [netflix, cultGym, sunrise] = golden.items;
	const chargeOf = (item: typeof netflix, date: string, amountMinor: number) =>
		charge({
			subscriptionId: item!.id,
			subscription: { id: item!.id, name: item!.name },
			payee: item!.name,
			category: item!.category,
			occurredOn: date,
			dueOn: date,
			amountMinor,
		});
	const SUNRISE_CHARGE = chargeOf(sunrise, "2026-11-01", 1800000);
	const orphan = charge({
		subscriptionId: null,
		subscription: null,
		payee: "Old gym",
		occurredOn: "2026-11-03",
		dueOn: null,
		amountMinor: 50000,
	});
	const inCalendar = (charges = [SUNRISE_CHARGE]) => {
		window.localStorage.setItem(VIEW_KEY, "calendar");
		return renderPage({ seed: golden, charges });
	};
	const chip = (name: RegExp) => screen.findByRole("button", { name });
	const panel = () =>
		screen.queryByRole("complementary", { name: "Subscription" });
	const rowNamed = (name: string) =>
		screen.getByRole("row", { name: new RegExp(`^${name}`) });

	test("the Calendar view shows the month and no list", async () => {
		media({ wide: true, docked: true });
		inCalendar();
		expect(
			await screen.findByRole("heading", { name: "November 2026" }),
		).toBeVisible();
		expect(screen.queryByRole("grid", { name: "Subscriptions" })).toBeNull();
		expect(
			screen.getByRole("radio", { name: "Calendar", checked: true }),
		).toBeVisible();
	});

	test("the summary stays above it", async () => {
		media({ wide: true, docked: true });
		inCalendar();
		await screen.findByRole("heading", { name: "November 2026" });
		expect(screen.getByText("Monthly cost")).toBeVisible();
	});

	test("an item of the month is a button, and the panel stays beside it", async () => {
		media({ wide: true, docked: true });
		inCalendar();
		expect(await chip(/^Netflix, ₹649.00, due/)).toBeVisible();
		expect(panel()).toBeVisible();
	});

	// AC-F05-40
	test("pressing an item selects its Subscription and marks that date in the timeline", async () => {
		media({ wide: true, docked: true });
		const { user } = inCalendar();
		await user.click(await chip(/^Netflix/));
		expect(
			await screen.findByRole("heading", { name: "Netflix" }),
		).toBeVisible();
		const line = (await screen.findAllByText("5 Nov 2026"))[0]!.closest("li");
		expect(line).toHaveClass("bg-accent-soft");
	});

	test("the pressed item is tinted in the grid", async () => {
		media({ wide: true, docked: true });
		const { user } = inCalendar();
		await user.click(await chip(/^Netflix/));
		expect(await chip(/^Netflix/)).toHaveClass("bg-accent-soft");
		expect(await chip(/^Cult Gym/)).not.toHaveClass("bg-accent-soft");
	});

	test("the selection is there in the List view too", async () => {
		media({ wide: true, docked: true });
		const { user } = inCalendar();
		await user.click(await chip(/^Netflix/));
		await user.click(screen.getByRole("radio", { name: "List" }));
		expect(rowNamed("Netflix")).toHaveAttribute("aria-selected", "true");
	});

	test("selecting the Subscription from the list afterwards marks no date", async () => {
		media({ wide: true, docked: true });
		const { user } = inCalendar();
		await user.click(await chip(/^Netflix/));
		await user.click(screen.getByRole("radio", { name: "List" }));
		await user.click(rowNamed("Netflix"));
		await user.click(rowNamed("Netflix"));
		await screen.findByRole("heading", { name: "Netflix" });
		for (const line of await screen.findAllByText("5 Nov 2026")) {
			expect(line.closest("li")).not.toHaveClass("bg-accent-soft");
		}
	});

	test("pressing an item of another Subscription moves the selection and the mark", async () => {
		media({ wide: true, docked: true });
		const { user } = inCalendar();
		await user.click(await chip(/^Netflix/));
		await user.click(await chip(/^Cult Gym/));
		expect(
			await screen.findByRole("heading", { name: "Cult Gym" }),
		).toBeVisible();
		expect(await chip(/^Cult Gym/)).toHaveClass("bg-accent-soft");
		expect(await chip(/^Netflix/)).not.toHaveClass("bg-accent-soft");
	});

	test("Escape clears the selection and the tint", async () => {
		media({ wide: true, docked: true });
		const { user } = inCalendar();
		await user.click(await chip(/^Netflix/));
		await screen.findByRole("heading", { name: "Netflix" });
		await user.keyboard("{Escape}");
		expect(
			screen.getByRole("heading", { name: "Your Subscriptions" }),
		).toBeVisible();
		expect(await chip(/^Netflix/)).not.toHaveClass("bg-accent-soft");
	});

	test("Close details clears them too", async () => {
		media({ wide: true, docked: true });
		const { user } = inCalendar();
		await user.click(await chip(/^Netflix/));
		await user.click(
			await screen.findByRole("button", { name: "Close details" }),
		);
		expect(await chip(/^Netflix/)).not.toHaveClass("bg-accent-soft");
	});

	// AC-F05-40
	test("a charge of a deleted Subscription shows the toast and selects nothing", async () => {
		media({ wide: true, docked: true });
		const { user } = inCalendar([SUNRISE_CHARGE, orphan]);
		await user.click(await chip(/^Old gym/));
		expect(
			await screen.findByText(
				"This charge belongs to a deleted Subscription. It stays in Transactions as an ordinary expense.",
			),
		).toBeVisible();
		expect(
			screen.getByRole("heading", { name: "Your Subscriptions" }),
		).toBeVisible();
	});

	test("it leaves an earlier selection as it was", async () => {
		media({ wide: true, docked: true });
		const { user } = inCalendar([SUNRISE_CHARGE, orphan]);
		await user.click(await chip(/^Netflix/));
		await screen.findByRole("heading", { name: "Netflix" });
		await user.click(await chip(/^Old gym/));
		expect(screen.getByRole("heading", { name: "Netflix" })).toBeVisible();
	});

	test("a day's popover closes on Escape and leaves the selection alone", async () => {
		media({ wide: true, docked: true });
		const charges = [
			SUNRISE_CHARGE,
			chargeOf(netflix, "2026-11-01", 64900),
			chargeOf(cultGym, "2026-11-01", 150000),
		];
		const { user } = inCalendar(charges);
		await user.click(await chip(/^Netflix, ₹649.00, due/));
		await screen.findByRole("heading", { name: "Netflix" });
		await user.click(await screen.findByRole("button", { name: /more/ }));
		await screen.findByRole("dialog", { name: "Sun, 1 Nov" });
		await user.keyboard("{Escape}");
		await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
		expect(screen.getByRole("heading", { name: "Netflix" })).toBeVisible();
	});

	test("an item chosen in a day's popover selects its Subscription", async () => {
		media({ wide: true, docked: true });
		const charges = [
			SUNRISE_CHARGE,
			chargeOf(netflix, "2026-11-01", 64900),
			chargeOf(cultGym, "2026-11-01", 150000),
		];
		const { user } = inCalendar(charges);
		await user.click(await screen.findByRole("button", { name: /more/ }));
		const dialog = await screen.findByRole("dialog");
		await user.click(within(dialog).getByRole("button", { name: /Cult Gym/ }));
		expect(
			await screen.findByRole("heading", { name: "Cult Gym" }),
		).toBeVisible();
	});

	test("Up and Down do nothing in the calendar", async () => {
		media({ wide: true, docked: true });
		const { user } = inCalendar();
		await screen.findByRole("heading", { name: "November 2026" });
		await user.keyboard("{ArrowDown}");
		expect(
			screen.getByRole("heading", { name: "Your Subscriptions" }),
		).toBeVisible();
	});

	test("the panel's categories do not narrow the calendar", async () => {
		media({ wide: true, docked: true });
		const { user } = renderPage({ seed: golden, charges: [SUNRISE_CHARGE] });
		await user.click(screen.getByRole("button", { name: "Health" }));
		await user.click(screen.getByRole("radio", { name: "Calendar" }));
		expect(await chip(/^Netflix/)).toBeVisible();
		expect(await chip(/^Cult Gym/)).toBeVisible();
	});

	test("an item of another category clears the category filter", async () => {
		media({ wide: true, docked: true });
		const { user } = renderPage({ seed: golden, charges: [SUNRISE_CHARGE] });
		await user.click(screen.getByRole("button", { name: "Health" }));
		await user.click(screen.getByRole("radio", { name: "Calendar" }));
		await user.click(await chip(/^Netflix/));
		await user.click(screen.getByRole("radio", { name: "List" }));
		expect(screen.queryByRole("grid", { name: "Showing" })).toBeNull();
		expect(rowNamed("Netflix")).toHaveAttribute("aria-selected", "true");
	});

	test("an item of the filtered category keeps the filter", async () => {
		media({ wide: true, docked: true });
		const { user } = renderPage({ seed: golden, charges: [SUNRISE_CHARGE] });
		await user.click(screen.getByRole("button", { name: "Entertainment" }));
		await user.click(screen.getByRole("radio", { name: "Calendar" }));
		await user.click(await chip(/^Netflix/));
		await user.click(screen.getByRole("radio", { name: "List" }));
		expect(screen.getByRole("grid", { name: "Showing" })).toHaveTextContent(
			"Entertainment",
		);
	});

	test("below 1180 px a pressed item opens the drawer", async () => {
		media({ wide: true, docked: false });
		const { user } = inCalendar();
		await user.click(await chip(/^Netflix/));
		expect(
			await screen.findByRole("dialog", { name: "Subscription" }),
		).toBeVisible();
	});

	test("below 768 px it shows the days, and a pressed item selects", async () => {
		media({ wide: false, docked: false });
		const { user } = inCalendar();
		expect(
			await screen.findByRole("heading", { name: "2 to 8 Nov" }),
		).toBeVisible();
		expect(screen.queryByRole("table")).toBeNull();
		await user.click(await chip(/Netflix/));
		expect(
			await screen.findByRole("dialog", { name: "Subscription" }),
		).toBeVisible();
	});

	test("it reads the months and the month's charges, and no list again", async () => {
		media({ wide: true, docked: true });
		const { reads } = inCalendar();
		await screen.findByRole("heading", { name: "November 2026" });
		expect(reads).toHaveLength(0);
	});

	test("the server's own draw is the list, never the calendar", () => {
		window.localStorage.setItem(VIEW_KEY, "calendar");
		const queryClient = testClient();
		queryClient.setQueryData(subscriptionKeys.list(), golden);
		const { Url } = urlHarness("");
		const html = renderToString(
			<InRouter
				pathname="/subscriptions"
				router={routerFake()}
			>
				<Url>
					<AppProviders
						navigate={vi.fn()}
						queryClient={queryClient}
					>
						<SubscriptionsPage locale={IN} />
					</AppProviders>
				</Url>
			</InRouter>,
		);
		expect(html).not.toContain("November 2026");
		expect(html).toContain("Within 7 days");
	});

	test("a Subscription gone from the list while it is marked leaves no mark, even when it returns", async () => {
		media({ wide: true, docked: true });
		const { user, queryClient } = inCalendar();
		await user.click(await chip(/^Netflix/));
		await screen.findByRole("heading", { name: "Netflix" });
		queryClient.setQueryData(subscriptionKeys.list(), {
			...golden,
			items: golden.items.filter((each) => each.id !== netflix!.id),
		});
		expect(
			await screen.findByRole("heading", { name: "Your Subscriptions" }),
		).toBeVisible();
		queryClient.setQueryData(subscriptionKeys.list(), golden);
		expect(
			await screen.findByRole("button", { name: /^Netflix/ }),
		).not.toHaveClass("bg-accent-soft");
		expect(
			screen.getByRole("heading", { name: "Your Subscriptions" }),
		).toBeVisible();
	});
});

describe("the table in the page (BR-F05-39, BR-F05-45, BR-F05-50, D-570, D-627)", () => {
	const golden = subscriptionList();
	const [netflix] = golden.items;
	const inTable = () => {
		window.localStorage.setItem(VIEW_KEY, "table");
	};
	const table = () => screen.getByRole("grid", { name: /^Ended Subscriptions/ });
	const rowNamed = (name: string) =>
		within(table()).getByRole("row", { name: new RegExp(`^${name}`) });
	const names = () =>
		within(table())
			.getAllByRole("row")
			.slice(1, -1)
			.map((row) => within(row).getByRole("rowheader").textContent);

	// AC-F05-41
	test("choosing Table shows the table under the summary, and no list", async () => {
		media({ wide: true, docked: true });
		const { user } = renderPage({ seed: golden });
		await user.click(screen.getByRole("radio", { name: "Table" }));
		expect(table()).toBeVisible();
		expect(screen.getByText("Monthly cost")).toBeVisible();
		expect(screen.queryByRole("grid", { name: "Subscriptions" })).toBeNull();
		expect(window.localStorage.getItem(VIEW_KEY)).toBe("table");
	});

	// AC-F05-35
	test("lists the four, by Per month, with the Total row", () => {
		media({ wide: true, docked: true });
		inTable();
		renderPage({ seed: golden });
		expect(names()).toEqual([
			"Sunrise Apartments",
			"Cult Gym",
			"Netflix",
			"Amazon Prime",
		]);
		expect(within(table()).getAllByRole("row").at(-1)).toHaveTextContent(
			"Total · 4",
		);
	});

	// AC-F05-41
	test("starts sorted by Per month, largest first", () => {
		media({ wide: true, docked: true });
		inTable();
		renderPage({ seed: golden });
		expect(
			screen.getByRole("columnheader", { name: /^Per month/ }),
		).toHaveAttribute("aria-sort", "descending");
	});

	test("below 768 px a remembered Table shows the list", () => {
		media({ wide: false });
		inTable();
		renderPage({ seed: golden });
		expect(
			screen.queryByRole("grid", { name: /^Ended Subscriptions/ }),
		).toBeNull();
		expect(screen.getByRole("grid", { name: "Subscriptions" })).toBeVisible();
	});

	// AC-F05-41
	test("a row selects its Subscription in the panel, and again clears it", async () => {
		media({ wide: true, docked: true });
		inTable();
		const { user } = renderPage({ seed: golden });
		await user.click(rowNamed("Netflix"));
		expect(
			await screen.findByRole("heading", { name: "Netflix" }),
		).toBeVisible();
		expect(rowNamed("Netflix")).toHaveAttribute("aria-selected", "true");
		await user.click(rowNamed("Netflix"));
		expect(
			screen.getByRole("heading", { name: "Your Subscriptions" }),
		).toBeVisible();
	});

	test("the selection is the same one in the List view", async () => {
		media({ wide: true, docked: true });
		inTable();
		const { user } = renderPage({ seed: golden });
		await user.click(rowNamed("Netflix"));
		await user.click(screen.getByRole("radio", { name: "List" }));
		expect(screen.getByRole("row", { name: /^Netflix/ })).toHaveAttribute(
			"aria-selected",
			"true",
		);
	});

	test("Escape and Close details clear the selection", async () => {
		media({ wide: true, docked: true });
		inTable();
		const { user } = renderPage({ seed: golden });
		await user.click(rowNamed("Netflix"));
		await screen.findByRole("heading", { name: "Netflix" });
		await user.keyboard("{Escape}");
		expect(rowNamed("Netflix")).toHaveAttribute("aria-selected", "false");
		await user.click(rowNamed("Netflix"));
		await user.click(
			await screen.findByRole("button", { name: "Close details" }),
		);
		expect(rowNamed("Netflix")).toHaveAttribute("aria-selected", "false");
	});

	// AC-F05-41
	test("Down selects through the rows in the sort shown, docked", async () => {
		media({ wide: true, docked: true });
		inTable();
		const { user } = renderPage({ seed: golden });
		await user.click(screen.getByRole("columnheader", { name: /^Name/ }));
		await user.keyboard("{ArrowDown}");
		expect(rowNamed("Amazon Prime")).toHaveAttribute("aria-selected", "true");
		await user.keyboard("{ArrowDown}");
		expect(rowNamed("Cult Gym")).toHaveAttribute("aria-selected", "true");
	});

	// AC-F05-41
	test("below 1180 px Down only moves focus, and a pressed row opens the drawer", async () => {
		media({ wide: true, docked: false });
		inTable();
		const { user } = renderPage({ seed: golden });
		await user.keyboard("{ArrowDown}");
		expect(rowNamed("Sunrise")).toHaveFocus();
		expect(rowNamed("Sunrise")).toHaveAttribute("aria-selected", "false");
		await user.click(rowNamed("Netflix"));
		expect(
			await screen.findByRole("dialog", { name: "Subscription" }),
		).toBeVisible();
	});

	// AC-F05-41
	test("the sort survives a visit to the List view", async () => {
		media({ wide: true, docked: true });
		inTable();
		const { user } = renderPage({ seed: golden });
		await user.click(screen.getByRole("columnheader", { name: /^Name/ }));
		await user.click(screen.getByRole("radio", { name: "List" }));
		await user.click(screen.getByRole("radio", { name: "Table" }));
		expect(names()[0]).toBe("Amazon Prime");
		expect(screen.getByRole("columnheader", { name: /^Name/ })).toHaveAttribute(
			"aria-sort",
			"ascending",
		);
	});

	test("the sort survives a visit to the Calendar", async () => {
		media({ wide: true, docked: true });
		inTable();
		const { user } = renderPage({ seed: golden });
		await user.click(screen.getByRole("columnheader", { name: /^Next due/ }));
		await user.click(screen.getByRole("radio", { name: "Calendar" }));
		await screen.findByRole("heading", { name: "November 2026" });
		await user.click(screen.getByRole("radio", { name: "Table" }));
		expect(names()[0]).toBe("Netflix");
	});

	// AC-F05-41
	test("pressing a category of the panel narrows the table, keeping the Total row", async () => {
		media({ wide: true, docked: true });
		inTable();
		const { user } = renderPage({ seed: golden });
		await user.click(screen.getByRole("button", { name: "Health" }));
		expect(names()).toEqual(["Cult Gym"]);
		expect(screen.getByRole("grid", { name: "Showing" })).toHaveTextContent(
			"Health",
		);
		expect(within(table()).getAllByRole("row").at(-1)).toHaveTextContent(
			"Total · 4",
		);
		expect(
			screen.getByText("₹2,43,287.00 a year · 4 Subscriptions"),
		).toBeVisible();
	});

	test("Show all brings the other rows back", async () => {
		media({ wide: true, docked: true });
		inTable();
		const { user } = renderPage({ seed: golden });
		await user.click(screen.getByRole("button", { name: "Health" }));
		await user.click(screen.getByRole("button", { name: "Show all" }));
		expect(names()).toHaveLength(4);
	});

	// AC-F05-41
	test("an ended Subscription is not in it, and the line stands when all are ended", async () => {
		media({ wide: true, docked: true });
		inTable();
		renderPage({
			seed: {
				...golden,
				items: golden.items.map((each) => ({
					...each,
					status: "ended" as const,
					nextDueOn: null,
				})),
			},
		});
		expect(
			screen.getByText(
				"No running Subscriptions. Resume one in the List view.",
			),
		).toBeVisible();
	});

	test("a Subscription gone from the list while selected leaves the table's selection clear", async () => {
		media({ wide: true, docked: true });
		inTable();
		const { user, queryClient } = renderPage({ seed: golden });
		await user.click(rowNamed("Netflix"));
		await screen.findByRole("heading", { name: "Netflix" });
		queryClient.setQueryData(subscriptionKeys.list(), {
			...golden,
			items: golden.items.filter((each) => each.id !== netflix!.id),
		});
		expect(
			await screen.findByRole("heading", { name: "Your Subscriptions" }),
		).toBeVisible();
	});

	test("the server's own draw of a remembered Table is the list", () => {
		window.localStorage.setItem(VIEW_KEY, "table");
		const queryClient = testClient();
		queryClient.setQueryData(subscriptionKeys.list(), golden);
		const { Url } = urlHarness("");
		const html = renderToString(
			<InRouter
				pathname="/subscriptions"
				router={routerFake()}
			>
				<Url>
					<AppProviders
						navigate={vi.fn()}
						queryClient={queryClient}
					>
						<SubscriptionsPage locale={IN} />
					</AppProviders>
				</Url>
			</InRouter>,
		);
		expect(html).toContain("Within 7 days");
		expect(html).not.toContain("Ended Subscriptions aren");
	});
});

describe("what the server draws from the device's cookies (D-629)", () => {
	const golden = subscriptionList();
	/** The page as the server renders it, the list in the cache as the prefetch leaves it. */
	function serverHtml(props: {
		initialView?: "list" | "calendar" | "table";
		initialWide?: boolean;
	}) {
		const queryClient = testClient();
		queryClient.setQueryData(subscriptionKeys.list(), golden);
		const { Url } = urlHarness("");
		return renderToString(
			<InRouter
				pathname="/subscriptions"
				router={routerFake()}
			>
				<Url>
					<AppProviders
						navigate={vi.fn()}
						queryClient={queryClient}
					>
						<SubscriptionsPage
							locale={IN}
							{...props}
						/>
					</AppProviders>
				</Url>
			</InRouter>,
		);
	}
	const TABLE = "Select a column heading to sort";
	const LIST = "Within 7 days";
	const CALENDAR = "November 2026";

	// AC-F05-42
	test("a remembered Table in a wide window is the table at once", () => {
		const html = serverHtml({ initialView: "table", initialWide: true });
		expect(html).toContain(TABLE);
		expect(html).not.toContain(LIST);
	});

	// AC-F05-42
	test("a remembered Table in a narrow window is the list, as it was last shown", () => {
		const html = serverHtml({ initialView: "table", initialWide: false });
		expect(html).not.toContain(TABLE);
		expect(html).toContain(LIST);
	});

	// AC-F05-42
	test("a remembered Calendar is the calendar in either window, loading its month", () => {
		for (const initialWide of [true, false]) {
			const html = serverHtml({ initialView: "calendar", initialWide });
			expect(html).toContain(CALENDAR);
			expect(html).not.toContain(LIST);
			expect(html).toContain('aria-busy="true"');
		}
	});

	// AC-F05-42
	test("a remembered Calendar draws the grid wide and the days narrow", () => {
		expect(serverHtml({ initialView: "calendar", initialWide: true })).toContain(
			"<table",
		);
		expect(
			serverHtml({ initialView: "calendar", initialWide: false }),
		).not.toContain("<table");
	});

	test("a remembered List is the list in either window", () => {
		for (const initialWide of [true, false]) {
			const html = serverHtml({ initialView: "list", initialWide });
			expect(html).toContain(LIST);
			expect(html).not.toContain(TABLE);
		}
	});

	test("with no cookies the server draws the list", () => {
		const html = serverHtml({});
		expect(html).toContain(LIST);
	});

	// D-629
	test("the switch always has all three options, Table hidden below 768 px by CSS", () => {
		for (const initialWide of [true, false]) {
			const html = serverHtml({ initialWide });
			for (const value of ["list", "calendar", "table"]) {
				expect(html).toContain(`value="${value}"`);
			}
			const page = document.createElement("div");
			page.innerHTML = html;
			expect(
				page
					.querySelector('input[value="table"]')!
					.closest(".max-md\\:hidden"),
			).not.toBeNull();
		}
	});

	test("the server draws the same switch whatever the window", () => {
		const options = (html: string) =>
			[...html.matchAll(/value="(list|calendar|table)"/g)].map((m) => m[1]);
		expect(options(serverHtml({ initialWide: true }))).toEqual(
			options(serverHtml({ initialWide: false })),
		);
	});

	test("the server checks the remembered view in the switch", () => {
		const tag = /<input[^>]*value="calendar"[^>]*>/.exec(
			serverHtml({ initialView: "calendar", initialWide: true }),
		)![0];
		expect(tag).toContain("checked");
	});

	// AC-F05-42
	test("the browser keeps the server's view where storage holds none", () => {
		media({ wide: true, docked: true });
		const queryClient = testClient();
		queryClient.setQueryData(subscriptionKeys.list(), golden);
		const { Url } = urlHarness("");
		render(
			<InRouter
				pathname="/subscriptions"
				router={routerFake()}
			>
				<Url>
					<AppProviders
						navigate={vi.fn()}
						queryClient={queryClient}
					>
						<SubscriptionsPage
							locale={IN}
							initialView="table"
							initialWide
						/>
					</AppProviders>
				</Url>
			</InRouter>,
		);
		expect(screen.getByRole("radio", { name: "Table" })).toBeChecked();
		expect(
			screen.getByRole("grid", { name: /^Ended Subscriptions/ }),
		).toBeVisible();
	});

	test("storage outranks the cookie where it holds a choice", () => {
		media({ wide: true, docked: true });
		window.localStorage.setItem(VIEW_KEY, "list");
		const queryClient = testClient();
		queryClient.setQueryData(subscriptionKeys.list(), golden);
		const { Url } = urlHarness("");
		render(
			<InRouter
				pathname="/subscriptions"
				router={routerFake()}
			>
				<Url>
					<AppProviders
						navigate={vi.fn()}
						queryClient={queryClient}
					>
						<SubscriptionsPage
							locale={IN}
							initialView="table"
							initialWide
						/>
					</AppProviders>
				</Url>
			</InRouter>,
		);
		expect(screen.getByRole("radio", { name: "List" })).toBeChecked();
	});

	test("the page keeps the view and the window class in cookies for the next visit", async () => {
		media({ wide: true, docked: true });
		const { user } = renderPage({ seed: golden });
		await user.click(screen.getByRole("radio", { name: "Calendar" }));
		expect(document.cookie).toContain(`${VIEW_KEY}=calendar`);
		expect(document.cookie).toContain("daybook_wide=wide");
	});

	test("a narrow window is kept as narrow", () => {
		media({ wide: false });
		renderPage({ seed: golden });
		expect(document.cookie).toContain("daybook_wide=narrow");
	});

	// AC-F05-42
	test("a window the cookie got wrong is corrected once the browser knows", () => {
		media({ wide: false });
		const queryClient = testClient();
		queryClient.setQueryData(subscriptionKeys.list(), golden);
		const { Url } = urlHarness("");
		window.localStorage.setItem(VIEW_KEY, "table");
		render(
			<InRouter
				pathname="/subscriptions"
				router={routerFake()}
			>
				<Url>
					<AppProviders
						navigate={vi.fn()}
						queryClient={queryClient}
					>
						<SubscriptionsPage
							locale={IN}
							initialView="table"
							initialWide
						/>
					</AppProviders>
				</Url>
			</InRouter>,
		);
		expect(
			screen.queryByRole("grid", { name: /^Ended Subscriptions/ }),
		).toBeNull();
		expect(screen.getByRole("grid", { name: "Subscriptions" })).toBeVisible();
		expect(document.cookie).toContain("daybook_wide=narrow");
	});
});

describe("Add and Edit in the page (BR-F05-21, BR-F05-24, BR-F05-40, BR-F05-45)", () => {
	const golden = subscriptionList();
	const [netflix, , sunrise] = golden.items;
	const rowNamed = (name: string) =>
		screen.getByRole("row", { name: new RegExp(`^${name}`) });
	const dialog = () => screen.queryByRole("dialog");
	const panel = () =>
		screen.queryByRole("complementary", { name: "Subscription" });

	/** The reads the dialog adds to the page's: the profile, Add's payees and an Edit's write. */
	function dialogReads() {
		route(network, "get", "/api/me", () => ok(meFor("u1", GOLDEN_BLOCK)));
		route(network, "get", "/api/payees", () =>
			ok({ items: [], currency: "INR" }),
		);
	}
	const changed = (item: typeof netflix, over: Record<string, unknown> = {}) => ({
		...item,
		currency: "INR",
		changeDate: "2026-11-02",
		chargesCreated: 0,
		chargesUpdated: 0,
		chargesDeleted: 0,
		months: [],
		...over,
	});

	describe("reaching the dialog", () => {
		// AC-F05-46
		test("Add a Subscription in the header opens Add", async () => {
			media({ wide: true, docked: true });
			dialogReads();
			const { user } = renderPage({ seed: golden });
			await user.click(
				screen.getByRole("button", { name: "Add a Subscription" }),
			);
			expect(dialog()).toHaveAccessibleName("Add a Subscription");
		});

		// AC-F05-46
		test("the empty page's Add opens Add too", async () => {
			dialogReads();
			const { user } = renderPage({ answer: () => ok(emptyList()) });
			await screen.findByText("No Subscriptions yet.");
			const adds = screen.getAllByRole("button", {
				name: "Add a Subscription",
			});
			await user.click(adds.at(-1)!);
			expect(dialog()).toHaveAccessibleName("Add a Subscription");
		});

		test("Add shows while the list loads and not when it failed", async () => {
			renderPage({ answer: async () => (await delay("infinite"), ok({})) });
			expect(
				screen.getByRole("button", { name: "Add a Subscription" }),
			).toBeVisible();
		});

		test("a failed load still has Add, as only the switch and the panel go", async () => {
			dialogReads();
			renderPage({ answer: () => refuse(500, "internal_error") });
			await screen.findByText("Subscriptions could not be loaded.");
			expect(
				screen.getByRole("button", { name: "Add a Subscription" }),
			).toBeVisible();
		});

		// AC-F05-46
		test("Edit in a row's menu opens Edit for that Subscription", async () => {
			media({ wide: true, docked: true });
			dialogReads();
			route(network, "get", "/api/transactions", () => ok(listPage([])));
			const { user } = renderPage({ seed: golden });
			await user.click(
				screen.getByRole("button", { name: "Actions for Netflix" }),
			);
			await user.click(screen.getByRole("menuitem", { name: "Edit" }));
			expect(dialog()).toHaveAccessibleName("Edit Netflix");
		});

		// AC-F05-46
		test("Edit in the panel opens Edit for the selected Subscription", async () => {
			media({ wide: true, docked: true });
			dialogReads();
			const { user } = renderPage({ seed: golden });
			await user.click(rowNamed("Cult Gym"));
			await screen.findByRole("heading", { name: "Cult Gym" });
			await user.click(within(panel()!).getByRole("button", { name: "Edit" }));
			expect(dialog()).toHaveAccessibleName("Edit Cult Gym");
		});

		// AC-F05-46
		test("Add a note in the panel opens Edit", async () => {
			media({ wide: true, docked: true });
			dialogReads();
			const { user } = renderPage({ seed: golden });
			await user.click(rowNamed("Netflix"));
			await user.click(
				await screen.findByRole("button", { name: "Add a note" }),
			);
			expect(dialog()).toHaveAccessibleName("Edit Netflix");
		});

		test("Edit in the drawer below 1180 px opens Edit", async () => {
			media({ wide: true, docked: false });
			dialogReads();
			const { user } = renderPage({ seed: golden });
			await user.click(rowNamed("Netflix"));
			const drawer = await screen.findByRole("dialog", {
				name: "Subscription",
			});
			await user.click(within(drawer).getByRole("button", { name: "Edit" }));
			expect(
				screen.getByRole("dialog", { name: "Edit Netflix" }),
			).toBeVisible();
		});
	});

	describe("the E key (BR-F05-45)", () => {
		// AC-F05-46
		test("opens Edit for the selected Subscription", async () => {
			media({ wide: true, docked: true });
			dialogReads();
			const { user } = renderPage({ seed: golden });
			await user.click(rowNamed("Netflix"));
			await screen.findByRole("heading", { name: "Netflix" });
			await user.keyboard("e");
			expect(dialog()).toHaveAccessibleName("Edit Netflix");
		});

		// AC-F05-46
		test("with nothing selected it does nothing", async () => {
			media({ wide: true, docked: true });
			dialogReads();
			const { user } = renderPage({ seed: golden });
			await user.keyboard("e");
			expect(dialog()).toBeNull();
		});

		test("in a text field it is typed, not a command", async () => {
			media({ wide: true, docked: true });
			dialogReads();
			const { user } = renderPage({ seed: golden });
			await user.click(rowNamed("Netflix"));
			const field = document.createElement("input");
			document.body.append(field);
			field.focus();
			await user.keyboard("e");
			expect(dialog()).toBeNull();
			field.remove();
		});

		test("works below 1180 px with the drawer open", async () => {
			media({ wide: true, docked: false });
			dialogReads();
			const { user } = renderPage({ seed: golden });
			await user.click(rowNamed("Netflix"));
			await screen.findByRole("dialog", { name: "Subscription" });
			await user.keyboard("e");
			expect(
				screen.getByRole("dialog", { name: "Edit Netflix" }),
			).toBeVisible();
		});

		// AC-F05-46
		test("Escape in the dialog closes it and keeps the selection", async () => {
			media({ wide: true, docked: true });
			dialogReads();
			const { user } = renderPage({ seed: golden });
			await user.click(rowNamed("Netflix"));
			await screen.findByRole("heading", { name: "Netflix" });
			await user.keyboard("e");
			expect(dialog()).not.toBeNull();
			await user.keyboard("{Escape}");
			await waitFor(() => expect(dialog()).toBeNull());
			expect(rowNamed("Netflix")).toHaveAttribute("aria-selected", "true");
		});

		test("the panel's hint names it", async () => {
			media({ wide: true, docked: true });
			const { user } = renderPage({ seed: golden });
			await user.click(rowNamed("Netflix"));
			expect(
				await screen.findByText(
					"E to edit · S to skip · P to pause · C to cancel · Delete to delete · Up and down arrows move · Esc to close",
				),
			).toBeVisible();
		});
	});

	describe("after a confirmed save (BR-F05-33)", () => {
		async function saveEdit(
			user: ReturnType<typeof userEvent.setup>,
			name: string,
			amount: string,
		) {
			const box = await screen.findByRole("textbox", { name: "Amount" });
			await waitFor(() =>
				expect(
					screen.getByRole("button", { name: "Save changes" }),
				).not.toHaveAttribute("aria-disabled", "true"),
			);
			await user.clear(box);
			await user.type(box, amount);
			await user.click(screen.getByRole("button", { name: "Save changes" }));
			await waitFor(() =>
				expect(
					screen.queryByRole("dialog", { name: `Edit ${name}` }),
				).toBeNull(),
			);
		}

		// AC-F05-46
		test("docked, the saved Subscription is selected though nothing was", async () => {
			media({ wide: true, docked: true });
			dialogReads();
			const patches = route(
				network,
				"patch",
				`/api/subscriptions/${netflix!.id}`,
				() =>
					ok(
						changed(netflix!, {
							amountMinor: 79900,
							version: netflix!.version + 1,
						}),
					),
			);
			const { user } = renderPage({ seed: golden });
			await user.click(
				screen.getByRole("button", { name: "Actions for Netflix" }),
			);
			await user.click(screen.getByRole("menuitem", { name: "Edit" }));
			await saveEdit(user, "Netflix", "799");
			expect(patches).toHaveLength(1);
			expect(
				await screen.findByRole("heading", { name: "Netflix" }),
			).toBeVisible();
			expect(rowNamed("Netflix")).toHaveAttribute("aria-selected", "true");
		});

		// AC-F05-53
		test("an Edit's notice shows in the panel and its Undo puts the old amount back", async () => {
			media({ wide: true, docked: true });
			dialogReads();
			const patches = route(
				network,
				"patch",
				`/api/subscriptions/${netflix!.id}`,
				() =>
					ok(
						changed(netflix!, {
							amountMinor: 79900,
							version: netflix!.version + 1,
						}),
					),
			);
			const { user } = renderPage({ seed: golden });
			await user.click(
				screen.getByRole("button", { name: "Actions for Netflix" }),
			);
			await user.click(screen.getByRole("menuitem", { name: "Edit" }));
			await saveEdit(user, "Netflix", "799");
			const text = "Netflix saved. Next charge Thu, 5 Nov.";
			const notice = (await screen.findByText(text)).closest("[role=status]")!;
			expect(
				screen
					.getByRole("complementary", { name: "Subscription" })
					.contains(notice),
			).toBe(true);
			await user.click(
				within(notice as HTMLElement).getByRole("button", { name: "Undo" }),
			);
			await waitFor(() => expect(screen.queryByText(text)).toBeNull());
			expect(patches).toHaveLength(2);
			expect(patches[1]?.body).toEqual({
				changedAt: expect.any(String),
				amountMinor: netflix!.amountMinor,
				currency: "INR",
			});
			expect(patches[1]?.headers.get("if-match")).toBe(
				`"${netflix!.version + 1}"`,
			);
		});

		// AC-F05-46
		test("below 1180 px with nothing selected, nothing becomes selected", async () => {
			media({ wide: true, docked: false });
			dialogReads();
			route(network, "patch", `/api/subscriptions/${netflix!.id}`, () =>
				ok(changed(netflix!, { amountMinor: 79900 })),
			);
			const { user } = renderPage({ seed: golden });
			await user.click(
				screen.getByRole("button", { name: "Actions for Netflix" }),
			);
			await user.click(screen.getByRole("menuitem", { name: "Edit" }));
			await saveEdit(user, "Netflix", "799");
			expect(
				screen.queryByRole("dialog", { name: "Subscription" }),
			).toBeNull();
			expect(rowNamed("Netflix")).toHaveAttribute("aria-selected", "false");
		});

		test("below 1180 px with one selected, the drawer stays on the saved one", async () => {
			media({ wide: true, docked: false });
			dialogReads();
			route(network, "patch", `/api/subscriptions/${netflix!.id}`, () =>
				ok(changed(netflix!, { amountMinor: 79900 })),
			);
			const { user } = renderPage({ seed: golden });
			await user.click(rowNamed("Netflix"));
			await screen.findByRole("dialog", { name: "Subscription" });
			await user.keyboard("e");
			await saveEdit(user, "Netflix", "799");
			expect(
				await screen.findByRole("dialog", { name: "Subscription" }),
			).toHaveTextContent("Netflix");
		});

		// AC-F05-46
		test("a category filter that would hide the saved Subscription goes", async () => {
			media({ wide: true, docked: true });
			dialogReads();
			route(network, "patch", `/api/subscriptions/${sunrise!.id}`, () =>
				ok(changed(sunrise!, { category: "food", amountMinor: 1950000 })),
			);
			const { user } = renderPage({ seed: golden });
			await user.click(screen.getByRole("button", { name: "Housing" }));
			expect(screen.getByRole("grid", { name: "Showing" })).toHaveTextContent(
				"Housing",
			);
			await user.click(
				screen.getByRole("button", {
					name: "Actions for Sunrise Apartments",
				}),
			);
			await user.click(screen.getByRole("menuitem", { name: "Edit" }));
			await saveEdit(user, "Sunrise Apartments", "19500");
			expect(screen.queryByRole("grid", { name: "Showing" })).toBeNull();
		});

		test("a refused save leaves the selection and the list as they were", async () => {
			media({ wide: true, docked: true });
			dialogReads();
			route(network, "patch", `/api/subscriptions/${netflix!.id}`, () =>
				refuse(500, "internal_error"),
			);
			const { user } = renderPage({ seed: golden });
			await user.click(
				screen.getByRole("button", { name: "Actions for Netflix" }),
			);
			await user.click(screen.getByRole("menuitem", { name: "Edit" }));
			const box = await screen.findByRole("textbox", { name: "Amount" });
			await waitFor(() =>
				expect(
					screen.getByRole("button", { name: "Save changes" }),
				).not.toHaveAttribute("aria-disabled", "true"),
			);
			await user.clear(box);
			await user.type(box, "799");
			await user.click(screen.getByRole("button", { name: "Save changes" }));
			await screen.findByText(/^The Subscription could not be saved\./);
			expect(dialog()).toHaveAccessibleName("Edit Netflix");
			await user.keyboard("{Escape}");
			await waitFor(() => expect(dialog()).toBeNull());
			expect(rowNamed("Netflix")).toHaveAttribute("aria-selected", "false");
		});
	});

	test("the dialog opens on the Subscription as the page held it, not a later read", async () => {
		media({ wide: true, docked: true });
		dialogReads();
		const { user } = renderPage({ seed: golden });
		await user.click(
			screen.getByRole("button", { name: "Actions for Netflix" }),
		);
		await user.click(screen.getByRole("menuitem", { name: "Edit" }));
		expect(await screen.findByRole("textbox", { name: "Amount" })).toHaveValue(
			"649.00",
		);
	});
});

describe("Cancel, Resume, Pause, Delete and Skip in the page (BR-F05-22, BR-F05-26, BR-F05-40)", () => {
	const golden = subscriptionList();
	const [netflix] = golden.items;
	const rowNamed = (name: string) =>
		screen.getByRole("row", { name: new RegExp(`^${name}`) });
	const menu = (name: string) =>
		screen.getByRole("button", { name: `Actions for ${name}` });
	const panel = () =>
		screen.queryByRole("complementary", { name: "Subscription" });
	const dialog = (name: string) => screen.queryByRole("dialog", { name });
	const wide = () => media({ wide: true, docked: true });
	/** The Ended group is closed until pressed (BR-F05-37). */
	const openEnded = (user: ReturnType<typeof userEvent.setup>) =>
		user.click(screen.getByRole("button", { name: "Ended · 1" }));

	/** The golden list with Netflix changed. */
	const withNetflix = (changes: Parameters<typeof subscriptionItem>[1]) => {
		const list = subscriptionList();
		return {
			...list,
			items: list.items.map((item) =>
				item.id === netflix!.id ? { ...item, ...changes } : item,
			),
		};
	};
	const changed = (over: Record<string, unknown> = {}) => ({
		...netflix,
		currency: "INR",
		changeDate: "2026-11-02",
		chargesCreated: 0,
		chargesUpdated: 0,
		chargesDeleted: 0,
		months: [],
		...over,
	});
	const patchPath = `/api/subscriptions/${netflix!.id}`;
	const pickMenuItem = async (
		user: ReturnType<typeof userEvent.setup>,
		of: string,
		item: string,
	) => {
		await user.click(menu(of));
		await user.click(screen.getByRole("menuitem", { name: item }));
	};

	describe("from a row's menu", () => {
		// AC-F05-50
		test.each([
			["Pause", "Pause Netflix"],
			["Cancel Subscription", "Cancel Netflix?"],
		])("%s opens %s", async (item, title) => {
			wide();
			const { user } = renderPage({ seed: golden });
			await pickMenuItem(user, "Netflix", item);
			expect(await screen.findByRole("dialog", { name: title })).toBeVisible();
		});

		test("Delete opens its confirmation", async () => {
			wide();
			const { user } = renderPage({ seed: golden });
			await pickMenuItem(user, "Netflix", "Delete");
			expect(
				await screen.findByRole("alertdialog", { name: "Delete Netflix?" }),
			).toBeVisible();
		});

		// AC-F05-50
		test("Change end date on an ending Subscription opens Cancel on a later date", async () => {
			wide();
			const ending = withNetflix({ status: "ending", endDate: "2026-12-31" });
			const { user } = renderPage({ seed: ending });
			await pickMenuItem(user, "Netflix", "Change end date");
			await screen.findByRole("dialog", { name: "Cancel Netflix?" });
			expect(
				screen.getByRole("radio", { name: /^On a later date/ }),
			).toBeChecked();
		});

		test("Keep it going on an ending Subscription opens Resume", async () => {
			wide();
			const ending = withNetflix({ status: "ending", endDate: "2026-12-31" });
			const { user } = renderPage({ seed: ending });
			await pickMenuItem(user, "Netflix", "Keep it going");
			expect(
				await screen.findByRole("dialog", { name: "Resume Netflix?" }),
			).toBeVisible();
		});

		// AC-F05-50
		test("Change pause on a paused Subscription opens Pause", async () => {
			wide();
			const paused = withNetflix({
				status: "paused",
				pause: { from: "2026-11-05", until: "2027-01-05" },
				nextDueOn: "2027-01-05",
			});
			const { user } = renderPage({ seed: paused });
			await pickMenuItem(user, "Netflix", "Change pause");
			await screen.findByRole("dialog", { name: "Pause Netflix" });
			expect(
				screen.getByRole("radio", { name: "Until a date" }),
			).toBeChecked();
		});

		test("Resume in an ended Subscription's menu opens Resume", async () => {
			wide();
			const ended = withNetflix({
				status: "ended",
				endDate: "2026-09-30",
				nextDueOn: null,
			});
			const { user } = renderPage({ seed: ended });
			await openEnded(user);
			await pickMenuItem(user, "Netflix", "Resume");
			expect(
				await screen.findByRole("dialog", { name: "Resume Netflix?" }),
			).toBeVisible();
		});
	});

	describe("an ended row's Resume button", () => {
		const ended = withNetflix({
			status: "ended",
			endDate: "2026-09-30",
			nextDueOn: null,
		});

		// AC-F05-48
		test("opens Resume without selecting the row", async () => {
			wide();
			const { user } = renderPage({ seed: ended });
			await openEnded(user);
			await user.click(
				within(rowNamed("Netflix")).getByRole("button", { name: "Resume" }),
			);
			expect(
				await screen.findByRole("dialog", { name: "Resume Netflix?" }),
			).toBeVisible();
			await user.keyboard("{Escape}");
			await waitFor(() => expect(dialog("Resume Netflix?")).toBeNull());
			expect(rowNamed("Netflix")).toHaveAttribute("aria-selected", "false");
		});

		test("is there on a phone, where the menu is not", async () => {
			media({ wide: false, docked: false });
			const { user } = renderPage({ seed: ended });
			await openEnded(user);
			await user.click(
				within(rowNamed("Netflix")).getByRole("button", { name: "Resume" }),
			);
			expect(
				await screen.findByRole("dialog", { name: "Resume Netflix?" }),
			).toBeVisible();
		});
	});

	describe("from the panel", () => {
		test("the footer's Pause, Cancel Subscription and Delete open their dialogs", async () => {
			wide();
			const { user } = renderPage({ seed: golden });
			await user.click(rowNamed("Netflix"));
			await screen.findByRole("heading", { name: "Netflix" });
			await user.click(
				within(panel()!).getByRole("button", { name: "Pause" }),
			);
			expect(
				await screen.findByRole("dialog", { name: "Pause Netflix" }),
			).toBeVisible();
			await user.keyboard("{Escape}");
			await waitFor(() => expect(dialog("Pause Netflix")).toBeNull());
			await user.click(
				within(panel()!).getByRole("button", {
					name: "Cancel Subscription",
				}),
			);
			expect(
				await screen.findByRole("dialog", { name: "Cancel Netflix?" }),
			).toBeVisible();
			await user.keyboard("{Escape}");
			await waitFor(() => expect(dialog("Cancel Netflix?")).toBeNull());
			await user.click(
				within(panel()!).getByRole("button", { name: "Delete" }),
			);
			expect(
				await screen.findByRole("alertdialog", { name: "Delete Netflix?" }),
			).toBeVisible();
		});

		test("an ending Subscription's footer says Change end and opens Cancel", async () => {
			wide();
			const ending = withNetflix({ status: "ending", endDate: "2026-12-31" });
			const { user } = renderPage({ seed: ending });
			await user.click(rowNamed("Netflix"));
			await user.click(
				await screen.findByRole("button", { name: "Change end" }),
			);
			expect(
				await screen.findByRole("dialog", { name: "Cancel Netflix?" }),
			).toBeVisible();
		});

		test("the status box's Change opens Pause on a paused Subscription", async () => {
			wide();
			const paused = withNetflix({
				status: "paused",
				pause: { from: "2026-11-05", until: "2027-01-05" },
				nextDueOn: "2027-01-05",
			});
			const { user } = renderPage({ seed: paused });
			await user.click(rowNamed("Netflix"));
			await user.click(
				within(
					await screen.findByRole("complementary", {
						name: "Subscription",
					}),
				).getByRole("button", { name: "Change" }),
			);
			expect(
				await screen.findByRole("dialog", { name: "Pause Netflix" }),
			).toBeVisible();
		});

		test("the status box's Resume opens Resume on an ended Subscription", async () => {
			wide();
			const ended = withNetflix({
				status: "ended",
				endDate: "2026-09-30",
				nextDueOn: null,
			});
			const { user } = renderPage({ seed: ended });
			await openEnded(user);
			await user.click(rowNamed("Netflix"));
			await screen.findByRole("heading", { name: "Netflix" });
			await user.click(
				within(panel()!).getAllByRole("button", { name: "Resume" })[0]!,
			);
			expect(
				await screen.findByRole("dialog", { name: "Resume Netflix?" }),
			).toBeVisible();
		});
	});

	describe("the writes with no dialog (BR-F05-26, BR-F05-27, BR-F05-29)", () => {
		// AC-F05-51
		test("Skip the 5 Nov charge in the menu posts the skip, and selects the Subscription", async () => {
			wide();
			const posts = route(
				network,
				"post",
				`/api/subscriptions/${netflix!.id}/skips`,
				() =>
					ok(
						changed({
							skips: ["2026-11-05"],
							version: netflix!.version + 1,
						}),
					),
			);
			const { user } = renderPage({ seed: golden });
			await pickMenuItem(user, "Netflix", "Skip the 5 Nov charge");
			await waitFor(() => expect(posts).toHaveLength(1));
			expect(posts[0]?.body).toEqual({
				dueOn: "2026-11-05",
				changedAt: expect.any(String),
			});
			expect(
				await screen.findByRole("heading", { name: "Netflix" }),
			).toBeVisible();
			expect(rowNamed("Netflix")).toHaveAttribute("aria-selected", "true");
		});

		// AC-F05-51
		test("Skip this one in the panel posts the same", async () => {
			wide();
			const posts = route(
				network,
				"post",
				`/api/subscriptions/${netflix!.id}/skips`,
				() => ok(changed({ version: netflix!.version + 1 })),
			);
			const { user } = renderPage({ seed: golden });
			await user.click(rowNamed("Netflix"));
			await user.click(
				await screen.findByRole("button", { name: "Skip this one" }),
			);
			await waitFor(() => expect(posts).toHaveLength(1));
			expect(posts[0]?.body).toMatchObject({ dueOn: "2026-11-05" });
		});

		// AC-F05-51
		test("Undo skip on the timeline brings the date back", async () => {
			wide();
			const skipped = withNetflix({
				skips: ["2026-11-05"],
				nextDueOn: "2026-12-05",
			});
			const deletes = route(
				network,
				"delete",
				`/api/subscriptions/${netflix!.id}/skips/2026-11-05`,
				() => ok(changed({ version: netflix!.version + 1 })),
			);
			const { user } = renderPage({ seed: skipped });
			await user.click(rowNamed("Netflix"));
			await user.click(
				await screen.findByRole("button", { name: "Undo skip" }),
			);
			await waitFor(() => expect(deletes).toHaveLength(1));
			expect(deletes[0]?.body).toEqual({ changedAt: expect.any(String) });
		});

		// AC-F05-51
		test("Resume now ends a pause in force today", async () => {
			wide();
			const paused = withNetflix({
				status: "paused",
				pause: { from: "2026-10-05", until: "2027-01-05" },
				nextDueOn: "2027-01-05",
			});
			const patches = route(network, "patch", patchPath, () => ok(changed()));
			const { user } = renderPage({ seed: paused });
			await pickMenuItem(user, "Netflix", "Resume now");
			await waitFor(() => expect(patches).toHaveLength(1));
			expect(patches[0]?.body).toEqual({
				changedAt: expect.any(String),
				pause: { from: "2026-10-05", until: "2026-11-02" },
			});
		});

		// AC-F05-51
		test("a refusal says why in a notice and changes nothing", async () => {
			wide();
			route(network, "post", `/api/subscriptions/${netflix!.id}/skips`, () =>
				refuse(422, "validation_failed", {
					message: "m",
					fields: { dueOn: "Only an upcoming charge can be skipped." },
				}),
			);
			const { user } = renderPage({ seed: golden });
			await pickMenuItem(user, "Netflix", "Skip the 5 Nov charge");
			expect(await screen.findByRole("alert")).toHaveTextContent(
				"Only an upcoming charge can be skipped.",
			);
			expect(rowNamed("Netflix")).toHaveAttribute("aria-selected", "false");
			expect(document.querySelector("[data-sonner-toast]")).toBeNull();
		});
	});

	describe("after a confirmed write", () => {
		// AC-F05-50
		test("Cancel saved docked selects the Subscription", async () => {
			wide();
			const patches = route(network, "patch", patchPath, () =>
				ok(changed({ version: netflix!.version + 1 })),
			);
			const { user } = renderPage({ seed: golden });
			await pickMenuItem(user, "Netflix", "Cancel Subscription");
			const save = await screen.findByRole("button", {
				name: "Cancel Netflix",
			});
			await waitFor(() =>
				expect(save).not.toHaveAttribute("aria-disabled", "true"),
			);
			await user.click(save);
			await waitFor(() => expect(dialog("Cancel Netflix?")).toBeNull());
			expect(patches).toHaveLength(1);
			expect(patches[0]?.body).toEqual({
				changedAt: expect.any(String),
				endDate: "2026-11-02",
			});
			expect(rowNamed("Netflix")).toHaveAttribute("aria-selected", "true");
		});

		// AC-F05-50
		test("Delete removes the Subscription and clears the selection back to the summary", async () => {
			wide();
			let reads = 0;
			const deletes = route(network, "delete", patchPath, () =>
				ok({
					changeDate: "2026-11-02",
					chargesCreated: 0,
					chargesKept: 2,
					chargesDeleted: 0,
					months: [],
				}),
			);
			const { user } = renderPage({
				seed: golden,
				answer: () => {
					reads += 1;
					const rest = subscriptionList();
					return ok({
						...rest,
						items: rest.items.filter((item) => item.id !== netflix!.id),
					});
				},
			});
			await user.click(rowNamed("Netflix"));
			await screen.findByRole("heading", { name: "Netflix" });
			await user.click(
				within(panel()!).getByRole("button", { name: "Delete" }),
			);
			await user.click(
				await screen.findByRole("button", { name: "Delete Netflix" }),
			);
			await waitFor(() => expect(deletes).toHaveLength(1));
			await waitFor(() =>
				expect(screen.queryByRole("row", { name: /^Netflix/ })).toBeNull(),
			);
			expect(reads).toBeGreaterThan(0);
			expect(
				await screen.findByRole("heading", { name: "Your Subscriptions" }),
			).toBeVisible();
		});

		// AC-F05-50
		test("cancel it instead swaps the confirmation for Cancel on the same Subscription", async () => {
			wide();
			const { user } = renderPage({ seed: golden });
			await pickMenuItem(user, "Netflix", "Delete");
			await user.click(
				await screen.findByRole("button", { name: "cancel it instead" }),
			);
			expect(
				await screen.findByRole("dialog", { name: "Cancel Netflix?" }),
			).toBeVisible();
			expect(screen.queryByRole("alertdialog")).toBeNull();
		});

		const gym = golden.items.find((item) => item.name === "Cult Gym")!;
		/** The notice that reads `text`: a status, in the panel or above the view. */
		const noticeOf = (text: string) =>
			screen.getByText(text).closest<HTMLElement>('[role="status"]')!;
		/** Skips Netflix's next charge from its menu; the answer has version + 1. */
		const skipNetflix = async (user: ReturnType<typeof userEvent.setup>) => {
			await pickMenuItem(user, "Netflix", "Skip the 5 Nov charge");
			await screen.findByText("Skipped the 5 Nov Netflix charge.");
		};
		const skipRoute = () =>
			route(network, "post", `/api/subscriptions/${netflix!.id}/skips`, () =>
				ok(
					changed({
						version: netflix!.version + 1,
						skips: ["2026-11-05"],
					}),
				),
			);

		// AC-F05-53
		test("a skip docked shows its notice in the panel, with Undo and Dismiss, and not above the list", async () => {
			wide();
			skipRoute();
			const { user } = renderPage({ seed: golden });
			await skipNetflix(user);
			const notice = noticeOf("Skipped the 5 Nov Netflix charge.");
			expect(panel()!.contains(notice)).toBe(true);
			expect(
				within(notice).getByRole("button", { name: "Undo" }),
			).toBeVisible();
			expect(
				within(notice).getByRole("button", { name: "Dismiss" }),
			).toBeVisible();
			expect(
				screen.getAllByText("Skipped the 5 Nov Netflix charge."),
			).toHaveLength(1);
		});

		// AC-F05-53
		test("below 1180 px with nothing selected the notice is above the view and nothing is selected", async () => {
			media({ wide: true, docked: false });
			skipRoute();
			const { user } = renderPage({ seed: golden });
			await skipNetflix(user);
			expect(panel()).toBeNull();
			expect(noticeOf("Skipped the 5 Nov Netflix charge.")).toBeVisible();
			expect(rowNamed("Netflix")).toHaveAttribute("aria-selected", "false");
			// It sits between the summary and the list.
			const summary = screen.getByText("Monthly cost");
			const list = screen.getByRole("grid", { name: "Subscriptions" });
			expect(
				summary.compareDocumentPosition(
					noticeOf("Skipped the 5 Nov Netflix charge."),
				) & Node.DOCUMENT_POSITION_FOLLOWING,
			).toBeTruthy();
			expect(
				noticeOf(
					"Skipped the 5 Nov Netflix charge.",
				).compareDocumentPosition(list) & Node.DOCUMENT_POSITION_FOLLOWING,
			).toBeTruthy();
		});

		// AC-F05-53
		test("selecting another Subscription moves the notice above the view", async () => {
			wide();
			skipRoute();
			const { user } = renderPage({ seed: golden });
			await skipNetflix(user);
			await user.click(rowNamed("Cult Gym"));
			expect(
				await screen.findByRole("heading", { name: "Cult Gym" }),
			).toBeVisible();
			const moved = noticeOf("Skipped the 5 Nov Netflix charge.");
			expect(panel()!.contains(moved)).toBe(false);
			// Selecting Netflix again brings it back into the panel.
			await user.click(rowNamed("Netflix"));
			await waitFor(() =>
				expect(
					panel()!.contains(noticeOf("Skipped the 5 Nov Netflix charge.")),
				).toBe(true),
			);
		});

		// AC-F05-53
		test("Dismiss ends the notice", async () => {
			wide();
			skipRoute();
			const { user } = renderPage({ seed: golden });
			await skipNetflix(user);
			await user.click(screen.getByRole("button", { name: "Dismiss" }));
			expect(
				screen.queryByText("Skipped the 5 Nov Netflix charge."),
			).toBeNull();
		});

		// AC-F05-53
		test("the next write replaces the notice", async () => {
			wide();
			skipRoute();
			const { user } = renderPage({ seed: golden });
			await skipNetflix(user);
			await pickMenuItem(user, "Cult Gym", "Cancel Subscription");
			const save = await screen.findByRole("button", {
				name: "Cancel Cult Gym",
			});
			await waitFor(() =>
				expect(save).not.toHaveAttribute("aria-disabled", "true"),
			);
			route(network, "patch", `/api/subscriptions/${gym.id}`, () =>
				ok({
					...gym,
					currency: "INR",
					changeDate: "2026-11-02",
					chargesCreated: 0,
					chargesUpdated: 0,
					chargesDeleted: 0,
					months: [],
					endDate: "2026-11-02",
					version: gym.version + 1,
				}),
			);
			await user.click(save);
			await waitFor(() =>
				expect(
					screen.getByText("Cult Gym cancelled. Earlier charges stay."),
				).toBeVisible(),
			);
			expect(screen.queryByText(/Skipped the 5 Nov/)).toBeNull();
		});

		// AC-F05-53
		test("Undo sends the skip's delete at the version the write returned, and the notice ends", async () => {
			wide();
			skipRoute();
			const deletes = route(
				network,
				"delete",
				`/api/subscriptions/${netflix!.id}/skips/2026-11-05`,
				() => ok(changed({ version: netflix!.version + 2 })),
			);
			const { user } = renderPage({ seed: golden });
			await skipNetflix(user);
			await user.click(screen.getByRole("button", { name: "Undo" }));
			await waitFor(() =>
				expect(
					screen.queryByText("Skipped the 5 Nov Netflix charge."),
				).toBeNull(),
			);
			expect(deletes).toHaveLength(1);
			expect(deletes[0]?.headers.get("if-match")).toBe(
				`"${netflix!.version + 1}"`,
			);
		});

		// AC-F05-53
		test("while Undo is on its way Dismiss rests, and a failed Undo reads why with Dismiss alone", async () => {
			wide();
			skipRoute();
			route(
				network,
				"delete",
				`/api/subscriptions/${netflix!.id}/skips/2026-11-05`,
				async () => {
					await delay(80);
					return refuse(422, "validation_failed", {
						message: "m",
						fields: {
							dueOn: "This charge date has passed, so it can't be brought back.",
						},
					});
				},
			);
			const { user } = renderPage({ seed: golden });
			await skipNetflix(user);
			await user.click(screen.getByRole("button", { name: "Undo" }));
			expect(screen.getByRole("button", { name: "Dismiss" })).toHaveAttribute(
				"aria-disabled",
				"true",
			);
			const alert = await screen.findByRole("alert");
			expect(alert).toHaveTextContent("This change can't be undone any more.");
			expect(within(alert).queryByRole("button", { name: "Undo" })).toBeNull();
			await user.click(within(alert).getByRole("button", { name: "Dismiss" }));
			expect(screen.queryByRole("alert")).toBeNull();
		});

		// AC-F05-54
		test("a 409 on Undo opens the conflict view: Keep theirs ends the notice, Keep mine sends it again at the saved version", async () => {
			wide();
			skipRoute();
			let at = 0;
			const deletes = route(
				network,
				"delete",
				`/api/subscriptions/${netflix!.id}/skips/2026-11-05`,
				() =>
					++at < 3 ?
						refuse(409, "version_conflict", {
							message: "m",
							details: {
								current: changed({
									version: 12,
									skips: ["2026-11-05"],
									amountMinor: 79900,
								}),
							},
						})
					:	ok(changed({ version: 13 })),
			);
			const { user } = renderPage({ seed: golden });
			await skipNetflix(user);
			await user.click(screen.getByRole("button", { name: "Undo" }));
			const view = await screen.findByRole("dialog", {
				name: "This Subscription changed on another device",
			});
			expect(
				within(view).getByText(
					"Keep mine puts the Subscription back as it was before your change.",
				),
			).toBeVisible();
			// Closing the view leaves the notice with its Undo.
			await user.keyboard("{Escape}");
			await waitFor(() =>
				expect(
					screen.queryByRole("dialog", {
						name: /changed on another device/,
					}),
				).toBeNull(),
			);
			expect(screen.getByRole("button", { name: "Undo" })).toBeVisible();
			await user.click(screen.getByRole("button", { name: "Undo" }));
			await user.click(
				await screen.findByRole("button", { name: "Keep mine" }),
			);
			await waitFor(() =>
				expect(
					screen.queryByText("Skipped the 5 Nov Netflix charge."),
				).toBeNull(),
			);
			expect(deletes).toHaveLength(3);
			expect(deletes[2]?.headers.get("if-match")).toBe('"12"');
		});

		// AC-F05-54
		test("a 409 on Skip this one opens the conflict view, and Keep theirs sends nothing more", async () => {
			wide();
			const posts = route(
				network,
				"post",
				`/api/subscriptions/${netflix!.id}/skips`,
				() =>
					refuse(409, "version_conflict", {
						message: "m",
						details: { current: changed({ version: 12 }) },
					}),
			);
			const { user } = renderPage({ seed: golden });
			await pickMenuItem(user, "Netflix", "Skip the 5 Nov charge");
			await screen.findByRole("dialog", {
				name: "This Subscription changed on another device",
			});
			await user.click(screen.getByRole("button", { name: "Keep theirs" }));
			await waitFor(() =>
				expect(
					screen.queryByRole("dialog", {
						name: /changed on another device/,
					}),
				).toBeNull(),
			);
			expect(posts).toHaveLength(1);
			expect(screen.queryByText(/^Skipped the 5 Nov/)).toBeNull();
		});

		// AC-F05-53
		test("a delete's notice is above the list with Dismiss alone, and the selection is cleared", async () => {
			wide();
			route(network, "delete", patchPath, () =>
				ok({
					changeDate: "2026-11-02",
					chargesCreated: 0,
					chargesKept: 2,
					chargesDeleted: 0,
					months: [],
				}),
			);
			const { user } = renderPage({
				seed: golden,
				answer: () => {
					const rest = subscriptionList();
					return ok({
						...rest,
						items: rest.items.filter((item) => item.id !== netflix!.id),
					});
				},
			});
			await user.click(rowNamed("Netflix"));
			await screen.findByRole("heading", { name: "Netflix" });
			await user.click(
				within(panel()!).getByRole("button", { name: "Delete" }),
			);
			await user.click(
				await screen.findByRole("button", { name: "Delete Netflix" }),
			);
			await screen.findByText(
				"Netflix deleted. Its charges stay in Transactions.",
			);
			const notice = noticeOf(
				"Netflix deleted. Its charges stay in Transactions.",
			);
			expect(
				within(notice).queryByRole("button", { name: "Undo" }),
			).toBeNull();
			expect(
				within(notice).getByRole("button", { name: "Dismiss" }),
			).toBeVisible();
			expect(panel()!.contains(notice)).toBe(false);
			expect(
				await screen.findByRole("heading", { name: "Your Subscriptions" }),
			).toBeVisible();
			await user.click(
				within(notice).getByRole("button", { name: "Dismiss" }),
			);
			expect(screen.queryByText(/^Netflix deleted\./)).toBeNull();
		});

		// AC-F05-53
		test("deleting the last Subscription leaves the notice above the empty message", async () => {
			wide();
			const one = {
				...subscriptionList(),
				items: [subscriptionItem("netflix")],
			};
			route(network, "delete", patchPath, () =>
				ok({
					changeDate: "2026-11-02",
					chargesCreated: 0,
					chargesKept: 2,
					chargesDeleted: 0,
					months: [],
				}),
			);
			const { user } = renderPage({
				seed: one,
				answer: () => ok(emptyList()),
			});
			await pickMenuItem(user, "Netflix", "Delete");
			await user.click(
				await screen.findByRole("button", { name: "Delete Netflix" }),
			);
			await screen.findByText(
				"Netflix deleted. Its charges stay in Transactions.",
			);
			const notice = noticeOf(
				"Netflix deleted. Its charges stay in Transactions.",
			);
			expect(await screen.findByText("No Subscriptions yet.")).toBeVisible();
			expect(
				notice.compareDocumentPosition(
					screen.getByText("No Subscriptions yet."),
				) & Node.DOCUMENT_POSITION_FOLLOWING,
			).toBeTruthy();
		});

		test("Escape closes a dialog and keeps the selection", async () => {
			wide();
			const { user } = renderPage({ seed: golden });
			await user.click(rowNamed("Netflix"));
			await screen.findByRole("heading", { name: "Netflix" });
			await user.click(
				within(panel()!).getByRole("button", { name: "Pause" }),
			);
			await screen.findByRole("dialog", { name: "Pause Netflix" });
			await user.keyboard("{Escape}");
			await waitFor(() => expect(dialog("Pause Netflix")).toBeNull());
			expect(rowNamed("Netflix")).toHaveAttribute("aria-selected", "true");
		});
	});
});

describe("the keys that act as the menu's items do (BR-F05-45, D-630)", () => {
	const golden = subscriptionList();
	const [netflix] = golden.items;
	const rowNamed = (name: string) =>
		screen.getByRole("row", { name: new RegExp(`^${name}`) });
	const dialog = (name: string) => screen.queryByRole("dialog", { name });
	const wide = () => media({ wide: true, docked: true });
	const withNetflix = (changes: Parameters<typeof subscriptionItem>[1]) => {
		const list = subscriptionList();
		return {
			...list,
			items: list.items.map((item) =>
				item.id === netflix!.id ? { ...item, ...changes } : item,
			),
		};
	};
	const select = async (seed: SubscriptionList, search = "") => {
		wide();
		const view = renderPage({ seed, search });
		if (search === "") await view.user.click(rowNamed("Netflix"));
		await screen.findByRole("heading", { name: "Netflix" });
		return view;
	};

	// AC-F05-52
	test("S skips the next charge", async () => {
		const posts = route(
			network,
			"post",
			`/api/subscriptions/${netflix!.id}/skips`,
			() => ok({ ...netflix, currency: "INR", version: netflix!.version + 1 }),
		);
		const { user } = await select(golden);
		await user.keyboard("s");
		await waitFor(() => expect(posts).toHaveLength(1));
		expect(posts[0]?.body).toMatchObject({ dueOn: "2026-11-05" });
	});

	// AC-F05-52
	test("P opens Pause, C opens Cancel", async () => {
		const { user } = await select(golden);
		await user.keyboard("p");
		expect(
			await screen.findByRole("dialog", { name: "Pause Netflix" }),
		).toBeVisible();
		await user.keyboard("{Escape}");
		await waitFor(() => expect(dialog("Pause Netflix")).toBeNull());
		await user.keyboard("c");
		expect(
			await screen.findByRole("dialog", { name: "Cancel Netflix?" }),
		).toBeVisible();
	});

	test.each(["{Delete}", "{Backspace}"])(
		"%s opens the Delete confirmation",
		async (key) => {
			const { user } = await select(golden);
			await user.keyboard(key);
			expect(
				await screen.findByRole("alertdialog", { name: "Delete Netflix?" }),
			).toBeVisible();
		},
	);

	// AC-F05-52
	test("R does nothing for a Subscription that is running", async () => {
		const { user } = await select(golden);
		await user.keyboard("r");
		expect(dialog("Resume Netflix?")).toBeNull();
		expect(screen.queryByRole("alertdialog")).toBeNull();
	});

	// AC-F05-52
	test("R opens Resume for an ended Subscription, and S and P do nothing", async () => {
		const ended = withNetflix({
			status: "ended",
			endDate: "2026-09-30",
			nextDueOn: null,
		});
		const { user } = await select(ended, `?open=${netflix!.id}`);
		await user.keyboard("s");
		await user.keyboard("p");
		expect(dialog("Pause Netflix")).toBeNull();
		await user.keyboard("r");
		expect(
			await screen.findByRole("dialog", { name: "Resume Netflix?" }),
		).toBeVisible();
	});

	// AC-F05-52
	test("R is Resume now for a paused one, and P changes the pause", async () => {
		const paused = withNetflix({
			status: "paused",
			pause: { from: "2026-10-05", until: "2027-01-05" },
			nextDueOn: "2027-01-05",
		});
		const patches = route(
			network,
			"patch",
			`/api/subscriptions/${netflix!.id}`,
			() => ok({ ...netflix, currency: "INR", changeDate: "2026-11-02" }),
		);
		const { user } = await select(paused);
		await user.keyboard("r");
		await waitFor(() => expect(patches).toHaveLength(1));
		expect(patches[0]?.body).toMatchObject({
			pause: { from: "2026-10-05", until: "2026-11-02" },
		});
		await user.keyboard("p");
		expect(
			await screen.findByRole("dialog", { name: "Pause Netflix" }),
		).toBeVisible();
	});

	// AC-F05-52
	test("on an ending one R keeps it going and C changes its end", async () => {
		const ending = withNetflix({ status: "ending", endDate: "2026-12-31" });
		const { user } = await select(ending);
		await user.keyboard("r");
		expect(
			await screen.findByRole("dialog", { name: "Resume Netflix?" }),
		).toBeVisible();
		await user.keyboard("{Escape}");
		await waitFor(() => expect(dialog("Resume Netflix?")).toBeNull());
		await user.keyboard("c");
		await screen.findByRole("dialog", { name: "Cancel Netflix?" });
		expect(
			screen.getByRole("radio", { name: /^On a later date/ }),
		).toBeChecked();
	});

	// AC-F05-52
	test("with nothing selected no key does anything", async () => {
		wide();
		const { user } = renderPage({ seed: golden });
		for (const key of ["s", "p", "r", "c", "{Delete}", "{Backspace}", "e"]) {
			await user.keyboard(key);
		}
		expect(screen.queryByRole("dialog")).toBeNull();
		expect(screen.queryByRole("alertdialog")).toBeNull();
	});

	// AC-F05-52
	test("while a dialog is open the keys leave it alone", async () => {
		const { user } = await select(golden);
		await user.keyboard("p");
		await screen.findByRole("dialog", { name: "Pause Netflix" });
		await user.keyboard("c");
		await user.keyboard("{Delete}");
		expect(screen.getAllByRole("dialog")).toHaveLength(1);
		expect(screen.queryByRole("alertdialog")).toBeNull();
	});

	// AC-F05-52
	test("while the conflict view is open the keys rest behind it, and nothing is sent", async () => {
		const skips = route(
			network,
			"post",
			`/api/subscriptions/${golden.items[0]!.id}/skips`,
			() =>
				refuse(409, "version_conflict", {
					message: "m",
					details: {
						current: {
							...golden.items[0],
							currency: "INR",
							version: 12,
						},
					},
				}),
		);
		const { user } = await select(golden);
		await user.keyboard("s");
		await screen.findByRole("dialog", {
			name: "This Subscription changed on another device",
		});
		await user.keyboard("s");
		await user.keyboard("p");
		await user.keyboard("c");
		await user.keyboard("{Delete}");
		await user.keyboard("e");
		expect(screen.getAllByRole("dialog")).toHaveLength(1);
		expect(screen.queryByRole("alertdialog")).toBeNull();
		expect(skips).toHaveLength(1);
	});

	// AC-F05-52
	test("in a text field a letter is typed, not a command", async () => {
		const { user } = await select(golden);
		const field = document.createElement("input");
		document.body.append(field);
		field.focus();
		await user.keyboard("pcs{Backspace}");
		expect(screen.queryByRole("dialog")).toBeNull();
		field.remove();
	});

	// AC-F05-52
	test("they work below 1180 px with the drawer open", async () => {
		media({ wide: true, docked: false });
		const { user } = renderPage({ seed: golden });
		await user.click(rowNamed("Netflix"));
		await screen.findByRole("dialog", { name: "Subscription" });
		await user.keyboard("c");
		expect(
			await screen.findByRole("dialog", { name: "Cancel Netflix?" }),
		).toBeVisible();
	});
});
