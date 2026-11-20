import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { delay } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, test, vi } from "vitest";

import { renderInApp } from "@/components/app/__tests__/helpers";
import { ok, refuse, route } from "../../hooks/__tests__/helpers";
import {
	charge,
	listPage,
	subscriptionAnswer,
	subscriptionItem,
} from "../../lib/__tests__/fixtures";
import type { SubscriptionItem, SubscriptionsLocale } from "../../lib/types";
import { ResumeDialog, type ResumeDialogProps } from "../ResumeDialog";

const network = setupServer();
beforeAll(() => network.listen({ onUnhandledFrame: "error" }));
afterEach(() => {
	network.resetHandlers();
	vi.restoreAllMocks();
});
afterAll(() => network.close());

/** The golden profile at the golden clock: 2 November 2026 in `en-IN`. */
const IN: SubscriptionsLocale = {
	currency: "INR",
	numberLocale: "en-IN",
	dateLocale: "en-IN",
	today: "2026-11-02",
	timezone: "Asia/Kolkata",
	weekStart: "monday",
};
/** Netflix cancelled on 30 September, after its 5 September charge. */
const ENDED = subscriptionItem("netflix", {
	status: "ended",
	endDate: "2026-09-30",
	nextDueOn: null,
});
const ENDING = subscriptionItem("netflix", {
	status: "ending",
	endDate: "2026-12-31",
});
const PATCH = `/api/subscriptions/${ENDED.id}`;
const SEPT = [
	charge({
		subscriptionId: ENDED.id,
		dueOn: "2026-09-05",
		occurredOn: "2026-09-05",
	}),
];
const SAVED = () => ({
	...subscriptionAnswer("netflix", { version: ENDED.version + 1 }),
	changeDate: "2026-11-02",
	chargesCreated: 0,
	chargesUpdated: 0,
	chargesDeleted: 0,
	months: [],
});

function setup(
	item: SubscriptionItem = ENDED,
	charges: ReturnType<typeof charge>[] | "fail" = SEPT,
	props: Partial<ResumeDialogProps> = {},
) {
	route(network, "get", "/api/transactions", () =>
		charges === "fail" ? refuse(500, "internal_error") : ok(listPage(charges)),
	);
	const handlers = { onClose: vi.fn(), onSaved: vi.fn() };
	renderInApp(
		<ResumeDialog
			isOpen
			item={item}
			locale={IN}
			{...handlers}
			{...props}
		/>,
	);
	return { ...handlers, user: userEvent.setup() };
}

const button = (name: string | RegExp) => screen.getByRole("button", { name });
const resting = (name: string | RegExp) =>
	expect(button(name)).toHaveAttribute("aria-disabled", "true");
const ready = () =>
	waitFor(() =>
		expect(button("Resume Netflix")).not.toHaveAttribute(
			"aria-disabled",
			"true",
		),
	);

describe("Resume Netflix? (BR-F05-42)", () => {
	// AC-F05-48
	test("opens with where it ended and offers the two ways to resume", async () => {
		setup();
		expect(screen.getByRole("dialog")).toHaveAccessibleName("Resume Netflix?");
		expect(
			await screen.findByText("Ended 30 Sept 2026, after the 5 Sept charge"),
		).toBeVisible();
		const group = screen.getByRole("radiogroup", { name: "How to resume" });
		expect(
			within(group).getByRole("radio", { checked: true }),
		).toHaveAccessibleName(/^Restart from today/);
		expect(
			screen.getByText(
				"Charges restart from today. Months while it was cancelled aren't added.",
			),
		).toBeVisible();
		expect(
			await screen.findByText(
				"Also adds the 1 missed charge: 5 Oct, ₹649.00.",
			),
		).toBeVisible();
		await ready();
	});

	// AC-F05-48
	test("the strip shows the missed date as not added, and the next charges", async () => {
		setup();
		const strip = await screen.findByRole("list", {
			name: "Charges around today",
		});
		expect(within(strip).getByText("not added")).toBeVisible();
		expect(within(strip).getByText("next")).toBeVisible();
	});

	// AC-F05-48
	test("choosing It never actually stopped shows the date as added", async () => {
		const { user } = setup();
		await user.click(
			await screen.findByRole("radio", { name: /^It never actually stopped/ }),
		);
		const strip = await screen.findByRole("list", {
			name: "Charges around today",
		});
		expect(within(strip).getByText("added")).toBeVisible();
		expect(within(strip).queryByText("not added")).toBeNull();
	});

	// AC-F05-48
	test("with nothing missed it says the charges restart and offers no choice", async () => {
		const yesterday = subscriptionItem("netflix", {
			status: "ended",
			endDate: "2026-11-01",
			nextDueOn: null,
		});
		setup(yesterday, SEPT);
		expect(await screen.findByText("Charges restart from today.")).toBeVisible();
		expect(
			screen.queryByRole("radiogroup", { name: "How to resume" }),
		).toBeNull();
		await ready();
	});

	// AC-F05-48
	test("an ending Subscription says its end date is cleared", async () => {
		setup(ENDING);
		expect(screen.getByText("Ends 31 Dec 2026")).toBeVisible();
		expect(
			await screen.findByText(
				"The end date is cleared. Charges carry on after 31 Dec 2026.",
			),
		).toBeVisible();
		await ready();
	});

	test("shows the price with its cadence and Change the price too", async () => {
		setup();
		expect(screen.getByText("₹649.00 a month")).toBeVisible();
		expect(button("Change the price too")).toBeVisible();
		await ready();
	});

	test("the choices wait for the charges, since they say which dates were missed", async () => {
		route(network, "get", "/api/transactions", async () => {
			await delay(80);
			return ok(listPage(SEPT));
		});
		renderInApp(
			<ResumeDialog
				isOpen
				item={ENDED}
				locale={IN}
				onClose={vi.fn()}
			/>,
		);
		expect(
			screen.queryByRole("radiogroup", { name: "How to resume" }),
		).toBeNull();
		expect(
			await screen.findByRole("radiogroup", { name: "How to resume" }),
		).toBeVisible();
	});

	test("Save rests until the charges have loaded, or says they could not be", async () => {
		setup(ENDED, "fail");
		expect(
			await screen.findByText("Charges could not be loaded."),
		).toBeVisible();
		resting("Resume Netflix");
		expect(button("Retry")).toBeVisible();
	});
});

describe("the price (BR-F05-42)", () => {
	// AC-F05-48
	test("Change the price too opens New amount, focused, with its hint", async () => {
		const { user } = setup();
		await user.click(button("Change the price too"));
		const box = screen.getByRole("textbox", { name: "New amount" });
		expect(box).toHaveFocus();
		expect(box).toHaveValue("649.00");
		expect(
			screen.getByText("Was ₹649.00. Charges from today use it."),
		).toBeVisible();
		expect(
			screen.queryByRole("button", { name: "Change the price too" }),
		).toBeNull();
	});

	test("an ending one says charges after today use it", async () => {
		const { user } = setup(ENDING);
		await user.click(button("Change the price too"));
		expect(
			screen.getByText("Was ₹649.00. Charges after today use it."),
		).toBeVisible();
	});

	test("the missed charges and the strip follow the new amount", async () => {
		const { user } = setup();
		await user.click(button("Change the price too"));
		const box = screen.getByRole("textbox", { name: "New amount" });
		await user.clear(box);
		await user.type(box, "799");
		expect(
			screen.getByText("Also adds the 1 missed charge: 5 Oct, ₹799.00."),
		).toBeVisible();
	});

	// AC-F05-48
	test("an emptied amount says Enter an amount., sends nothing and focuses it", async () => {
		const patches = route(network, "patch", PATCH, () => ok(SAVED()));
		const { user } = setup();
		await ready();
		await user.click(button("Change the price too"));
		await user.clear(screen.getByRole("textbox", { name: "New amount" }));
		await user.click(button("Resume Netflix"));
		expect(await screen.findByText("Enter an amount.")).toBeVisible();
		await waitFor(() =>
			expect(
				screen.getByRole("textbox", { name: "New amount" }),
			).toHaveFocus(),
		);
		expect(patches).toHaveLength(0);
	});

	test("an amount that is not a number gets F03's message", async () => {
		const { user } = setup();
		await ready();
		await user.click(button("Change the price too"));
		const box = screen.getByRole("textbox", { name: "New amount" });
		await user.clear(box);
		await user.type(box, "abc");
		await user.click(button("Resume Netflix"));
		expect(
			await screen.findByText("Enter a number, like 1,240.50."),
		).toBeVisible();
	});

	test("leaving the box tidies the amount", async () => {
		const { user } = setup();
		await user.click(button("Change the price too"));
		const box = screen.getByRole("textbox", { name: "New amount" });
		await user.clear(box);
		await user.type(box, "1234.5");
		await user.tab();
		expect(box).toHaveValue("1,234.50");
	});
});

describe("saving (BR-F05-13, BR-F05-32, section 11)", () => {
	// AC-F05-48
	test("restarting clears the end date and nothing else, at the version it opened with", async () => {
		const patches = route(network, "patch", PATCH, () => ok(SAVED()));
		const { user, onSaved, onClose } = setup();
		await ready();
		await user.click(button("Resume Netflix"));
		await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
		expect(patches[0]?.body).toEqual({
			changedAt: expect.any(String),
			endDate: null,
		});
		expect(patches[0]?.headers.get("if-match")).toBe(`"${ENDED.version}"`);
		expect(onSaved).toHaveBeenCalled();
	});

	// AC-F05-48
	test("it never actually stopped asks for the missed charges", async () => {
		const patches = route(network, "patch", PATCH, () => ok(SAVED()));
		const { user, onClose } = setup();
		await ready();
		await user.click(
			screen.getByRole("radio", { name: /^It never actually stopped/ }),
		);
		await user.click(button("Resume Netflix"));
		await waitFor(() => expect(onClose).toHaveBeenCalled());
		expect(patches[0]?.body).toEqual({
			changedAt: expect.any(String),
			endDate: null,
			backfillGap: true,
		});
	});

	// AC-F05-48
	test("a new price is sent with its currency in the same write", async () => {
		const patches = route(network, "patch", PATCH, () => ok(SAVED()));
		const { user, onClose } = setup();
		await ready();
		await user.click(button("Change the price too"));
		const box = screen.getByRole("textbox", { name: "New amount" });
		await user.clear(box);
		await user.type(box, "799");
		await user.click(button("Resume Netflix"));
		await waitFor(() => expect(onClose).toHaveBeenCalled());
		expect(patches[0]?.body).toEqual({
			changedAt: expect.any(String),
			endDate: null,
			amountMinor: 79900,
			currency: "INR",
		});
	});

	test("Keep it going on an ending Subscription clears its end date", async () => {
		const patches = route(
			network,
			"patch",
			`/api/subscriptions/${ENDING.id}`,
			() => ok(SAVED()),
		);
		const { user, onClose } = setup(ENDING, []);
		await ready();
		await user.click(button("Resume Netflix"));
		await waitFor(() => expect(onClose).toHaveBeenCalled());
		expect(patches[0]?.body).toEqual({
			changedAt: expect.any(String),
			endDate: null,
		});
	});

	test("two presses send one request", async () => {
		const patches = route(network, "patch", PATCH, async () => {
			await delay(60);
			return ok(SAVED());
		});
		const { user, onClose } = setup();
		await ready();
		await user.dblClick(button("Resume Netflix"));
		await waitFor(() => expect(onClose).toHaveBeenCalled());
		expect(patches).toHaveLength(1);
	});
});

describe("a refused Resume keeps the dialog open (section 8)", () => {
	async function resume(user: ReturnType<typeof userEvent.setup>) {
		await ready();
		await user.click(button("Resume Netflix"));
	}

	test("a 422 for the amount goes under New amount", async () => {
		route(network, "patch", PATCH, () =>
			refuse(422, "validation_failed", {
				message: "m",
				fields: { amountMinor: "The largest amount is 99,99,99,99,999.99." },
			}),
		);
		const { user, onClose } = setup();
		await ready();
		await user.click(button("Change the price too"));
		const box = screen.getByRole("textbox", { name: "New amount" });
		await user.clear(box);
		await user.type(box, "799");
		await user.click(button("Resume Netflix"));
		expect(
			await screen.findByText("The largest amount is 99,99,99,99,999.99."),
		).toBeVisible();
		expect(onClose).not.toHaveBeenCalled();
	});

	test("a failed request says it could not be saved", async () => {
		route(network, "patch", PATCH, () => refuse(500, "internal_error"));
		const { user, onClose } = setup();
		await resume(user);
		expect(
			await screen.findByText(/^The Subscription could not be saved\./),
		).toBeVisible();
		expect(onClose).not.toHaveBeenCalled();
	});

	test("a 404 says it was deleted on another device", async () => {
		route(network, "patch", PATCH, () =>
			refuse(404, "not_found", { message: "gone" }),
		);
		const { user } = setup();
		await resume(user);
		expect(
			await screen.findByText(
				"This Subscription was deleted on another device.",
			),
		).toBeVisible();
	});

	test("a 409 says it changed on another device", async () => {
		route(network, "patch", PATCH, () =>
			refuse(409, "version_conflict", {
				message: "m",
				details: { current: subscriptionAnswer("netflix", { version: 9 }) },
			}),
		);
		route(network, "get", "/api/subscriptions", () => ok({}));
		const { user } = setup();
		await resume(user);
		expect(
			await screen.findByText(
				/^This Subscription changed on another device\./,
			),
		).toBeVisible();
	});
});

describe("offline, before M5", () => {
	test("says so, disables the button and sends nothing", async () => {
		vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
		const patches = route(network, "patch", PATCH, () => ok({}));
		const { user } = setup();
		act(() => {
			window.dispatchEvent(new Event("offline"));
		});
		expect(screen.getByText("You are offline. Connect to save.")).toBeVisible();
		await user.click(button("Resume Netflix"));
		resting("Resume Netflix");
		expect(patches).toHaveLength(0);
	});
});

describe("closing", () => {
	test("Not now closes without a write", async () => {
		const patches = route(network, "patch", PATCH, () => ok({}));
		const { user, onClose } = setup();
		await user.click(button("Not now"));
		expect(onClose).toHaveBeenCalledOnce();
		expect(patches).toHaveLength(0);
	});

	test("Escape closes it", async () => {
		const { user, onClose } = setup();
		await user.keyboard("{Escape}");
		expect(onClose).toHaveBeenCalledOnce();
	});
});
