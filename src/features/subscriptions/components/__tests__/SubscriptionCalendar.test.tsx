import { onlineManager } from "@tanstack/react-query";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { delay } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, test, vi } from "vitest";

import { AppProviders } from "@/components/app/AppProviders";
import type { Transaction } from "@/lib/transactions/model";
import {
	ok,
	refuse,
	route,
	type Seen,
	testClient,
} from "../../hooks/__tests__/helpers";
import {
	charge,
	listPage,
	monthsAnswer,
	subscriptionItem,
} from "../../lib/__tests__/fixtures";
import { SubscriptionCalendar } from "../SubscriptionCalendar";
import { CAL, NOVEMBER_CHARGE, rowWidth } from "./calendar-data";

const network = setupServer();
beforeAll(() => network.listen({ onUnhandledFrame: "error" }));
afterEach(() => {
	vi.unstubAllGlobals();
	network.resetHandlers();
	onlineManager.setOnline(true);
	vi.restoreAllMocks();
});
afterAll(() => network.close());

const ITEMS = [
	subscriptionItem("netflix"),
	subscriptionItem("cultGym"),
	subscriptionItem("sunrise"),
	subscriptionItem("amazonPrime"),
];

const OCTOBER = [
	charge({
		subscriptionId: ITEMS[2]!.id,
		subscription: { id: ITEMS[2]!.id, name: "Sunrise Apartments" },
		payee: "Sunrise Apartments",
		category: "housing",
		occurredOn: "2026-10-01",
		dueOn: "2026-10-01",
		amountMinor: 1800000,
	}),
	charge({ occurredOn: "2026-10-05", dueOn: "2026-10-05" }),
];

type Setup = {
	charges?: Transaction[] | ((request: Seen) => Response | Promise<Response>);
	months?: (request: Seen) => Response | Promise<Response>;
	isWide?: boolean;
	selected?: string | null;
	markedDue?: string | null;
	weekStart?: "monday" | "sunday" | "saturday";
	/** The month row's width in pixels; 800 holds the most months, 8. `null` is a browser that
	 * cannot measure it. */
	width?: number | null;
};

function setup({
	charges = [NOVEMBER_CHARGE, ...OCTOBER],
	months,
	isWide = true,
	selected = null,
	markedDue = null,
	weekStart = "monday",
	width = 800,
}: Setup = {}) {
	if (width === null) vi.stubGlobal("ResizeObserver", undefined);
	const resize = width === null ? () => {} : rowWidth(width);
	const chargeReads = route(
		network,
		"get",
		"/api/transactions",
		typeof charges === "function" ? charges : (
			(request) => {
				const query = new URL(request.path, "http://x").searchParams;
				return ok(
					listPage(
						charges.filter(
							(each) =>
								each.occurredOn >= query.get("from")!
								&& each.occurredOn <= query.get("to")!,
						),
					),
				);
			}
		),
	);
	const monthReads = route(
		network,
		"get",
		"/api/subscriptions/months",
		months
			?? ((request) => {
				const query = new URL(request.path, "http://x").searchParams;
				return ok(monthsAnswer(query.get("from")!, query.get("to")!));
			}),
	);
	const onSelectItem = vi.fn();
	const view = render(
		<AppProviders
			navigate={vi.fn()}
			queryClient={testClient()}
		>
			<SubscriptionCalendar
				items={ITEMS}
				formats={{ ...CAL, weekStart }}
				isWide={isWide}
				selected={selected}
				markedDue={markedDue}
				onSelectItem={onSelectItem}
			/>
		</AppProviders>,
	);
	return {
		...view,
		resize,
		chargeReads,
		monthReads,
		onSelectItem,
		user: userEvent.setup(),
	};
}

const title = () => screen.findByRole("heading", { name: "November 2026" });
/** The grid has its charges: not busy any more. */
const loaded = () =>
	waitFor(() =>
		expect(screen.getByRole("table")).toHaveAttribute("aria-busy", "false"),
	);
const figures = () => screen.findByText("₹18,000.00 charged · ₹2,149.00 to come");

describe("SubscriptionCalendar on golden (BR-F05-38)", () => {
	// AC-F05-40
	test("opens on the current month with its title and figures", async () => {
		setup();
		expect(await title()).toBeVisible();
		expect(await figures()).toBeVisible();
	});

	test("reads the months of the row and the month's charges, once each", async () => {
		const { chargeReads, monthReads } = setup();
		await figures();
		expect(monthReads.map((read) => read.path)).toEqual([
			"/api/subscriptions/months?from=2026-08&to=2027-03",
		]);
		expect(chargeReads).toHaveLength(1);
		const query = new URL(chargeReads[0]!.path, "http://x").searchParams;
		expect(query.get("src")).toBe("subscription");
		expect(query.get("from")).toBe("2026-11-01");
		expect(query.get("to")).toBe("2026-11-30");
	});

	// AC-F05-40
	test("the month row shows 8 months named by their figures", async () => {
		setup();
		await figures();
		expect(screen.getAllByRole("option")).toHaveLength(8);
		expect(
			await screen.findByRole("option", {
				name: "November 2026, charged ₹18,000.00 of ₹20,149.00",
			}),
		).toHaveAttribute("aria-selected", "true");
	});

	// AC-F05-40
	test("from 768 px it draws the grid with November's items and the legend", async () => {
		setup();
		await figures();
		expect(screen.getByRole("table", { name: "November 2026" })).toBeVisible();
		expect(
			screen.getByRole("button", { name: "Netflix, ₹649.00, due" }),
		).toBeVisible();
		expect(
			screen.getByRole("button", {
				name: "Sunrise Apartments, ₹18,000.00, charged",
			}),
		).toBeVisible();
		expect(screen.getByText("Filled dot: charged")).toBeVisible();
		expect(screen.getByText("Ring: due")).toBeVisible();
		expect(screen.getByText("Struck: skipped or paused")).toBeVisible();
	});

	test("the legend leaves out the pending line until M5", async () => {
		setup();
		await figures();
		expect(screen.queryByText("Dashed ring: pending sync")).toBeNull();
	});

	// AC-F05-40
	test("below 768 px it draws the days and the months that fit, with no grid and no legend", async () => {
		setup({ isWide: false, width: 340 });
		await figures();
		expect(screen.queryByRole("table")).toBeNull();
		expect(screen.getAllByRole("heading", { level: 3 })).toHaveLength(6);
		expect(screen.getAllByRole("option")).toHaveLength(4);
		expect(screen.queryByText("Filled dot: charged")).toBeNull();
	});

	// AC-F05-40
	test.each([
		[340, 4],
		[520, 4],
		[560, 5],
		[650, 6],
		[740, 7],
		[800, 8],
		[1400, 8],
	])("a row %i px wide shows %i months", async (width, count) => {
		setup({ width });
		await figures();
		expect(screen.getAllByRole("option")).toHaveLength(count);
	});

	test("the row's width is not known at first, and shows 5 months", async () => {
		setup({ width: null });
		await figures();
		expect(screen.getAllByRole("option")).toHaveLength(5);
	});

	test("the row follows its width as the window changes, with no new read", async () => {
		const { resize, monthReads } = setup({ width: 800 });
		await figures();
		expect(screen.getAllByRole("option")).toHaveLength(8);
		act(() => resize(520));
		expect(screen.getAllByRole("option")).toHaveLength(4);
		act(() => resize(650));
		expect(screen.getAllByRole("option")).toHaveLength(6);
		expect(monthReads).toHaveLength(1);
	});

	test("a narrower row keeps the current month and the chosen month on screen", async () => {
		const { resize } = setup({ width: 800 });
		await figures();
		act(() => resize(340));
		expect(
			screen.getByRole("option", { name: /^November 2026/ }),
		).toHaveAttribute("aria-selected", "true");
	});

	test("every month's figure is in whole units, never cut", async () => {
		setup({ width: 340 });
		await figures();
		expect(
			screen.getByRole("option", { name: /^November 2026/ }),
		).toHaveTextContent("₹20,149");
	});

	test("below 768 px only the current month scrolls to today", async () => {
		const scrolled = vi.fn();
		Element.prototype.scrollIntoView = scrolled;
		try {
			const { user } = setup({ isWide: false });
			await figures();
			expect(scrolled).toHaveBeenCalledTimes(1);
			await user.click(screen.getByRole("option", { name: /^October 2026/ }));
			await screen.findByText("₹18,649.00 charged");
			expect(scrolled).toHaveBeenCalledTimes(1);
			await user.click(screen.getByRole("option", { name: /^November 2026/ }));
			await figures();
			expect(scrolled).toHaveBeenCalledTimes(2);
		} finally {
			// @ts-expect-error jsdom has none.
			delete Element.prototype.scrollIntoView;
		}
	});

	test("the heading of a Sunday week start begins its grid with Sun", async () => {
		setup({ weekStart: "sunday" });
		await figures();
		expect(screen.getAllByRole("columnheader")[0]).toHaveTextContent("Sun");
	});

	// AC-F05-40
	test("choosing October shows its charges and its title", async () => {
		const { chargeReads, user } = setup();
		await figures();
		await user.click(screen.getByRole("option", { name: /^October 2026/ }));
		expect(
			await screen.findByRole("heading", { name: "October 2026" }),
		).toBeVisible();
		expect(await screen.findByText("₹18,649.00 charged")).toBeVisible();
		expect(chargeReads).toHaveLength(2);
		expect(
			screen.getByRole("option", { name: /^October 2026/ }),
		).toHaveAttribute("aria-selected", "true");
		expect(
			screen.getByRole("button", { name: "Netflix, ₹649.00, charged" }),
		).toBeVisible();
	});

	test("choosing December shows what is expected at today's prices", async () => {
		const { user } = setup();
		await figures();
		await user.click(screen.getByRole("option", { name: /^December 2026/ }));
		expect(
			await screen.findByText("₹20,149.00 expected, at today's prices"),
		).toBeVisible();
	});

	test("choosing back a month reads it from the cache without a new read", async () => {
		const { chargeReads, user } = setup();
		await figures();
		await user.click(screen.getByRole("option", { name: /^October 2026/ }));
		await screen.findByText("₹18,649.00 charged");
		await user.click(screen.getByRole("option", { name: /^November 2026/ }));
		expect(await figures()).toBeVisible();
		expect(chargeReads).toHaveLength(2);
	});

	test("a month that is loading shows its title at once with a bar for the figures", async () => {
		const { user } = setup({
			charges: async (request) => {
				const from = new URL(request.path, "http://x").searchParams.get(
					"from",
				);
				if (from === "2026-10-01") await delay("infinite");
				return ok(listPage([NOVEMBER_CHARGE]));
			},
		});
		await figures();
		await user.click(screen.getByRole("option", { name: /^October 2026/ }));
		expect(
			await screen.findByRole("heading", { name: "October 2026" }),
		).toBeVisible();
		expect(
			screen.getByRole("status", { name: "Loading the month" }),
		).toBeVisible();
		expect(screen.queryByText(/₹.* charged$/)).toBeNull();
		expect(screen.queryByRole("button", { name: /Netflix/ })).toBeNull();
	});

	// AC-F05-40
	test("Earlier months moves the row by 3 and reads the new span", async () => {
		const { monthReads, user } = setup();
		await figures();
		await user.click(screen.getByRole("button", { name: "Earlier months" }));
		expect(
			await screen.findByRole("option", { name: /^May 2026/ }),
		).toBeVisible();
		expect(screen.queryByRole("option", { name: /^March 2027/ })).toBeNull();
		await waitFor(() =>
			expect(monthReads.map((read) => read.path)).toContain(
				"/api/subscriptions/months?from=2026-05&to=2026-12",
			),
		);
	});

	test("Later months moves the row by 3 the other way", async () => {
		const { user } = setup();
		await figures();
		await user.click(screen.getByRole("button", { name: "Later months" }));
		expect(
			await screen.findByRole("option", { name: /^June 2027/ }),
		).toBeVisible();
	});

	test("moving the row leaves the shown month as it was", async () => {
		const { user } = setup();
		await figures();
		await user.click(screen.getByRole("button", { name: "Later months" }));
		await screen.findByRole("option", { name: /^June 2027/ });
		expect(screen.getByRole("heading", { name: "November 2026" })).toBeVisible();
		expect(screen.getByRole("table", { name: "November 2026" })).toBeVisible();
	});

	test("on a phone Earlier months also moves by 3", async () => {
		const { user } = setup({ isWide: false, width: 340 });
		await figures();
		await user.click(screen.getByRole("button", { name: "Earlier months" }));
		await screen.findByRole("option", { name: /^July 2026/ });
		expect(screen.getAllByRole("option")).toHaveLength(4);
	});

	// AC-F05-40
	test("the arrows stop at 120 months", async () => {
		const { user } = setup();
		await figures();
		const later = screen.getByRole("button", { name: "Later months" });
		for (let step = 0; step < 38; step += 1) await user.click(later);
		expect(later).toHaveAttribute("aria-disabled", "true");
		expect(
			screen.getByRole("button", { name: "Earlier months" }),
		).not.toHaveAttribute("aria-disabled", "true");
	}, 30000);

	test("selecting an item reports it", async () => {
		const { onSelectItem, user } = setup();
		await figures();
		await user.click(screen.getByRole("button", { name: /^Netflix/ }));
		expect(onSelectItem.mock.calls[0]![0]).toMatchObject({
			subscriptionId: ITEMS[0]!.id,
			date: "2026-11-05",
			kind: "due",
		});
	});

	test("the item the panel marks is tinted", async () => {
		setup({ selected: ITEMS[0]!.id, markedDue: "2026-11-05" });
		await figures();
		expect(screen.getByRole("button", { name: /^Netflix/ })).toHaveClass(
			"bg-accent-soft",
		);
	});

	test("a charge of a deleted Subscription is drawn and reported with no Subscription", async () => {
		const orphan = charge({
			subscriptionId: null,
			subscription: null,
			payee: "Old gym",
			occurredOn: "2026-11-03",
			dueOn: null,
			amountMinor: 50000,
		});
		const { onSelectItem, user } = setup({ charges: [NOVEMBER_CHARGE, orphan] });
		await loaded();
		await user.click(
			screen.getByRole("button", { name: "Old gym, ₹500.00, charged" }),
		);
		expect(onSelectItem.mock.calls[0]![0]).toMatchObject({
			subscriptionId: null,
		});
	});

	test("a month with more than 100 charges reads every page", async () => {
		const first = Array.from({ length: 2 }, (_, at) =>
			charge({
				occurredOn: "2026-11-03",
				dueOn: null,
				subscriptionId: null,
				subscription: null,
				payee: `Gym ${at}`,
			}),
		);
		const { chargeReads } = setup({
			charges: (request) => {
				const cursor = new URL(request.path, "http://x").searchParams.get(
					"cursor",
				);
				return cursor === null ?
						ok(listPage(first.slice(0, 1), "next-page"))
					:	ok(listPage(first.slice(1)));
			},
		});
		await loaded();
		expect(chargeReads).toHaveLength(2);
		expect(screen.getByRole("button", { name: /^Gym 0/ })).toBeVisible();
		expect(screen.getByRole("button", { name: /^Gym 1/ })).toBeVisible();
	});
});

describe("SubscriptionCalendar loading and failing (BR-F05-38, BR-F05-48)", () => {
	// AC-F05-40
	test("while the charges load the grid keeps its weeks with bars and the title has no figures", async () => {
		setup({ charges: async () => (await delay("infinite"), ok({})) });
		expect(await title()).toBeVisible();
		expect(
			screen.getByRole("status", { name: "Loading the month" }),
		).toBeVisible();
		expect(screen.getByRole("table")).toHaveAttribute("aria-busy", "true");
		expect(screen.getAllByRole("row")).toHaveLength(7);
		expect(screen.queryByText(/to come$/)).toBeNull();
	});

	test("the month row has its figures while the charges load", async () => {
		setup({ charges: async () => (await delay("infinite"), ok({})) });
		expect(
			await screen.findByRole("option", {
				name: "November 2026, charged ₹18,000.00 of ₹20,149.00",
			}),
		).toBeVisible();
	});

	test("while the months load each month holds its place with a bar and the grid shows", async () => {
		setup({ months: async () => (await delay("infinite"), ok({})) });
		await figures();
		const nov = screen.getByRole("option", { name: /^November 2026/ });
		expect(nov).toHaveAccessibleName("November 2026");
		expect(screen.getByRole("button", { name: /^Netflix/ })).toBeVisible();
	});

	test("while the months load there is no status for the grid", async () => {
		setup({ months: async () => (await delay("infinite"), ok({})) });
		await figures();
		expect(screen.queryByRole("status")).toBeNull();
	});

	// AC-F05-40
	test("a failed charges read says so with Retry, in place of the grid and the figures", async () => {
		setup({ charges: () => refuse(500, "internal_error") });
		expect(
			await screen.findByText("Charges could not be loaded."),
		).toBeVisible();
		expect(screen.getByRole("alert")).toBeVisible();
		expect(screen.getByRole("button", { name: "Retry" })).toBeVisible();
		expect(screen.queryByRole("table")).toBeNull();
		expect(screen.queryByText(/charged ·/)).toBeNull();
		expect(screen.getByRole("heading", { name: "November 2026" })).toBeVisible();
		expect(screen.getAllByRole("option")).toHaveLength(8);
	});

	test("a failed read leaves the days out below 768 px too", async () => {
		setup({ isWide: false, charges: () => refuse(500, "internal_error") });
		expect(
			await screen.findByText("Charges could not be loaded."),
		).toBeVisible();
		expect(screen.queryByRole("heading", { level: 3 })).toBeNull();
	});

	test("Retry reads again and shows the month when it works", async () => {
		let calls = 0;
		const { user } = setup({
			charges: () =>
				++calls <= 1 ?
					refuse(500, "internal_error")
				:	ok(listPage([NOVEMBER_CHARGE])),
		});
		await user.click(await screen.findByRole("button", { name: "Retry" }));
		expect(await figures()).toBeVisible();
		expect(screen.queryByText("Charges could not be loaded.")).toBeNull();
	});

	test("without a connection and nothing saved it says the same", async () => {
		onlineManager.setOnline(false);
		setup();
		expect(
			await screen.findByText("Charges could not be loaded."),
		).toBeVisible();
		await act(async () => {});
	});

	test("a failed months read shows dashes and the calendar still works", async () => {
		setup({ months: () => refuse(500, "internal_error") });
		await figures();
		const nov = await screen.findByRole("option", { name: "November 2026" });
		expect(nov).toHaveTextContent("—");
		expect(screen.getByRole("button", { name: /^Netflix/ })).toBeVisible();
		expect(within(nov).queryByText(/₹/)).toBeNull();
	});

	test("a failed months read leaves the current month without a bar", async () => {
		setup({ months: () => refuse(500, "internal_error") });
		await figures();
		const nov = await screen.findByRole("option", { name: "November 2026" });
		expect(nov.querySelector(".bg-track")).toBeNull();
	});
});
