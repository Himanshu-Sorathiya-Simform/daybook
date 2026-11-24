import { describe, expect, test } from "vitest";

import { GOLDEN_SUBSCRIPTIONS } from "../../../../../seed/golden";
import type { Formats } from "../labels";
import {
	categoryCosts,
	chargeTimeline,
	detailLine,
	expectedLines,
	firstLines,
	keysHint,
	PANEL_TEXT,
	paidSummary,
	panelActions,
	statusBox,
	TIMELINE_PREVIEW,
	timelineToggle,
} from "../panel";
import type { SubscriptionList } from "../types";
import { charge, subscriptionItem } from "./fixtures";

const F: Formats = {
	currency: "INR",
	numberLocale: "en-IN",
	dateLocale: "en-IN",
	today: "2026-11-02",
};

const GOLDEN_LIST = (): Pick<SubscriptionList, "items" | "totals"> => ({
	items: [
		subscriptionItem("netflix"),
		subscriptionItem("amazonPrime"),
		subscriptionItem("sunrise"),
		subscriptionItem("cultGym"),
	],
	totals: { monthlyMinor: 2027392, yearlyMinor: 24328700, count: 4 },
});

/** A linked charge due on `dueOn`, as the Subscription's own list gives it. */
const paid = (
	name: keyof typeof GOLDEN_SUBSCRIPTIONS,
	dueOn: string,
	amountMinor: number,
	changes: Parameters<typeof charge>[0] = {},
) =>
	charge({
		subscriptionId: GOLDEN_SUBSCRIPTIONS[name].id,
		dueOn,
		occurredOn: dueOn,
		amountMinor,
		...changes,
	});

const dates = (lines: { dateText: string }[]) => lines.map((line) => line.dateText);
const kinds = (lines: { kind: string }[]) => lines.map((line) => line.kind);

describe("PANEL_TEXT (BR-F05-40)", () => {
	test("the summary's words", () => {
		expect(PANEL_TEXT.summaryTitle).toBe("Your Subscriptions");
		expect(PANEL_TEXT.summarySubtitle).toBe("Monthly cost by category");
		expect(PANEL_TEXT.howTitle).toBe("How charges work");
		expect(PANEL_TEXT.how).toEqual([
			"Daybook adds each charge to Transactions as an expense on its due date. Future charges aren't added until they're due.",
			"Deleting a charge in Transactions skips it. Daybook won't add it again.",
			"Cancelling or deleting a Subscription keeps the charges that already happened.",
		]);
		expect(PANEL_TEXT.selectHint).toBe(
			"Select a Subscription to see its charges. Up and down arrows move.",
		);
	});

	test("the detail's words", () => {
		expect(PANEL_TEXT.label).toBe("Subscription");
		expect(PANEL_TEXT.close).toBe("Close details");
		expect(PANEL_TEXT.charges).toBe("Charges");
		expect(PANEL_TEXT.noCharges).toBe("No charges yet.");
		expect(PANEL_TEXT.note).toBe("Note");
		expect(PANEL_TEXT.addNote).toBe("Add a note");
	});
});

describe("categoryCosts (BR-F05-40)", () => {
	// AC-F05-37
	test("golden: Housing, Health and Entertainment, largest first, with their shares", () => {
		const rows = categoryCosts(GOLDEN_LIST(), F);
		expect(rows.map((row) => row.label)).toEqual([
			"Housing",
			"Health",
			"Entertainment",
		]);
		expect(rows.map((row) => row.monthly)).toEqual([
			"₹18,000.00",
			"₹1,500.00",
			"₹773.92",
		]);
		expect(rows.map((row) => row.share)).toEqual(["88.8%", "7.4%", "3.8%"]);
		expect(rows.map((row) => row.shareTenths)).toEqual([888, 74, 38]);
		expect(rows.map((row) => row.category)).toEqual([
			"housing",
			"health",
			"entertainment",
		]);
	});

	test("the shares add up to 100.0", () => {
		const rows = categoryCosts(GOLDEN_LIST(), F);
		expect(rows.reduce((sum, row) => sum + row.shareTenths, 0)).toBe(1000);
	});

	test("a category's costs are added before they are divided by 12, and rounded once (MON-7)", () => {
		// Netflix 7,788.00 a year plus Amazon Prime 1,499.00 is 9,287.00, ÷ 12 = 773.9166….
		const entertainment = categoryCosts(GOLDEN_LIST(), F).find(
			(row) => row.category === "entertainment",
		)!;
		expect(entertainment.yearlyMinor).toBe(928700);
		expect(entertainment.monthlyMinor).toBe(77392);
		// Two monthly figures rounded first would give 649.00 + 124.92 = 773.92 here too, so a
		// pair that differs: 1,000.00 and 2,000.00 every 7 months, 142.857… + 285.714….
	});

	test("two custom cadences sum unrounded: 142.857 + 285.714 is 428.57, not 142.86 + 285.71", () => {
		const list = {
			items: [
				subscriptionItem("netflix", {
					amountMinor: 100000,
					cadence: { unit: "month", every: 7 },
					category: "health",
				}),
				subscriptionItem("cultGym", {
					amountMinor: 200000,
					cadence: { unit: "month", every: 7 },
					category: "health",
				}),
			],
			totals: { monthlyMinor: 42857, yearlyMinor: 514286, count: 2 },
		};
		const [row] = categoryCosts(list, F);
		expect(row).toMatchObject({ monthlyMinor: 42857, yearlyMinor: 514286 });
		expect(row!.monthly).toBe("₹428.57");
	});

	test("an ended Subscription and one with no next due date are left out, as the totals leave them out", () => {
		const list = GOLDEN_LIST();
		list.items.push(
			subscriptionItem("netflix", {
				id: "ended",
				category: "travel",
				status: "ended",
				nextDueOn: null,
			}),
			subscriptionItem("netflix", {
				id: "quiet",
				category: "education",
				nextDueOn: null,
			}),
		);
		expect(categoryCosts(list, F).map((row) => row.category)).not.toContain(
			"travel",
		);
		expect(categoryCosts(list, F).map((row) => row.category)).not.toContain(
			"education",
		);
	});

	test("an ended Subscription is left out whatever its next due date says, as a list read before midnight may hold one", () => {
		const list = GOLDEN_LIST();
		list.items.push(
			subscriptionItem("netflix", {
				id: "stale",
				category: "travel",
				status: "ended",
				nextDueOn: "2026-11-05",
			}),
		);
		expect(categoryCosts(list, F).map((row) => row.category)).not.toContain(
			"travel",
		);
	});

	test("a paused Subscription with a next due date counts", () => {
		const list = GOLDEN_LIST();
		list.items.push(
			subscriptionItem("netflix", {
				id: "held",
				category: "travel",
				status: "paused",
				nextDueOn: "2027-01-05",
			}),
		);
		expect(categoryCosts(list, F).map((row) => row.category)).toContain(
			"travel",
		);
	});

	test("categories with equal costs sort by label", () => {
		const list = {
			items: [
				subscriptionItem("netflix", { id: "a", category: "travel" }),
				subscriptionItem("netflix", { id: "b", category: "education" }),
				subscriptionItem("netflix", { id: "c", category: "food" }),
			],
			totals: { monthlyMinor: 194700, yearlyMinor: 2336400, count: 3 },
		};
		expect(categoryCosts(list, F).map((row) => row.label)).toEqual([
			"Education",
			"Food",
			"Travel",
		]);
	});

	test("no Subscription, no category", () => {
		expect(
			categoryCosts(
				{ items: [], totals: { monthlyMinor: 0, yearlyMinor: 0, count: 0 } },
				F,
			),
		).toEqual([]);
	});

	test("with no yearly total the shares read — and divide by nothing", () => {
		const [row] = categoryCosts(
			{
				items: [subscriptionItem("netflix")],
				totals: { monthlyMinor: 0, yearlyMinor: 0, count: 1 },
			},
			F,
		);
		expect(row).toMatchObject({ share: "—", shareTenths: 0 });
	});

	test("the figures follow the profile's format", () => {
		const us: Formats = {
			currency: "USD",
			numberLocale: "en-US",
			dateLocale: "en-US",
			today: "2026-11-02",
		};
		expect(categoryCosts(GOLDEN_LIST(), us)[0]!.monthly).toBe("$18,000.00");
	});
});

describe("detailLine (BR-F05-40)", () => {
	test("a monthly Subscription reads its schedule, its start and its yearly cost", () => {
		expect(detailLine(subscriptionItem("netflix"), F)).toBe(
			"Every month on the 5th, since 5 Sept 2026 · ₹7,788.00 a year",
		);
	});

	test("another cadence adds its monthly equivalent", () => {
		expect(detailLine(subscriptionItem("amazonPrime"), F)).toBe(
			"Every year on 12 Oct, since 12 Oct 2026 · ₹1,499.00 a year · ≈ ₹124.92 a month",
		);
	});

	test("a weekly one names its weekday", () => {
		expect(
			detailLine(
				subscriptionItem("netflix", {
					cadence: { unit: "week", every: 2 },
					startDate: "2026-11-05",
					yearlyMinor: 624000,
					monthlyMinor: 52000,
				}),
				F,
			),
		).toBe(
			"Every 2 weeks on Thursday, since 5 Nov 2026 · ₹6,240.00 a year · ≈ ₹520.00 a month",
		);
	});
});

describe("statusBox (BR-F05-40)", () => {
	const item = (changes: Parameters<typeof subscriptionItem>[1]) =>
		subscriptionItem("netflix", changes);

	// AC-F05-37
	test("an active Subscription reads its next charge, with Skip this one", () => {
		const box = statusBox(item({}), F);
		expect(box.text).toBe("Next charge Thu, 5 Nov, in 3 days.");
		expect(box.actions).toEqual(["skip"]);
		expect(box.segments).toEqual([
			{ text: "Next charge " },
			{ text: "Thu, 5 Nov", strong: true },
			{ text: ", in 3 days." },
		]);
	});

	test("an active Subscription says nothing of an end date it is given", () => {
		const box = statusBox(item({ endDate: "2026-12-31" }), F);
		expect(box.text).toBe("Next charge Thu, 5 Nov, in 3 days.");
	});

	test("an ending Subscription adds when it ends", () => {
		const box = statusBox(item({ status: "ending", endDate: "2026-12-31" }), F);
		expect(box.text).toBe(
			"Next charge Thu, 5 Nov, in 3 days. Ends 31 Dec 2026.",
		);
		expect(box.actions).toEqual(["skip"]);
	});

	test("a next charge in another year keeps its weekday and adds the year", () => {
		expect(statusBox(subscriptionItem("amazonPrime"), F).text).toBe(
			"Next charge Tue, 12 Oct, 2027, in 11 months.",
		);
	});

	test("a charge due today reads today", () => {
		expect(statusBox(item({ nextDueOn: "2026-11-02" }), F).text).toBe(
			"Next charge Mon, 2 Nov, today.",
		);
	});

	test("a paused Subscription reads when it resumes, with Resume now and Change", () => {
		const box = statusBox(
			item({ status: "paused", nextDueOn: "2027-01-05" }),
			F,
		);
		expect(box.text).toBe("Paused. Resumes Tue, 5 Jan, 2027.");
		expect(box.actions).toEqual(["resumeNow", "change"]);
		expect(box.segments[2]).toEqual({ text: "Tue, 5 Jan, 2027", strong: true });
	});

	test("a paused Subscription with no next due date reads only Paused.", () => {
		const box = statusBox(item({ status: "paused", nextDueOn: null }), F);
		expect(box.text).toBe("Paused.");
		expect(box.actions).toEqual(["resumeNow", "change"]);
	});

	test("an upcoming Subscription reads when it starts, with no action", () => {
		const box = statusBox(
			item({
				status: "upcoming",
				startDate: "2026-12-05",
				nextDueOn: "2026-12-05",
			}),
			F,
		);
		expect(box.text).toBe("Starts Sat, 5 Dec, in 33 days.");
		expect(box.actions).toEqual([]);
	});

	test("an ended Subscription reads when it ended, with Resume", () => {
		const box = statusBox(
			item({ status: "ended", endDate: "2026-09-30", nextDueOn: null }),
			F,
		);
		expect(box.text).toBe("Ended 30 Sept 2026.");
		expect(box.actions).toEqual(["resume"]);
	});

	test("an ended Subscription with no end date reads Ended.", () => {
		expect(
			statusBox(item({ status: "ended", endDate: null, nextDueOn: null }), F)
				.text,
		).toBe("Ended.");
	});

	test("a Subscription with no more charges reads when it ends, with Resume", () => {
		const box = statusBox(
			item({ status: "ending", endDate: "2026-12-31", nextDueOn: null }),
			F,
		);
		expect(box.text).toBe("No more charges. Ends 31 Dec 2026.");
		expect(box.actions).toEqual(["resume"]);
	});

	test("one with no more charges and no end date has nothing to resume", () => {
		const box = statusBox(item({ endDate: null, nextDueOn: null }), F);
		expect(box.text).toBe("No more charges.");
		expect(box.actions).toEqual([]);
	});

	test("a passed due date reads yesterday until the list reloads (D-619)", () => {
		expect(statusBox(item({ nextDueOn: "2026-11-01" }), F).text).toBe(
			"Next charge Sun, 1 Nov, yesterday.",
		);
	});

	test("the dates follow the locale", () => {
		expect(statusBox(item({}), { ...F, dateLocale: "en-US" }).text).toBe(
			"Next charge Thu, Nov 5, in 3 days.",
		);
	});

	test("the text is the segments joined", () => {
		for (const changes of [
			{},
			{ status: "paused" as const },
			{ status: "ended" as const },
		]) {
			const box = statusBox(item(changes), F);
			expect(box.segments.map((part) => part.text).join("")).toBe(box.text);
		}
	});
});

describe("chargeTimeline on golden (BR-F05-40)", () => {
	const NETFLIX_CHARGES = [
		paid("netflix", "2026-09-05", 64900),
		paid("netflix", "2026-10-05", 64900),
	];

	// AC-F05-37
	test("Netflix: 5 Dec After that, 5 Nov Next, then 5 Oct and 5 Sept charged", () => {
		const lines = chargeTimeline(
			subscriptionItem("netflix"),
			NETFLIX_CHARGES,
			F,
		);
		expect(dates(lines)).toEqual([
			"5 Dec 2026",
			"5 Nov 2026",
			"5 Oct 2026",
			"5 Sept 2026",
		]);
		expect(kinds(lines)).toEqual(["later", "next", "charged", "charged"]);
		expect(lines.map((line) => line.amount)).toEqual(Array(4).fill("₹649.00"));
		expect(lines.map((line) => line.caption)).toEqual([
			"After that",
			"Next. Added to Transactions on the day.",
			"Charged",
			"Charged",
		]);
	});

	test("Cult Gym: a skipped 10 October reads that it was deleted", () => {
		const lines = chargeTimeline(
			subscriptionItem("cultGym"),
			[paid("cultGym", "2026-09-10", 150000)],
			F,
		);
		expect(dates(lines)).toEqual([
			"10 Dec 2026",
			"10 Nov 2026",
			"10 Oct 2026",
			"10 Sept 2026",
		]);
		expect(kinds(lines)).toEqual(["later", "next", "skipped", "charged"]);
		expect(lines[2]).toMatchObject({
			amount: "Skipped",
			caption: "You deleted this charge. Daybook won't add it again.",
			struck: true,
			undoSkip: false,
		});
	});

	test("Sunrise Apartments: two coming, three charged", () => {
		const lines = chargeTimeline(
			subscriptionItem("sunrise"),
			[
				paid("sunrise", "2026-09-01", 1800000),
				paid("sunrise", "2026-10-01", 1800000),
				paid("sunrise", "2026-11-01", 1800000),
			],
			F,
		);
		expect(dates(lines)).toEqual([
			"1 Jan 2027",
			"1 Dec 2026",
			"1 Nov 2026",
			"1 Oct 2026",
			"1 Sept 2026",
		]);
		expect(kinds(lines)).toEqual([
			"later",
			"next",
			"charged",
			"charged",
			"charged",
		]);
	});

	test("Amazon Prime: two yearly dates to come and one charge", () => {
		const lines = chargeTimeline(
			subscriptionItem("amazonPrime"),
			[paid("amazonPrime", "2026-10-12", 149900)],
			F,
		);
		expect(dates(lines)).toEqual(["12 Oct 2028", "12 Oct 2027", "12 Oct 2026"]);
		expect(kinds(lines)).toEqual(["later", "next", "charged"]);
		expect(lines[0]!.amount).toBe("₹1,499.00");
	});

	test("a charge at another price keeps its own amount, and the dates to come the current one", () => {
		const lines = chargeTimeline(
			subscriptionItem("netflix", { amountMinor: 79900 }),
			[paid("netflix", "2026-10-05", 64900)],
			F,
		);
		expect(lines.map((line) => line.amount)).toEqual([
			"₹799.00",
			"₹799.00",
			"₹649.00",
		]);
	});

	test("each line has its own key", () => {
		const lines = chargeTimeline(
			subscriptionItem("netflix"),
			NETFLIX_CHARGES,
			F,
		);
		expect(new Set(lines.map((line) => line.key)).size).toBe(lines.length);
	});

	test("a charge's id comes with its line", () => {
		const lines = chargeTimeline(
			subscriptionItem("netflix"),
			NETFLIX_CHARGES,
			F,
		);
		expect(
			lines
				.filter((line) => line.kind === "charged")
				.map((line) => line.chargeId),
		).toEqual([NETFLIX_CHARGES[1]!.id, NETFLIX_CHARGES[0]!.id]);
		expect(lines[0]!.chargeId).toBeNull();
	});

	test("does not change what it is given", () => {
		const item = subscriptionItem("cultGym");
		const charges = [paid("cultGym", "2026-09-10", 150000)];
		const before = JSON.stringify({ item, charges });
		chargeTimeline(item, charges, F);
		expect(JSON.stringify({ item, charges })).toBe(before);
	});
});

describe("chargeTimeline: skips (BR-F05-26, BR-F05-27)", () => {
	const charges = [
		paid("netflix", "2026-09-05", 64900),
		paid("netflix", "2026-10-05", 64900),
	];

	// AC-F05-37
	test("a skipped 5 November reads Skipped with Undo skip, between 5 Dec and the past", () => {
		const lines = chargeTimeline(
			subscriptionItem("netflix", { skips: ["2026-11-05"] }),
			charges,
			F,
		);
		expect(dates(lines)).toEqual([
			"5 Jan 2027",
			"5 Dec 2026",
			"5 Nov 2026",
			"5 Oct 2026",
			"5 Sept 2026",
		]);
		expect(kinds(lines)).toEqual([
			"later",
			"next",
			"skipped",
			"charged",
			"charged",
		]);
		expect(lines[2]).toMatchObject({
			amount: "Skipped",
			caption: "You skipped it.",
			struck: true,
			undoSkip: true,
		});
	});

	test("the skipped date is not the next one: 5 December is", () => {
		const lines = chargeTimeline(
			subscriptionItem("netflix", { skips: ["2026-11-05"] }),
			charges,
			F,
		);
		expect(lines.find((line) => line.kind === "next")!.date).toBe("2026-12-05");
	});

	test("two skips in a row still leave two dates to come after them", () => {
		const lines = chargeTimeline(
			subscriptionItem("netflix", { skips: ["2026-11-05", "2026-12-05"] }),
			charges,
			F,
		);
		expect(kinds(lines).slice(0, 4)).toEqual([
			"later",
			"next",
			"skipped",
			"skipped",
		]);
		expect(lines[1]!.date).toBe("2027-01-05");
		expect(lines[0]!.date).toBe("2027-02-05");
	});

	test("a skipped date on or before today has no Undo skip: it was a deleted charge", () => {
		const lines = chargeTimeline(
			subscriptionItem("netflix", {
				skips: ["2026-11-05"],
				nextDueOn: "2026-12-05",
			}),
			[paid("netflix", "2026-10-05", 64900)],
			{ ...F, today: "2026-11-05" },
		);
		const skipped = lines.find((line) => line.kind === "skipped")!;
		expect(skipped).toMatchObject({
			undoSkip: false,
			caption: "You deleted this charge. Daybook won't add it again.",
		});
		// It sits among the past lines, below the coming ones.
		expect(lines.findIndex((line) => line.kind === "skipped")).toBeGreaterThan(
			lines.findIndex((line) => line.kind === "next"),
		);
	});

	test("a past skipped date and a charge sort together, newest first", () => {
		const lines = chargeTimeline(
			subscriptionItem("netflix", { skips: ["2026-10-05"] }),
			[
				paid("netflix", "2026-09-05", 64900),
				paid("netflix", "2026-08-05", 64900),
			],
			F,
		);
		expect(dates(lines).slice(2)).toEqual([
			"5 Oct 2026",
			"5 Sept 2026",
			"5 Aug 2026",
		]);
	});
});

describe("chargeTimeline: a pause (BR-F05-28)", () => {
	// Section 5's pause: from 5 November to 5 January.
	const paused = () =>
		subscriptionItem("netflix", {
			status: "paused",
			pause: { from: "2026-11-05", until: "2027-01-05" },
			nextDueOn: "2027-01-05",
		});

	// AC-F05-37
	test("shows the paused dates, then the dates after the pause", () => {
		const lines = chargeTimeline(
			paused(),
			[paid("netflix", "2026-10-05", 64900)],
			F,
		);
		expect(dates(lines).slice(0, 4)).toEqual([
			"5 Feb 2027",
			"5 Jan 2027",
			"5 Dec 2026",
			"5 Nov 2026",
		]);
		expect(kinds(lines).slice(0, 4)).toEqual([
			"later",
			"next",
			"paused",
			"paused",
		]);
		expect(lines[3]).toMatchObject({
			amount: "Paused",
			caption: "Not added while paused",
			struck: true,
			undoSkip: false,
		});
	});

	test("the first date after the pause is the next one, as the pause's until is not paused", () => {
		const lines = chargeTimeline(paused(), [], F);
		expect(lines.find((line) => line.kind === "next")!.date).toBe("2027-01-05");
	});

	test("a pause that has finished shows nothing as paused", () => {
		const lines = chargeTimeline(
			subscriptionItem("netflix", {
				pause: { from: "2026-08-05", until: "2026-10-05" },
			}),
			[],
			F,
		);
		expect(kinds(lines)).toEqual(["later", "next"]);
	});

	test("a long pause never cuts the search short before the dates after it", () => {
		const weekly = subscriptionItem("netflix", {
			cadence: { unit: "week", every: 1 },
			startDate: "2026-09-03",
			chargesFrom: "2026-09-03",
			status: "paused",
			pause: { from: "2026-11-05", until: "2027-04-01" },
			nextDueOn: "2027-04-01",
		});
		const lines = chargeTimeline(weekly, [], F);
		expect(kinds(lines).filter((kind) => kind === "paused")).toHaveLength(21);
		expect(kinds(lines).slice(0, 2)).toEqual(["later", "next"]);
		expect(lines[1]!.date).toBe("2027-04-01");
		expect(lines[0]!.date).toBe("2027-04-08");
	});

	test("a skip inside a pause stays skipped", () => {
		const lines = chargeTimeline({ ...paused(), skips: ["2026-12-05"] }, [], F);
		expect(lines.find((line) => line.date === "2026-12-05")!.kind).toBe(
			"skipped",
		);
	});
});

describe("chargeTimeline: today and the ends of a schedule", () => {
	test("a charge due today and not charged yet is the next one", () => {
		const lines = chargeTimeline(
			subscriptionItem("netflix", { nextDueOn: "2026-11-05" }),
			[paid("netflix", "2026-10-05", 64900)],
			{ ...F, today: "2026-11-05" },
		);
		expect(lines.find((line) => line.kind === "next")!.date).toBe("2026-11-05");
	});

	test("a charge made today is a past line, and the next date is the following one", () => {
		const lines = chargeTimeline(
			subscriptionItem("netflix", { nextDueOn: "2026-12-05" }),
			[paid("netflix", "2026-11-05", 64900)],
			{ ...F, today: "2026-11-05" },
		);
		expect(lines.find((line) => line.kind === "next")!.date).toBe("2026-12-05");
		expect(lines.find((line) => line.kind === "charged")!.date).toBe(
			"2026-11-05",
		);
	});

	test("an end date holds the dates to come back", () => {
		const lines = chargeTimeline(
			subscriptionItem("netflix", { status: "ending", endDate: "2026-11-20" }),
			[],
			F,
		);
		expect(kinds(lines)).toEqual(["next"]);
	});

	test("an end date on the due date still charges it", () => {
		const lines = chargeTimeline(
			subscriptionItem("netflix", { status: "ending", endDate: "2026-12-05" }),
			[],
			F,
		);
		expect(dates(lines)).toEqual(["5 Dec 2026", "5 Nov 2026"]);
	});

	test("an ended Subscription has only its past lines", () => {
		const lines = chargeTimeline(
			subscriptionItem("netflix", {
				status: "ended",
				endDate: "2026-09-30",
				nextDueOn: null,
			}),
			[paid("netflix", "2026-09-05", 64900)],
			F,
		);
		expect(kinds(lines)).toEqual(["charged"]);
	});

	test("an ended Subscription has no date to come, even a due date today with no charge", () => {
		// Ended on 5 November, its last due date, which no charge has reached yet.
		const lines = chargeTimeline(
			subscriptionItem("netflix", {
				status: "ended",
				endDate: "2026-11-05",
				nextDueOn: null,
			}),
			[],
			{ ...F, today: "2026-11-05" },
		);
		expect(lines).toEqual([]);
	});

	test("an upcoming Subscription lists its first dates and has no past", () => {
		const lines = chargeTimeline(
			subscriptionItem("netflix", {
				status: "upcoming",
				startDate: "2026-12-05",
				chargesFrom: "2026-12-05",
				nextDueOn: "2026-12-05",
			}),
			[],
			F,
		);
		expect(dates(lines)).toEqual(["5 Jan 2027", "5 Dec 2026"]);
		expect(kinds(lines)).toEqual(["later", "next"]);
	});

	test("dates are written from `chargesFrom`: a Subscription created without past charges starts later", () => {
		const lines = chargeTimeline(
			subscriptionItem("netflix", {
				startDate: "2025-09-05",
				chargesFrom: "2026-11-02",
			}),
			[],
			F,
		);
		expect(dates(lines)).toEqual(["5 Dec 2026", "5 Nov 2026"]);
	});

	test("with no charge and nothing to come there is no line", () => {
		expect(
			chargeTimeline(
				subscriptionItem("netflix", {
					status: "ending",
					endDate: "2026-11-03",
				}),
				[],
				F,
			),
		).toEqual([]);
	});

	test("a row with no due date is no timeline line", () => {
		expect(
			chargeTimeline(
				subscriptionItem("netflix", {
					status: "ended",
					endDate: "2026-09-30",
					nextDueOn: null,
				}),
				[charge({ dueOn: null })],
				F,
			),
		).toEqual([]);
	});

	test("a date in another year carries its year, as every line does", () => {
		const lines = chargeTimeline(subscriptionItem("amazonPrime"), [], F);
		expect(dates(lines)).toEqual(["12 Oct 2028", "12 Oct 2027"]);
	});

	test("the dates follow the locale", () => {
		const lines = chargeTimeline(subscriptionItem("netflix"), [], {
			...F,
			dateLocale: "en-US",
		});
		expect(dates(lines)).toEqual(["Dec 5, 2026", "Nov 5, 2026"]);
	});
});

describe("chargeTimeline: edited charges and the calendar's mark", () => {
	const charges = [
		paid("netflix", "2026-09-05", 64900),
		paid("netflix", "2026-10-05", 70000, { edited: true }),
	];

	// AC-F05-37
	test("an edited charge reads Charged · edited, at its own amount", () => {
		const lines = chargeTimeline(subscriptionItem("netflix"), charges, F);
		const october = lines.find((line) => line.date === "2026-10-05")!;
		expect(october).toMatchObject({
			caption: "Charged · edited",
			amount: "₹700.00",
		});
		expect(lines.find((line) => line.date === "2026-09-05")!.caption).toBe(
			"Charged",
		);
	});

	test("no line is marked by default", () => {
		expect(
			chargeTimeline(subscriptionItem("netflix"), charges, F).some(
				(line) => line.marked,
			),
		).toBe(false);
	});

	test("the date the calendar selected is marked, whichever kind it is", () => {
		for (const date of ["2026-11-05", "2026-12-05", "2026-10-05"]) {
			const lines = chargeTimeline(subscriptionItem("netflix"), charges, F, {
				selectedDue: date,
			});
			expect(
				lines.filter((line) => line.marked).map((line) => line.date),
			).toEqual([date]);
		}
	});

	test("a date with no line marks nothing", () => {
		expect(
			chargeTimeline(subscriptionItem("netflix"), charges, F, {
				selectedDue: "2026-11-06",
			}).some((line) => line.marked),
		).toBe(false);
	});
});

describe("the timeline's preview (BR-F05-40)", () => {
	const lines = (count: number) =>
		Array.from({ length: count }, (_, i) => ({ key: String(i) }) as never);

	test("shows 7 lines", () => {
		expect(TIMELINE_PREVIEW).toBe(7);
		expect(firstLines(lines(9))).toHaveLength(7);
	});

	test("keeps the first lines in order", () => {
		expect(firstLines(lines(9)).map((line) => line.key)).toEqual([
			"0",
			"1",
			"2",
			"3",
			"4",
			"5",
			"6",
		]);
	});

	test.each([0, 3, 7])("%i lines show as they are", (count) => {
		expect(firstLines(lines(count))).toHaveLength(count);
	});

	test("8 lines show 7", () => {
		expect(firstLines(lines(8))).toHaveLength(7);
	});

	test("the button reads Show all 9, then Show fewer", () => {
		expect(timelineToggle(9, false)).toBe("Show all 9");
		expect(timelineToggle(9, true)).toBe("Show fewer");
		expect(timelineToggle(8, false)).toBe("Show all 8");
	});

	test.each([0, 1, 6, 7])("with %i lines there is no button", (count) => {
		expect(timelineToggle(count, false)).toBeNull();
		expect(timelineToggle(count, true)).toBeNull();
	});
});

describe("paidSummary (BR-F05-40)", () => {
	// AC-F05-37
	test("golden Netflix: two charges", () => {
		expect(paidSummary(subscriptionItem("netflix"), F)).toBe(
			"Paid so far ₹1,298.00 · 2 charges",
		);
	});

	test("one charge reads 1 charge", () => {
		expect(paidSummary(subscriptionItem("cultGym"), F)).toBe(
			"Paid so far ₹1,500.00 · 1 charge",
		);
	});

	test("none, none", () => {
		expect(
			paidSummary(
				subscriptionItem("netflix", { chargeCount: 0, paidMinor: 0 }),
				F,
			),
		).toBeNull();
	});
});

describe("panelActions (BR-F05-40)", () => {
	const actions = (
		changes: Parameters<typeof subscriptionItem>[1],
		f: Formats = F,
	) =>
		panelActions(subscriptionItem("netflix", changes), f).map(
			(action) => action.label,
		);

	test("an active Subscription: Edit, Pause, Cancel Subscription, Delete", () => {
		expect(actions({})).toEqual([
			"Edit",
			"Pause",
			"Cancel Subscription",
			"Delete",
		]);
	});

	test("an active one with no next due date has no Pause", () => {
		expect(actions({ nextDueOn: null })).toEqual([
			"Edit",
			"Cancel Subscription",
			"Delete",
		]);
	});

	test("a paused one has no Pause: its box has Resume now and Change", () => {
		expect(actions({ status: "paused" })).toEqual([
			"Edit",
			"Cancel Subscription",
			"Delete",
		]);
	});

	test("an ending one reads Change end", () => {
		expect(actions({ status: "ending", endDate: "2026-12-31" })).toEqual([
			"Edit",
			"Pause",
			"Change end",
			"Delete",
		]);
	});

	test("an ending one with no next due date has Resume instead", () => {
		expect(actions({ status: "ending", nextDueOn: null })).toEqual([
			"Edit",
			"Resume",
			"Delete",
		]);
	});

	test("an ended one has Resume", () => {
		expect(actions({ status: "ended", nextDueOn: null })).toEqual([
			"Edit",
			"Resume",
			"Delete",
		]);
	});

	test("an upcoming one has neither Cancel nor Pause", () => {
		expect(actions({ status: "upcoming", nextDueOn: "2026-12-05" })).toEqual([
			"Edit",
			"Delete",
		]);
	});

	test("Pause follows the 24-month limit", () => {
		expect(actions({ nextDueOn: "2028-11-01" })).toContain("Pause");
		expect(actions({ nextDueOn: "2028-11-02" })).not.toContain("Pause");
	});

	test("Edit is the primary action, Delete the danger one, the rest secondary", () => {
		const all = panelActions(subscriptionItem("netflix"), F);
		expect(all.map((action) => action.variant)).toEqual([
			"primary",
			"secondary",
			"secondary",
			"danger",
		]);
		expect(all.map((action) => action.action)).toEqual([
			"edit",
			"pause",
			"cancel",
			"delete",
		]);
	});

	test("every status has Edit first and Delete last", () => {
		for (const status of [
			"active",
			"ending",
			"paused",
			"upcoming",
			"ended",
		] as const) {
			const all = panelActions(subscriptionItem("netflix", { status }), F);
			expect(all[0]!.action).toBe("edit");
			expect(all.at(-1)!.action).toBe("delete");
		}
	});
});

describe("the panel's key hint", () => {
	// AC-F05-52
	test.each([
		[
			"active",
			"E to edit · S to skip · P to pause · C to cancel · Delete to delete · Up and down arrows move · Esc to close",
		],
		[
			"ending",
			"E to edit · S to skip · P to pause · R to keep going · C to change end · Delete to delete · Up and down arrows move · Esc to close",
		],
		[
			"paused",
			"E to edit · P to change pause · R to resume now · C to cancel · Delete to delete · Up and down arrows move · Esc to close",
		],
		[
			"upcoming",
			"E to edit · Delete to delete · Up and down arrows move · Esc to close",
		],
		[
			"ended",
			"E to edit · R to resume · Delete to delete · Up and down arrows move · Esc to close",
		],
	] as const)(
		"the hint of a %s Subscription names only the keys that act on it",
		(status, hint) => {
			expect(keysHint(subscriptionItem("netflix", { status }), F)).toBe(hint);
		},
	);

	test("an active one with no next due date has no skip key in its hint", () => {
		expect(
			keysHint(subscriptionItem("netflix", { nextDueOn: null }), F),
		).not.toContain("S to skip");
	});
});

describe("PANEL_TEXT: the charge load's words (AC-F05-33)", () => {
	test("a failed read says so, with Retry", () => {
		expect(PANEL_TEXT.chargesFailed).toBe("Charges could not be loaded.");
		expect(PANEL_TEXT.retry).toBe("Retry");
		expect(PANEL_TEXT.viewCharges).toBe("View charges");
		expect(PANEL_TEXT.loadingCharges).toBe("Loading charges");
	});
});

describe("expectedLines: how many lines the skeleton holds (BR-F05-40)", () => {
	const item = (changes: Partial<Parameters<typeof expectedLines>[0]> = {}) => ({
		status: "active" as const,
		chargeCount: 2,
		skips: [] as string[],
		...changes,
	});

	test("every charge and the two dates to come: Netflix's 4 lines", () => {
		expect(expectedLines(subscriptionItem("netflix"))).toEqual({
			count: 4,
			toggle: false,
		});
	});

	test("a skipped date is a line too: Cult Gym's one charge, one skip and two to come", () => {
		expect(expectedLines(subscriptionItem("cultGym"))).toEqual({
			count: 4,
			toggle: false,
		});
	});

	test("an ended Subscription has none to come", () => {
		expect(expectedLines(item({ status: "ended", chargeCount: 3 }))).toEqual({
			count: 3,
			toggle: false,
		});
	});

	test("an ended one with no charge has no line at all", () => {
		expect(expectedLines(item({ status: "ended", chargeCount: 0 }))).toEqual({
			count: 0,
			toggle: false,
		});
	});

	test("one that has not started has only the two to come", () => {
		expect(expectedLines(item({ status: "upcoming", chargeCount: 0 }))).toEqual({
			count: 2,
			toggle: false,
		});
	});

	test("shows at most 7, and says a Show all follows", () => {
		expect(expectedLines(item({ chargeCount: 5 }))).toEqual({
			count: 7,
			toggle: false,
		});
		expect(expectedLines(item({ chargeCount: 6 }))).toEqual({
			count: 7,
			toggle: true,
		});
		expect(expectedLines(item({ chargeCount: 520 }))).toEqual({
			count: 7,
			toggle: true,
		});
	});

	test("skips count toward the total", () => {
		expect(
			expectedLines(
				item({ chargeCount: 4, skips: ["2026-01-01", "2026-02-01"] }),
			),
		).toEqual({ count: 7, toggle: true });
	});

	test("agrees with the real timeline's line count once the charges are known", () => {
		const netflix = subscriptionItem("netflix");
		const charges = [
			charge({
				subscriptionId: netflix.id,
				dueOn: "2026-09-05",
				occurredOn: "2026-09-05",
			}),
			charge({
				subscriptionId: netflix.id,
				dueOn: "2026-10-05",
				occurredOn: "2026-10-05",
			}),
		];
		expect(chargeTimeline(netflix, charges, F)).toHaveLength(
			expectedLines(netflix).count,
		);
	});
});

describe("chargeTimeline: the windows of the search (BR-F05-19)", () => {
	const yearly = (changes: Parameters<typeof subscriptionItem>[1] = {}) =>
		subscriptionItem("netflix", {
			cadence: { unit: "month", every: 12 },
			startDate: "2026-11-02",
			chargesFrom: "2026-11-02",
			nextDueOn: "2026-11-02",
			...changes,
		});

	test("a yearly charge on the anniversary of today is the one after the first", () => {
		const lines = chargeTimeline(yearly(), [], F);
		expect(lines.map((line) => line.date)).toEqual(["2027-11-02", "2026-11-02"]);
		expect(kinds(lines)).toEqual(["later", "next"]);
	});

	test("a due date exactly 120 months from today is still found", () => {
		const lines = chargeTimeline(
			yearly({
				status: "paused",
				pause: { from: "2026-11-01", until: "2036-11-02" },
				nextDueOn: "2036-11-02",
			}),
			[],
			F,
		);
		expect(lines[0]).toMatchObject({ kind: "next", date: "2036-11-02" });
		expect(kinds(lines).filter((kind) => kind === "paused")).toHaveLength(10);
	});
});
