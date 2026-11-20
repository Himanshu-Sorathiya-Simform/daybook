import { describe, expect, test } from "vitest";

import {
	CANCEL_TEXT,
	cancelEnd,
	cancelOptions,
	cancelRange,
	cancelStart,
	cancelView,
	type CancelValues,
} from "../cancel";
import type { SubscriptionItem, SubscriptionsLocale } from "../types";
import { charge, subscriptionItem } from "./fixtures";

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
const NOW = "2026-11-02T06:30:00.000Z";

const paid = (item: SubscriptionItem, dueOn: string, edited = false) =>
	charge({
		subscriptionId: item.id,
		dueOn,
		occurredOn: dueOn,
		amountMinor: item.amountMinor,
		edited,
	});
const CHARGES = [paid(NETFLIX, "2026-09-05"), paid(NETFLIX, "2026-10-05")];

const view = (
	over: Partial<CancelValues> = {},
	item: SubscriptionItem = NETFLIX,
	charges = CHARGES,
) =>
	cancelView({
		item,
		values: { ...cancelStart(item, IN.today), ...over },
		charges,
		locale: IN,
		changedAt: NOW,
	});

describe("what Cancel opens with (BR-F05-41)", () => {
	test("Now, a month from today for a later date, yesterday for an earlier one", () => {
		expect(cancelStart(NETFLIX, "2026-11-02")).toEqual({
			choice: "now",
			later: "2026-12-02",
			earlier: "2026-11-01",
		});
	});

	test("an ending Subscription opens on a later date at its stored end date", () => {
		const ending = subscriptionItem("netflix", {
			status: "ending",
			endDate: "2026-12-31",
		});
		expect(cancelStart(ending, "2026-11-02")).toMatchObject({
			choice: "later",
			later: "2026-12-31",
		});
	});

	test("an ended Subscription, whose end date is set, still opens on Now", () => {
		const ended = subscriptionItem("netflix", {
			status: "ended",
			endDate: "2026-09-30",
		});
		expect(cancelStart(ended, "2026-11-02").choice).toBe("now");
	});

	test("a month from the 31st clamps", () => {
		expect(cancelStart(NETFLIX, "2026-01-31").later).toBe("2026-02-28");
	});
});

describe("the dates a choice may take (BR-F05-41)", () => {
	test("a later end runs from tomorrow to 10 years ahead", () => {
		expect(cancelRange(NETFLIX, "2026-11-02").later).toEqual({
			min: "2026-11-03",
			max: "2036-11-02",
		});
	});

	test("an earlier end runs from the start date to yesterday", () => {
		expect(cancelRange(NETFLIX, "2026-11-02").earlier).toEqual({
			min: "2026-09-05",
			max: "2026-11-01",
		});
	});
});

describe("the choices (BR-F05-41)", () => {
	const labels = (item = NETFLIX) =>
		cancelOptions(item, IN).map((option) => option.label);

	test("Now, After the next charge, On a later date and I cancelled it earlier, in order", () => {
		expect(labels()).toEqual([
			"Now",
			"After the next charge",
			"On a later date",
			"I cancelled it earlier",
		]);
	});

	test("each is described", () => {
		const found = cancelOptions(NETFLIX, IN);
		expect(found.map((option) => option.description)).toEqual([
			"Ends today, 2 Nov. No more charges.",
			"Ends 5 Nov. One more ₹649.00.",
			"Charges continue until then.",
			"For when Daybook kept adding charges after you'd cancelled.",
		]);
	});

	test("After the next charge needs a next due date", () => {
		expect(
			labels(subscriptionItem("netflix", { nextDueOn: null })),
		).not.toContain("After the next charge");
	});

	test("I cancelled it earlier needs a start before today", () => {
		expect(
			labels(subscriptionItem("netflix", { startDate: "2026-11-02" })),
		).not.toContain("I cancelled it earlier");
		expect(
			labels(subscriptionItem("netflix", { startDate: "2026-11-01" })),
		).toContain("I cancelled it earlier");
	});
});

describe("the end date a choice makes (BR-F05-12)", () => {
	const end = (over: Partial<CancelValues>, item = NETFLIX) =>
		cancelEnd({ ...cancelStart(item, IN.today), ...over }, item, IN.today);

	test("Now is today", () => expect(end({ choice: "now" })).toBe("2026-11-02"));
	test("After the next charge is the next due date", () =>
		expect(end({ choice: "next" })).toBe("2026-11-05"));
	test("a later date is the date given", () =>
		expect(end({ choice: "later", later: "2027-03-01" })).toBe("2027-03-01"));
	test("an earlier date is the date given", () =>
		expect(end({ choice: "earlier", earlier: "2026-09-30" })).toBe(
			"2026-09-30",
		));
	test("with no next due date After the next charge falls back to today", () => {
		expect(
			end(
				{ choice: "next" },
				subscriptionItem("netflix", { nextDueOn: null }),
			),
		).toBe("2026-11-02");
	});
});

describe("Now (BR-F05-41)", () => {
	// AC-F05-47
	test("deletes nothing, ends today and moves to Ended", () => {
		const found = view();
		expect(found.endDate).toBe("2026-11-02");
		expect(found.deleted).toBe(0);
		expect(found.deletionLine).toBeNull();
		expect(found.editedLine).toBeNull();
		expect(found.endingLine).toBe(
			"Netflix moves to Ended. You can resume it later.",
		);
		expect(found.body).toEqual({ changedAt: NOW, endDate: "2026-11-02" });
	});

	test("the strip is the last charge kept, today, and the first date after with no charges", () => {
		expect(view().strip).toEqual([
			{ kind: "kept", label: "5 Oct", amount: "₹649.00", note: "kept" },
			{ kind: "today", label: "Today" },
			{ kind: "kept", label: "5 Nov on", note: "no charges" },
		]);
	});
});

describe("After the next charge (BR-F05-41)", () => {
	test("keeps charging until that date, whose charge is the last", () => {
		const found = view({ choice: "next" });
		expect(found.endDate).toBe("2026-11-05");
		expect(found.strip).toEqual([
			{ kind: "kept", label: "5 Oct", amount: "₹649.00", note: "kept" },
			{ kind: "today", label: "Today" },
			{ kind: "new", label: "5 Nov", amount: "₹649.00", note: "last" },
			{ kind: "kept", label: "5 Dec on", note: "no charges" },
		]);
		expect(found.endingLine).toBe(
			'Netflix shows "Ends 5 Nov 2026" until then, then moves to Ended.',
		);
	});
});

describe("On a later date (BR-F05-41)", () => {
	test("shows two charges still to come, the final one marked last", () => {
		const found = view({ choice: "later", later: "2026-12-31" });
		expect(found.strip.filter((cell) => cell.kind === "new")).toEqual([
			{ kind: "new", label: "5 Nov", amount: "₹649.00" },
			{ kind: "new", label: "5 Dec", amount: "₹649.00", note: "last" },
		]);
	});

	test("with more than two to come, none of the two shown is last", () => {
		const found = view({ choice: "later", later: "2027-03-31" });
		const coming = found.strip.filter((cell) => cell.kind === "new");
		expect(coming).toHaveLength(2);
		expect(coming.some((cell) => cell.note === "last")).toBe(false);
	});

	test("a date skipped on the way is not a charge to come", () => {
		const skipped = subscriptionItem("netflix", { skips: ["2026-11-05"] });
		const found = view({ choice: "next" }, skipped);
		expect(found.strip.some((cell) => cell.kind === "new")).toBe(false);
	});

	test("a paused date is not a charge to come", () => {
		const paused = subscriptionItem("netflix", {
			pause: { from: "2026-11-05", until: "2026-12-05" },
			status: "paused",
		});
		const found = view({ choice: "later", later: "2026-12-31" }, paused);
		expect(
			found.strip
				.filter((cell) => cell.kind === "new")
				.map((cell) => cell.label),
		).toEqual(["5 Dec"]);
	});

	test("an ending Subscription's own date is no change and has no write", () => {
		const ending = subscriptionItem("netflix", {
			status: "ending",
			endDate: "2026-12-31",
		});
		expect(view({}, ending).body).toBeNull();
	});

	test("another date for an ending Subscription is a write", () => {
		const ending = subscriptionItem("netflix", {
			status: "ending",
			endDate: "2026-12-31",
		});
		expect(view({ later: "2027-02-01" }, ending).body).toEqual({
			changedAt: NOW,
			endDate: "2027-02-01",
		});
	});
});

describe("I cancelled it earlier (BR-F05-12, BR-F05-41)", () => {
	// AC-F05-47
	test("names the unedited charges after the end date and deletes them", () => {
		const found = view({ choice: "earlier", earlier: "2026-09-30" });
		expect(found.deleted).toBe(1);
		expect(found.deletionLine).toBe(
			"This also deletes 1 charge dated after 30 Sept 2026: 5 Oct, ₹649.00.",
		);
		expect(found.strip.slice(0, 3)).toEqual([
			{ kind: "kept", label: "5 Sept", amount: "₹649.00", note: "kept" },
			{
				kind: "off",
				label: "5 Oct",
				amount: "₹649.00",
				note: "deleted",
				warn: true,
			},
			{ kind: "today", label: "Today" },
		]);
		expect(found.body).toEqual({ changedAt: NOW, endDate: "2026-09-30" });
	});

	test("an edited charge after the date stays, and says so", () => {
		const edited = [
			paid(NETFLIX, "2026-09-05"),
			paid(NETFLIX, "2026-10-05", true),
		];
		const found = view(
			{ choice: "earlier", earlier: "2026-09-30" },
			NETFLIX,
			edited,
		);
		expect(found.deleted).toBe(0);
		expect(found.deletionLine).toBeNull();
		expect(found.editedLine).toBe("Charges you've edited stay (1).");
	});

	test("with both, the deletion is named and the edited ones counted", () => {
		const mixed = [
			paid(NETFLIX, "2026-09-05"),
			paid(NETFLIX, "2026-10-05", true),
			paid(NETFLIX, "2026-11-01"),
		];
		const found = view(
			{ choice: "earlier", earlier: "2026-09-30" },
			NETFLIX,
			mixed,
		);
		expect(found.deleted).toBe(1);
		expect(found.editedLine).toBe("Charges you've edited stay (1).");
	});

	test("names up to three, then and N more", () => {
		const many = [
			paid(NETFLIX, "2026-06-05"),
			paid(NETFLIX, "2026-07-05"),
			paid(NETFLIX, "2026-08-05"),
			paid(NETFLIX, "2026-09-05"),
			paid(NETFLIX, "2026-10-05"),
		];
		const started = subscriptionItem("netflix", { startDate: "2026-06-05" });
		const found = view(
			{ choice: "earlier", earlier: "2026-06-30" },
			started,
			many,
		);
		expect(found.deleted).toBe(4);
		expect(found.deletionLine).toBe(
			"This also deletes 4 charges dated after 30 Jun 2026: 5 Jul, ₹649.00; 5 Aug, ₹649.00; 5 Sept, ₹649.00 and 1 more.",
		);
	});

	test("three exactly has no and more", () => {
		const three = [
			paid(NETFLIX, "2026-07-05"),
			paid(NETFLIX, "2026-08-05"),
			paid(NETFLIX, "2026-09-05"),
		];
		const found = view(
			{ choice: "earlier", earlier: "2026-06-30" },
			NETFLIX,
			three,
		);
		expect(found.deletionLine).not.toContain("more");
	});

	test("shows at most two deleted charges in the strip, oldest first", () => {
		const three = [
			paid(NETFLIX, "2026-09-05"),
			paid(NETFLIX, "2026-10-05"),
			paid(NETFLIX, "2026-11-01"),
		];
		const found = view(
			{ choice: "earlier", earlier: "2026-08-31" },
			NETFLIX,
			three,
		);
		expect(
			found.strip
				.filter((cell) => cell.note === "deleted")
				.map((cell) => cell.label),
		).toEqual(["5 Sept", "5 Oct"]);
	});

	test("an ending line for a past end says it moves to Ended", () => {
		expect(view({ choice: "earlier", earlier: "2026-09-30" }).endingLine).toBe(
			"Netflix moves to Ended. You can resume it later.",
		);
	});

	test("a Subscription with no charge has nothing kept or deleted", () => {
		const found = view({ choice: "earlier" }, NETFLIX, []);
		expect(found.strip[0]).toEqual({ kind: "today", label: "Today" });
		expect(found.deleted).toBe(0);
	});
});

describe("the dialog's words (BR-F05-41)", () => {
	test("the title and buttons name the Subscription", () => {
		expect(CANCEL_TEXT.title("Netflix")).toBe("Cancel Netflix?");
		expect(CANCEL_TEXT.keep("Netflix")).toBe("Keep Netflix");
		expect(CANCEL_TEXT.cancel("Netflix")).toBe("Cancel Netflix");
	});

	test("the delete button counts the charges", () => {
		expect(CANCEL_TEXT.cancelAndDelete(1)).toBe("Cancel and delete 1 charge");
		expect(CANCEL_TEXT.cancelAndDelete(3)).toBe("Cancel and delete 3 charges");
	});
});
