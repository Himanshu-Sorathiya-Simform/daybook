import { onlineManager } from "@tanstack/react-query";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderToString } from "react-dom/server";
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
import {
	emptyList,
	subscriptionItem,
	subscriptionList,
} from "../../lib/__tests__/fixtures";
import { SubscriptionsPage } from "../SubscriptionsPage";

const network = setupServer();
beforeAll(() => network.listen({ onUnhandledFrame: "error" }));
beforeEach(() => window.localStorage.clear());
afterEach(() => {
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
 * `wide` is 768 px up, where Table is offered. */
function media({ wide = false }) {
	window.matchMedia = vi.fn((query: string) => ({
		matches: wide && query === "(min-width: 48rem)",
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
};

/** Serves `/api/subscriptions` with `answer` and renders the page. With `seed`, the list is in
 * the cache as the server render leaves it. */
function renderPage({
	answer = () => ok(subscriptionList()),
	seed,
	search = "",
}: {
	answer?: () => Response | Promise<Response>;
	seed?: SubscriptionList;
	/** The URL's query, such as "?open=<id>". */
	search?: string;
} = {}) {
	const reads = route(network, "get", "/api/subscriptions", answer);
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
		expect(screen.getByText("Calendar is coming soon.")).toBeVisible();
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
		media({ wide: true });
		renderPage({ seed: golden });
		expect(screen.getByText("Monthly cost")).toBeVisible();
		expect(screen.getByText("Within 7 days · 1")).toBeVisible();
		expect(rowNamed("Netflix")).toBeVisible();
		expect(screen.queryByText(/coming soon/)).toBeNull();
	});

	test("shows no list in the Calendar and Table views, which arrive later", async () => {
		media({ wide: true });
		window.localStorage.setItem(VIEW_KEY, "calendar");
		renderPage({ seed: golden });
		expect(screen.queryByRole("grid", { name: "Subscriptions" })).toBeNull();
		expect(screen.getByText("Calendar is coming soon.")).toBeVisible();
	});

	test("pressing a row selects it, and pressing it again clears it", async () => {
		media({ wide: true });
		const { user } = renderPage({ seed: golden });
		await user.click(rowNamed("Netflix"));
		expect(rowNamed("Netflix")).toHaveAttribute("aria-selected", "true");
		await user.click(rowNamed("Netflix"));
		expect(rowNamed("Netflix")).toHaveAttribute("aria-selected", "false");
	});

	test("selecting another row moves the selection", async () => {
		media({ wide: true });
		const { user } = renderPage({ seed: golden });
		await user.click(rowNamed("Netflix"));
		await user.click(rowNamed("Cult Gym"));
		expect(rowNamed("Netflix")).toHaveAttribute("aria-selected", "false");
		expect(rowNamed("Cult Gym")).toHaveAttribute("aria-selected", "true");
	});

	test("selecting does not change the remembered view", async () => {
		media({ wide: true });
		const { user } = renderPage({ seed: golden });
		await user.click(rowNamed("Netflix"));
		expect(window.localStorage.getItem(VIEW_KEY)).toBeNull();
		expect(
			screen.getByRole("radio", { name: "List", checked: true }),
		).toBeVisible();
	});

	test("a Subscription that is deleted elsewhere is no longer selected after a refresh", async () => {
		media({ wide: true });
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
		media({ wide: true });
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
		media({ wide: true });
		const { user } = renderPage({ seed: golden });
		await user.click(
			screen.getByRole("button", { name: "Actions for Netflix" }),
		);
		await user.keyboard("{Escape}");
		expect(rowNamed("Netflix")).toHaveAttribute("aria-selected", "false");
	});

	test("below 768 px the rows have no menu", () => {
		media({ wide: false });
		renderPage({ seed: golden });
		expect(screen.queryByRole("button", { name: /Actions for/ })).toBeNull();
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
		media({ wide: true });
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
		media({ wide: true });
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
		media({ wide: true });
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
		media({ wide: true });
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
		media({ wide: true });
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
		media({ wide: true });
		window.localStorage.setItem(VIEW_KEY, "calendar");
		const { calls } = renderPage({
			seed: golden,
			search: `?open=${netflix!.id}`,
		});
		expect(screen.getByText("Calendar is coming soon.")).toBeVisible();
		await waitFor(() => expect(calls).toHaveLength(1));
		expect(window.localStorage.getItem(VIEW_KEY)).toBe("calendar");
	});

	test("with no list it does nothing and keeps the parameter", async () => {
		media({ wide: true });
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
		media({ wide: true });
		const { user } = renderPage({
			seed: golden,
			search: `?open=${netflix!.id}`,
		});
		await user.click(rowNamed("Netflix"));
		expect(rowNamed("Netflix")).toHaveAttribute("aria-selected", "false");
	});
});
