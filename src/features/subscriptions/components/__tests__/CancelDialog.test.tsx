import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { delay } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, test, vi } from "vitest";

import { AppProviders } from "@/components/app/AppProviders";
import { renderInApp } from "@/components/app/__tests__/helpers";
import { isUuidV7 } from "@/lib/ids";
import { ok, refuse, route } from "../../hooks/__tests__/helpers";
import {
	charge,
	listPage,
	subscriptionAnswer,
	subscriptionItem,
} from "../../lib/__tests__/fixtures";
import type { SubscriptionItem, SubscriptionsLocale } from "../../lib/types";
import { CancelDialog, type CancelDialogProps } from "../CancelDialog";

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
const NETFLIX = subscriptionItem("netflix");
const PATCH = `/api/subscriptions/${NETFLIX.id}`;
const paid = (dueOn: string, edited = false) =>
	charge({
		subscriptionId: NETFLIX.id,
		dueOn,
		occurredOn: dueOn,
		amountMinor: NETFLIX.amountMinor,
		edited,
	});
const CHARGES = [paid("2026-09-05"), paid("2026-10-05")];
const SAVED = () => ({
	...subscriptionAnswer("netflix", { version: NETFLIX.version + 1 }),
	changeDate: "2026-11-02",
	chargesCreated: 0,
	chargesUpdated: 0,
	chargesDeleted: 0,
	months: [],
});

function setup(
	item: SubscriptionItem = NETFLIX,
	charges: ReturnType<typeof charge>[] | "fail" = CHARGES,
	props: Partial<CancelDialogProps> = {},
) {
	route(network, "get", "/api/transactions", () =>
		charges === "fail" ? refuse(500, "internal_error") : ok(listPage(charges)),
	);
	const handlers = { onClose: vi.fn(), onSaved: vi.fn() };
	const element = (extra: Partial<CancelDialogProps> = {}) => (
		<CancelDialog
			isOpen
			item={item}
			locale={IN}
			{...handlers}
			{...props}
			{...extra}
		/>
	);
	const view = renderInApp(element());
	return {
		...view,
		...handlers,
		again: (extra: Partial<CancelDialogProps>) =>
			view.rerender(
				<AppProviders
					navigate={vi.fn()}
					queryClient={view.queryClient}
				>
					{element(extra)}
				</AppProviders>,
			),
		user: userEvent.setup(),
	};
}

const button = (name: string | RegExp) => screen.getByRole("button", { name });
const choice = (name: string | RegExp) => screen.getByRole("radio", { name });
const resting = (name: string | RegExp) =>
	expect(button(name)).toHaveAttribute("aria-disabled", "true");
const ready = (name: string | RegExp) =>
	waitFor(() => expect(button(name)).not.toHaveAttribute("aria-disabled", "true"));

describe("Cancel Netflix? (BR-F05-41)", () => {
	// AC-F05-47
	test("is named Cancel Netflix?, asks When does it end? and opens on Now", async () => {
		setup();
		expect(screen.getByRole("dialog")).toHaveAccessibleName("Cancel Netflix?");
		const group = screen.getByRole("radiogroup", { name: "When does it end?" });
		expect(
			within(group)
				.getAllByRole("radio")
				.map((radio) => radio.closest("label")?.textContent),
		).toEqual([
			expect.stringContaining("Now"),
			expect.stringContaining("After the next charge"),
			expect.stringContaining("On a later date"),
			expect.stringContaining("I cancelled it earlier"),
		]);
		expect(
			within(group).getByRole("radio", { checked: true }),
		).toHaveAccessibleName(/^Now/);
		expect(
			screen.getByText("Ends today, 2 Nov. No more charges."),
		).toBeVisible();
		await ready("Cancel Netflix");
	});

	// AC-F05-47
	test("has no date box until a later or an earlier end is chosen", async () => {
		const { user } = setup();
		expect(screen.queryByRole("button", { name: /^End date/ })).toBeNull();
		await user.click(choice(/^On a later date/));
		expect(button(/^End date/)).toBeVisible();
		await user.click(choice(/^I cancelled it earlier/));
		expect(button(/^End date/)).toBeVisible();
		await user.click(choice(/^Now/));
		expect(screen.queryByRole("button", { name: /^End date/ })).toBeNull();
	});

	// AC-F05-47
	test("the later date starts a month from today, the earlier one at yesterday", async () => {
		const { user } = setup();
		await user.click(choice(/^On a later date/));
		expect(button(/^End date/)).toHaveTextContent("Wed, 2 Dec");
		await user.click(choice(/^I cancelled it earlier/));
		expect(button(/^End date/)).toHaveTextContent("Sun, 1 Nov");
	});

	test("shows the strip and what happens to the Subscription", async () => {
		setup();
		expect(
			await screen.findByRole("list", { name: "Charges around today" }),
		).toBeVisible();
		expect(
			screen.getByText("Netflix moves to Ended. You can resume it later."),
		).toBeVisible();
	});

	test("a later end says it shows Ends until then", async () => {
		const { user } = setup();
		await user.click(choice(/^After the next charge/));
		expect(
			screen.getByText(
				'Netflix shows "Ends 5 Nov 2026" until then, then moves to Ended.',
			),
		).toBeVisible();
	});

	// AC-F05-47
	test("Save rests until the charges have loaded", async () => {
		route(network, "get", "/api/transactions", async () => {
			await delay(80);
			return ok(listPage([]));
		});
		renderInApp(
			<CancelDialog
				isOpen
				item={NETFLIX}
				locale={IN}
				onClose={vi.fn()}
			/>,
		);
		resting("Cancel Netflix");
		await ready("Cancel Netflix");
	});

	test("failed charges say so with Retry, and Save stays resting until they load", async () => {
		let failing = true;
		route(network, "get", "/api/transactions", () =>
			failing ? refuse(500, "internal_error") : ok(listPage([])),
		);
		const user = userEvent.setup();
		renderInApp(
			<CancelDialog
				isOpen
				item={NETFLIX}
				locale={IN}
				onClose={vi.fn()}
			/>,
		);
		expect(
			await screen.findByText("Charges could not be loaded."),
		).toBeVisible();
		resting("Cancel Netflix");
		failing = false;
		await user.click(button("Retry"));
		await ready("Cancel Netflix");
		expect(screen.queryByText("Charges could not be loaded.")).toBeNull();
	});
});

describe("what it deletes (BR-F05-12)", () => {
	// A charge added by another device after the user's end date.
	const LATE = [...CHARGES, paid("2026-11-02")];

	// AC-F05-47
	test("names the charges after the end date and turns the button into Cancel and delete", async () => {
		const { user } = setup(NETFLIX, LATE);
		await ready("Cancel Netflix");
		await user.click(choice(/^I cancelled it earlier/));
		expect(
			await screen.findByText(
				"This also deletes 1 charge dated after 1 Nov 2026: 2 Nov, ₹649.00.",
			),
		).toBeVisible();
		expect(button("Cancel and delete 1 charge")).toBeVisible();
	});

	test("an edited charge stays, and says so", async () => {
		const { user } = setup(NETFLIX, [...CHARGES, paid("2026-11-02", true)]);
		await ready("Cancel Netflix");
		await user.click(choice(/^I cancelled it earlier/));
		expect(
			await screen.findByText("Charges you've edited stay (1)."),
		).toBeVisible();
		expect(screen.queryByText(/^This also deletes/)).toBeNull();
		expect(button("Cancel Netflix")).toBeVisible();
	});

	test("nothing to delete reads Cancel Netflix", async () => {
		setup();
		await ready("Cancel Netflix");
		expect(screen.queryByText(/^This also deletes/)).toBeNull();
	});
});

describe("saving (BR-F05-12, section 11)", () => {
	// AC-F05-47
	test("Now sends the end date of today at the version it opened with, then reports it and closes", async () => {
		const patches = route(network, "patch", PATCH, () => ok(SAVED()));
		const { user, onSaved, onClose } = setup();
		await ready("Cancel Netflix");
		await user.click(button("Cancel Netflix"));
		await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
		expect(patches).toHaveLength(1);
		expect(patches[0]?.body).toEqual({
			changedAt: expect.any(String),
			endDate: "2026-11-02",
		});
		expect(patches[0]?.headers.get("if-match")).toBe(`"${NETFLIX.version}"`);
		expect(isUuidV7(patches[0]?.headers.get("idempotency-key") ?? "")).toBe(
			true,
		);
		expect(onSaved).toHaveBeenCalledWith({
			kind: "cancel",
			before: expect.objectContaining({ version: NETFLIX.version }),
			saved: expect.objectContaining({ version: NETFLIX.version + 1 }),
			sent: { changedAt: expect.any(String), endDate: "2026-11-02" },
		});
	});

	test("After the next charge sends that date", async () => {
		const patches = route(network, "patch", PATCH, () => ok(SAVED()));
		const { user, onClose } = setup();
		await ready("Cancel Netflix");
		await user.click(choice(/^After the next charge/));
		await user.click(button("Cancel Netflix"));
		await waitFor(() => expect(onClose).toHaveBeenCalled());
		expect(patches[0]?.body).toMatchObject({ endDate: "2026-11-05" });
	});

	test("a later date sends the date it opened on", async () => {
		const patches = route(network, "patch", PATCH, () => ok(SAVED()));
		const { user, onClose } = setup();
		await ready("Cancel Netflix");
		await user.click(choice(/^On a later date/));
		await user.click(button("Cancel Netflix"));
		await waitFor(() => expect(onClose).toHaveBeenCalled());
		expect(patches[0]?.body).toMatchObject({ endDate: "2026-12-02" });
	});

	test("with charges to delete the write is the same and the button is the danger one", async () => {
		const patches = route(network, "patch", PATCH, () => ok(SAVED()));
		const { user, onClose } = setup(NETFLIX, [...CHARGES, paid("2026-11-02")]);
		await ready("Cancel Netflix");
		await user.click(choice(/^I cancelled it earlier/));
		await user.click(
			await screen.findByRole("button", {
				name: "Cancel and delete 1 charge",
			}),
		);
		await waitFor(() => expect(onClose).toHaveBeenCalled());
		expect(patches[0]?.body).toMatchObject({ endDate: "2026-11-01" });
	});

	// AC-F05-47
	test("an ending Subscription opens on its end date, and saving it unchanged only closes", async () => {
		const ending = subscriptionItem("netflix", {
			status: "ending",
			endDate: "2026-12-31",
		});
		const patches = route(network, "patch", PATCH, () => ok(SAVED()));
		const { user, onClose } = setup(ending);
		expect(choice(/^On a later date/)).toBeChecked();
		expect(button(/^End date/)).toHaveTextContent("31 Dec");
		await ready("Cancel Netflix");
		await user.click(button("Cancel Netflix"));
		expect(onClose).toHaveBeenCalledOnce();
		expect(patches).toHaveLength(0);
	});

	test("two presses send one request", async () => {
		const patches = route(network, "patch", PATCH, async () => {
			await delay(60);
			return ok(SAVED());
		});
		const { user, onClose } = setup();
		await ready("Cancel Netflix");
		await user.dblClick(button("Cancel Netflix"));
		await waitFor(() => expect(onClose).toHaveBeenCalled());
		expect(patches).toHaveLength(1);
	});

	test("the version is the one it opened with, whatever the page reads meanwhile", async () => {
		const patches = route(network, "patch", PATCH, () => ok(SAVED()));
		const { user, onClose, again } = setup();
		await ready("Cancel Netflix");
		again({
			item: subscriptionItem("netflix", { version: NETFLIX.version + 5 }),
		});
		await user.click(button("Cancel Netflix"));
		await waitFor(() => expect(onClose).toHaveBeenCalled());
		expect(patches[0]?.headers.get("if-match")).toBe(`"${NETFLIX.version}"`);
	});
});

describe("a refused Cancel keeps the dialog open (section 8)", () => {
	async function cancel() {
		const view = setup();
		await ready("Cancel Netflix");
		await view.user.click(button("Cancel Netflix"));
		return view;
	}

	test("a 422 puts its message under the date", async () => {
		route(network, "patch", PATCH, () =>
			refuse(422, "validation_failed", {
				message: "m",
				fields: { endDate: "The end date can't be before the start date." },
			}),
		);
		const { onClose, user } = setup();
		await ready("Cancel Netflix");
		await user.click(choice(/^On a later date/));
		await user.click(button("Cancel Netflix"));
		expect(
			await screen.findByText("The end date can't be before the start date."),
		).toBeVisible();
		expect(onClose).not.toHaveBeenCalled();
	});

	test("a failed request says it could not be saved", async () => {
		route(network, "patch", PATCH, () => refuse(500, "internal_error"));
		const { onClose } = await cancel();
		expect(
			await screen.findByText(/^The Subscription could not be saved\./),
		).toBeVisible();
		expect(onClose).not.toHaveBeenCalled();
	});

	test("a 404 says it was deleted on another device", async () => {
		route(network, "patch", PATCH, () =>
			refuse(404, "not_found", { message: "gone" }),
		);
		await cancel();
		expect(
			await screen.findByText(
				"This Subscription was deleted on another device.",
			),
		).toBeVisible();
	});

	// AC-F05-54
	test("a 409 opens the conflict view over the dialog, which stays", async () => {
		route(network, "patch", PATCH, () =>
			refuse(409, "version_conflict", {
				message: "m",
				details: {
					current: subscriptionAnswer("netflix", {
						version: 9,
						amountMinor: 79900,
					}),
				},
			}),
		);
		const { user, onSaved, onClose } = setup();
		await ready("Cancel Netflix");
		await user.click(button("Cancel Netflix"));
		expect(
			await screen.findByRole("dialog", {
				name: "This Subscription changed on another device",
			}),
		).toBeVisible();
		expect(screen.getByRole("button", { name: "Keep mine" })).toBeVisible();
		expect(screen.getByRole("button", { name: "Keep theirs" })).toBeVisible();
		// The saved amount shows on both sides: the change does not touch it, so it does not differ.
		expect(screen.getAllByText("₹799.00")).toHaveLength(2);
		expect(
			screen.getByText(
				"Keep mine saves your change to the Subscription as it is saved now.",
			),
		).toBeVisible();
		expect(onClose).not.toHaveBeenCalled();
		expect(onSaved).not.toHaveBeenCalled();
	});

	// AC-F05-54
	test("Keep mine sends the same change again at the saved version, with its first change time", async () => {
		let at = 0;
		const patches = route(network, "patch", PATCH, () =>
			++at === 1 ?
				refuse(409, "version_conflict", {
					message: "m",
					details: {
						current: subscriptionAnswer("netflix", { version: 9 }),
					},
				})
			:	ok(SAVED()),
		);
		const { user, onSaved, onClose } = setup();
		await ready("Cancel Netflix");
		await user.click(button("Cancel Netflix"));
		await user.click(await screen.findByRole("button", { name: "Keep mine" }));
		await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
		expect(patches).toHaveLength(2);
		expect(patches[1]?.headers.get("if-match")).toBe('"9"');
		expect(patches[1]?.body).toEqual(patches[0]?.body);
		expect(patches[1]?.headers.get("idempotency-key")).not.toBe(
			patches[0]?.headers.get("idempotency-key"),
		);
		// What Undo puts back is the Subscription as it was saved when Keep mine sent the change.
		expect(onSaved).toHaveBeenCalledWith(
			expect.objectContaining({
				kind: "cancel",
				before: expect.objectContaining({ version: 9 }),
			}),
		);
	});

	// AC-F05-54
	test("Keep theirs sends nothing and closes the dialog", async () => {
		const patches = route(network, "patch", PATCH, () =>
			refuse(409, "version_conflict", {
				message: "m",
				details: { current: subscriptionAnswer("netflix", { version: 9 }) },
			}),
		);
		const { user, onSaved, onClose } = setup();
		await ready("Cancel Netflix");
		await user.click(button("Cancel Netflix"));
		await user.click(await screen.findByRole("button", { name: "Keep theirs" }));
		await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
		expect(patches).toHaveLength(1);
		expect(onSaved).not.toHaveBeenCalled();
	});

	test("closing the view without a choice goes back to the dialog", async () => {
		route(network, "patch", PATCH, () =>
			refuse(409, "version_conflict", {
				message: "m",
				details: { current: subscriptionAnswer("netflix", { version: 9 }) },
			}),
		);
		const { user, onClose } = setup();
		await ready("Cancel Netflix");
		await user.click(button("Cancel Netflix"));
		await screen.findByRole("button", { name: "Keep mine" });
		await user.keyboard("{Escape}");
		await waitFor(() =>
			expect(screen.queryByRole("button", { name: "Keep mine" })).toBeNull(),
		);
		expect(onClose).not.toHaveBeenCalled();
	});
	test("changing the choice clears the message", async () => {
		route(network, "patch", PATCH, () => refuse(500, "internal_error"));
		const { user } = await cancel();
		await screen.findByText(/could not be saved/);
		await user.click(choice(/^After the next charge/));
		expect(screen.queryByText(/could not be saved/)).toBeNull();
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
		await user.click(button("Cancel Netflix"));
		resting("Cancel Netflix");
		expect(patches).toHaveLength(0);
	});
});

describe("closing", () => {
	test("Keep Netflix closes without a write", async () => {
		const patches = route(network, "patch", PATCH, () => ok({}));
		const { user, onClose } = setup();
		await user.click(button("Keep Netflix"));
		expect(onClose).toHaveBeenCalledOnce();
		expect(patches).toHaveLength(0);
	});

	test("Escape closes it", async () => {
		const { user, onClose } = setup();
		await user.keyboard("{Escape}");
		expect(onClose).toHaveBeenCalledOnce();
	});

	test("a closed dialog shows nothing", () => {
		setup(NETFLIX, CHARGES, { isOpen: false });
		expect(screen.queryByRole("dialog")).toBeNull();
	});
});
