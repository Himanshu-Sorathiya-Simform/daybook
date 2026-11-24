import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { delay } from "msw";
import { describe, expect, test, vi } from "vitest";

import { renderInApp } from "@/components/app/__tests__/helpers";
import { isUuidV7 } from "@/lib/ids";
import { ok, refuse, route, testNetwork } from "../../hooks/__tests__/helpers";
import {
	subscriptionAnswer,
	subscriptionItem,
	IN_LOCALE as IN,
	changedAnswer,
} from "../../lib/__tests__/fixtures";
import type { SubscriptionItem } from "../../lib/types";
import { PauseDialog, type PauseDialogProps } from "../PauseDialog";
import {
	conflictTests,
	offlineAndClosingTests,
	type WriteDialogHarness,
} from "./writeDialogSuites";

const network = testNetwork({ restoreMocks: true });

const NETFLIX = subscriptionItem("netflix");
const PATCH = `/api/subscriptions/${NETFLIX.id}`;
const SAVED = () =>
	changedAnswer(subscriptionAnswer("netflix", { version: NETFLIX.version + 1 }));
const FUTURE = subscriptionItem("netflix", {
	status: "paused",
	pause: { from: "2026-11-05", until: "2027-01-05" },
});
const INFORCE = subscriptionItem("netflix", {
	status: "paused",
	pause: { from: "2026-10-05", until: "2027-01-05" },
	nextDueOn: "2027-01-05",
});
const ENDING = subscriptionItem("netflix", {
	status: "ending",
	endDate: "2026-12-31",
});

function setup(
	item: SubscriptionItem = NETFLIX,
	props: Partial<PauseDialogProps> = {},
) {
	const handlers = { onClose: vi.fn(), onSaved: vi.fn() };
	renderInApp(
		<PauseDialog
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
const choice = (name: string | RegExp) => screen.getByRole("radio", { name });

const HARNESS: WriteDialogHarness = {
	network,
	patch: PATCH,
	kind: "pause",
	confirm: "Pause until 5 Jan 2027",
	dismiss: "Not now",
	setup: () => setup(),
	press: (user) => user.click(button("Pause until 5 Jan 2027")),
};

describe("Pause Netflix (BR-F05-43)", () => {
	// AC-F05-49
	test("is named Pause Netflix and offers Skip with its four choices, 2 charges chosen", () => {
		setup();
		expect(screen.getByRole("dialog")).toHaveAccessibleName("Pause Netflix");
		const group = screen.getByRole("radiogroup", { name: "Skip" });
		expect(
			within(group)
				.getAllByRole("radio")
				.map((radio) => radio.textContent),
		).toEqual(["The next charge", "2 charges", "3 charges", "Until a date"]);
		expect(
			within(group).getByRole("radio", { checked: true }),
		).toHaveAccessibleName("2 charges");
	});

	test("shows the strip, what happens, and that it still counts in the cost", () => {
		setup();
		const strip = screen.getByRole("list", { name: "Charges around today" });
		expect(within(strip).getAllByText("paused")).toHaveLength(2);
		expect(within(strip).getByText("resumes")).toBeVisible();
		expect(
			screen.getByText(
				"Nothing is added while it's paused. Charges resume on Tue, 5 Jan, 2027 at ₹649.00, without you doing anything.",
			),
		).toBeVisible();
		expect(
			screen.getByText(
				"Netflix still counts in your monthly cost while it's paused. Paused charges are left out of the next 30 days.",
			),
		).toBeVisible();
	});

	test("the button names the day it resumes", () => {
		setup();
		expect(button("Pause until 5 Jan 2027")).toBeVisible();
	});

	// AC-F05-49
	test("choosing The next charge changes the strip and the button", async () => {
		const { user } = setup();
		await user.click(choice("The next charge"));
		expect(button("Pause until 5 Dec 2026")).toBeVisible();
		expect(
			within(
				screen.getByRole("list", { name: "Charges around today" }),
			).getAllByText("paused"),
		).toHaveLength(1);
	});

	test("Until a date shows a date box starting 2 months after the first date", async () => {
		const { user } = setup();
		expect(screen.queryByRole("button", { name: /^Until/ })).toBeNull();
		await user.click(choice("Until a date"));
		expect(button(/^Until/)).toHaveTextContent("Tue, 5 Jan, 2027");
	});

	// AC-F05-49
	test("a count with no date to end on is disabled", () => {
		setup(ENDING);
		expect(choice("2 charges")).toBeDisabled();
		expect(choice("3 charges")).toBeDisabled();
		expect(choice("The next charge")).toBeEnabled();
		expect(
			within(screen.getByRole("radiogroup", { name: "Skip" })).getByRole(
				"radio",
				{
					checked: true,
				},
			),
		).toHaveAccessibleName("The next charge");
	});

	test("with no charge after the pause there is no resume date and the button reads Pause", async () => {
		const { user } = setup(ENDING);
		await user.click(choice("Until a date"));
		expect(button("Pause")).toBeVisible();
		expect(
			screen.getByText("Nothing is added while it's paused."),
		).toBeVisible();
	});

	test("the arrow keys move between the choices and Space chooses", async () => {
		const { user } = setup();
		choice("The next charge").focus();
		await user.keyboard("{ArrowRight}{ArrowRight}{ArrowRight} ");
		expect(choice("Until a date")).toBeChecked();
	});
});

describe("Change pause (BR-F05-43)", () => {
	// AC-F05-49
	test("one not yet started opens on the date, at its own until, with every choice", () => {
		setup(FUTURE);
		expect(choice("Until a date")).toBeChecked();
		expect(choice("2 charges")).toBeVisible();
		expect(button(/^Until/)).toHaveTextContent("Tue, 5 Jan, 2027");
	});

	// AC-F05-49
	test("one in force offers only the date", () => {
		setup(INFORCE);
		expect(
			within(screen.getByRole("radiogroup", { name: "Skip" })).getAllByRole(
				"radio",
			),
		).toHaveLength(1);
		expect(choice("Until a date")).toBeChecked();
	});

	// AC-F05-49
	test("the pause as it is stored is no change, so the button rests and nothing is sent", async () => {
		const patches = route(network, "patch", PATCH, () => ok(SAVED()));
		const { user } = setup(INFORCE);
		const save = screen
			.getAllByRole("button")
			.find((each) => /^Pause/.test(each.textContent ?? ""));
		expect(save).toHaveAttribute("aria-disabled", "true");
		await user.click(save!);
		expect(patches).toHaveLength(0);
	});

	test("choosing another count on a pause not yet started replaces it", async () => {
		const patches = route(network, "patch", PATCH, () => ok(SAVED()));
		const { user, onClose } = setup(FUTURE);
		await user.click(choice("The next charge"));
		await user.click(button(/^Pause until/));
		await waitFor(() => expect(onClose).toHaveBeenCalled());
		expect(patches[0]?.body).toEqual({
			changedAt: expect.any(String),
			pause: { from: "2026-11-05", until: "2026-12-05" },
		});
	});
});

describe("saving (BR-F05-29, section 11)", () => {
	// AC-F05-49
	test("2 charges sends the pause at the version it opened with, then reports it and closes", async () => {
		const patches = route(network, "patch", PATCH, () => ok(SAVED()));
		const { user, onSaved, onClose } = setup();
		await user.click(button("Pause until 5 Jan 2027"));
		await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
		expect(patches).toHaveLength(1);
		expect(patches[0]?.body).toEqual({
			changedAt: expect.any(String),
			pause: { from: "2026-11-05", until: "2027-01-05" },
		});
		expect(patches[0]?.headers.get("if-match")).toBe(`"${NETFLIX.version}"`);
		expect(isUuidV7(patches[0]?.headers.get("idempotency-key") ?? "")).toBe(
			true,
		);
		expect(onSaved).toHaveBeenCalledWith({
			kind: "pause",
			before: expect.objectContaining({ version: NETFLIX.version }),
			saved: expect.objectContaining({ version: NETFLIX.version + 1 }),
			sent: {
				changedAt: expect.any(String),
				pause: { from: "2026-11-05", until: "2027-01-05" },
			},
		});
	});

	// AC-F05-49
	test("the next charge pauses one date", async () => {
		const patches = route(network, "patch", PATCH, () => ok(SAVED()));
		const { user, onClose } = setup();
		await user.click(choice("The next charge"));
		await user.click(button("Pause until 5 Dec 2026"));
		await waitFor(() => expect(onClose).toHaveBeenCalled());
		expect(patches[0]?.body).toMatchObject({
			pause: { from: "2026-11-05", until: "2026-12-05" },
		});
	});

	test("two presses send one request", async () => {
		const patches = route(network, "patch", PATCH, async () => {
			await delay(60);
			return ok(SAVED());
		});
		const { user, onClose } = setup();
		await user.dblClick(button("Pause until 5 Jan 2027"));
		await waitFor(() => expect(onClose).toHaveBeenCalled());
		expect(patches).toHaveLength(1);
	});

	test("the version is the one it opened with", async () => {
		const patches = route(network, "patch", PATCH, () => ok(SAVED()));
		const { user, onClose } = setup();
		await user.click(button("Pause until 5 Jan 2027"));
		await waitFor(() => expect(onClose).toHaveBeenCalled());
		expect(patches[0]?.headers.get("if-match")).toBe(`"${NETFLIX.version}"`);
	});
});

describe("a refused Pause keeps the dialog open (section 8)", () => {
	test("a 422 puts its message under the date", async () => {
		route(network, "patch", PATCH, () =>
			refuse(422, "validation_failed", {
				message: "m",
				fields: { "pause.until": "Choose a date up to 2 Nov 2028." },
			}),
		);
		const { user, onClose } = setup();
		await user.click(choice("Until a date"));
		await user.click(button(/^Pause until/));
		expect(
			await screen.findByText("Choose a date up to 2 Nov 2028."),
		).toBeVisible();
		expect(onClose).not.toHaveBeenCalled();
	});

	test("a failed request says it could not be saved", async () => {
		route(network, "patch", PATCH, () => refuse(500, "internal_error"));
		const { user, onClose } = setup();
		await user.click(button("Pause until 5 Jan 2027"));
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
		await user.click(button("Pause until 5 Jan 2027"));
		expect(
			await screen.findByText(
				"This Subscription was deleted on another device.",
			),
		).toBeVisible();
	});

	conflictTests(HARNESS);
	test("choosing another count clears the message", async () => {
		route(network, "patch", PATCH, () => refuse(500, "internal_error"));
		const { user } = setup();
		await user.click(button("Pause until 5 Jan 2027"));
		await screen.findByText(/could not be saved/);
		await user.click(choice("The next charge"));
		expect(screen.queryByText(/could not be saved/)).toBeNull();
	});
});

offlineAndClosingTests(HARNESS);
