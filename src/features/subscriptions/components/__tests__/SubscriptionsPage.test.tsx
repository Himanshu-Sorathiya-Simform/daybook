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

	test("has no Add button, so no dead button ships", async () => {
		renderPage();
		await screen.findByText("Monthly cost");
		expect(
			screen.queryByRole("button", { name: /Add a Subscription/ }),
		).toBeNull();
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

	test("offers no Add button until its dialog exists", async () => {
		renderPage({ answer: () => ok(emptyList()) });
		await screen.findByText("No Subscriptions yet.");
		expect(screen.queryByRole("button")).toBeNull();
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

	test("below 768 px offers List and Calendar only", () => {
		media({ wide: false });
		renderPage({ seed: subscriptionList() });
		expect(screen.getAllByRole("radio")).toHaveLength(2);
		expect(screen.queryByRole("radio", { name: "Table" })).toBeNull();
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

	test("the server renders the narrow header, as it cannot know the width, and the stored view as List", () => {
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
		expect(html).not.toContain(">Table<");
		expect(html).toContain("Netflix");
		expect(html).not.toContain("coming soon");
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

		test("pressing a row opens the drawer with it", async () => {
			media({ wide: true });
			const { user } = renderPage({ seed: golden });
			await user.click(rowNamed("Netflix"));
			const drawer = await screen.findByRole("dialog", {
				name: "Subscription",
			});
			expect(drawer).toHaveTextContent("Netflix");
		});

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

		test("Escape closes it and clears the selection", async () => {
			media({ wide: true });
			const { user } = renderPage({ seed: golden });
			await user.click(rowNamed("Netflix"));
			await screen.findByRole("dialog");
			await user.keyboard("{Escape}");
			await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
			expect(rowNamed("Netflix")).toHaveAttribute("aria-selected", "false");
		});

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

	test("the groups follow the filtered rows: Entertainment is Netflix soon and Amazon Prime later", async () => {
		media({ wide: true, docked: true });
		const { user } = renderPage({ seed: golden });
		await user.click(summaryButton("Entertainment"));
		expect(screen.getByText("Within 7 days · 1")).toBeVisible();
		expect(screen.getByText("Later · 1")).toBeVisible();
		expect(screen.queryByText(/Within 30 days/)).toBeNull();
	});

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
