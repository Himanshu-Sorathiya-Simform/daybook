import { describe, expect, test } from "vitest";

import {
	backfillPreview,
	changeDateOf,
	chargesAfterEnd,
	chargesFromAfterEnd,
	chargesFromAfterPause,
	chargesFromAfterSchedule,
	chargesFromOnCreate,
	doubleChargeSkipIssue,
	endMovesEarlier,
	nextChargeDates,
	PAUSE_MONTHS_AHEAD,
	pausableDates,
	pauseForCount,
	pauseIssue,
	pauseLimit,
	pausePreview,
	recordingDateOf,
	resumeGapDates,
	resumeNowPause,
	scheduleChangeNote,
	skipIssue,
	skipsOffSchedule,
	step2Through,
	unskipIssue,
} from "../rules";
import type { Cadence, Chargeable, Pause } from "../schedule";
import { goldenSubscription, GOLDEN_TODAY } from "./golden";

const MONTHLY: Cadence = { unit: "month", every: 1 };

const sub = (changes: Partial<Chargeable> = {}): Chargeable => ({
	startDate: "2026-09-05",
	cadence: MONTHLY,
	chargesFrom: "2026-09-05",
	endDate: null,
	pause: null,
	...changes,
});

const KOLKATA = "Asia/Kolkata";
/** The golden clock: 2026-11-02T12:00:00+05:30. */
const NOW = new Date("2026-11-02T06:30:00.000Z");

describe("changeDateOf (F05 section 3, BR-F05-08)", () => {
	const change = (
		changedAt: string | Date,
		lastChangeOn: string,
		now: Date = NOW,
		timezone = KOLKATA,
	) => changeDateOf({ changedAt, lastChangeOn, timezone, now });

	const SYNCED = new Date("2026-11-06T06:30:00Z");

	// F05 section 5: "changedAt on 4 November ... syncs at 6 November". A queued change never
	// reaches back past one applied before it.
	test.each([
		[
			"a change made now has today's date",
			NOW.toISOString(),
			"2026-09-05",
			NOW,
			"2026-11-02",
		],
		[
			"a change made on 4 November and synced on 6 November is a 4 November change",
			"2026-11-04T10:00:00Z",
			"2026-09-05",
			SYNCED,
			"2026-11-04",
		],
		[
			"the same change made on 5 November is a 5 November change",
			"2026-11-05T10:00:00Z",
			"2026-09-05",
			SYNCED,
			"2026-11-05",
		],
		[
			"lastChangeOn after the date of changedAt wins",
			"2026-10-20T10:00:00Z",
			"2026-10-25",
			SYNCED,
			"2026-10-25",
		],
		[
			"lastChangeOn equal to the date of changedAt gives that date",
			"2026-10-25T01:00:00Z",
			"2026-10-25",
			SYNCED,
			"2026-10-25",
		],
	])("%s", (_title, changedAt, lastChangeOn, now, expected) => {
		expect(change(changedAt, lastChangeOn, now)).toBe(expected);
	});

	// F05 section 5, several queued changes: both items get C = 4 November.
	test("two changes queued on 4 November both have the 4th, the second after the first set lastChangeOn", () => {
		const later = new Date("2026-11-09T06:30:00Z");
		expect(change("2026-11-04T08:00:00Z", "2026-09-05", later)).toBe(
			"2026-11-04",
		);
		expect(change("2026-11-04T09:00:00Z", "2026-11-04", later)).toBe(
			"2026-11-04",
		);
	});

	test("never passes today: a skewed clock cannot write the future", () => {
		expect(change("2026-11-02T06:34:00Z", "2026-09-05")).toBe("2026-11-02");
		expect(change("2026-11-03T06:00:00Z", "2026-09-05")).toBe("2026-11-02");
	});

	test("never passes today even when lastChangeOn does", () => {
		expect(change("2026-11-01T10:00:00Z", "2026-12-01")).toBe("2026-11-02");
	});

	test("reads the date in the profile zone, not UTC", () => {
		// 19:00 UTC on 4 November is 00:30 on 5 November in Kolkata and still the 4th in Los Angeles.
		const later = new Date("2026-11-06T06:30:00Z");
		expect(
			change("2026-11-04T19:00:00Z", "2026-09-05", later, "Asia/Kolkata"),
		).toBe("2026-11-05");
		expect(
			change(
				"2026-11-04T19:00:00Z",
				"2026-09-05",
				later,
				"America/Los_Angeles",
			),
		).toBe("2026-11-04");
	});

	test("the first instant of a day in the zone belongs to it", () => {
		const later = new Date("2026-11-06T06:30:00Z");
		expect(change("2026-11-03T18:30:00Z", "2026-09-05", later)).toBe(
			"2026-11-04",
		);
		expect(change("2026-11-03T18:29:59.999Z", "2026-09-05", later)).toBe(
			"2026-11-03",
		);
	});

	test("takes a Date as well as text", () => {
		expect(
			change(
				new Date("2026-11-04T10:00:00Z"),
				"2026-09-05",
				new Date("2026-11-06T06:30:00Z"),
			),
		).toBe("2026-11-04");
	});

	test("today is read in the zone too: 2 Nov 22:00 in Los Angeles is already 3 Nov UTC", () => {
		const now = new Date("2026-11-03T06:00:00Z");
		expect(
			change("2026-11-03T05:00:00Z", "2026-09-05", now, "America/Los_Angeles"),
		).toBe("2026-11-02");
	});
});

describe("recordingDateOf (BR-F05-03)", () => {
	const record = (createdAt: string, now: Date = NOW, timezone = KOLKATA) =>
		recordingDateOf({ createdAt, timezone, now });

	test("a create made now is recorded today", () => {
		expect(record(NOW.toISOString())).toBe("2026-11-02");
	});

	test("a create made earlier and synced later is recorded on the day it was made", () => {
		expect(
			record("2026-10-30T10:00:00Z", new Date("2026-11-02T06:30:00Z")),
		).toBe("2026-10-30");
	});

	test("never later than today", () => {
		expect(record("2026-11-03T10:00:00Z")).toBe("2026-11-02");
	});

	test("reads the date in the profile zone", () => {
		expect(record("2026-11-01T19:00:00Z", NOW, "Asia/Kolkata")).toBe(
			"2026-11-02",
		);
		expect(record("2026-11-01T19:00:00Z", NOW, "America/Los_Angeles")).toBe(
			"2026-11-01",
		);
	});

	test("takes a Date as well as text", () => {
		expect(record(new Date("2026-10-30T10:00:00Z") as unknown as string)).toBe(
			"2026-10-30",
		);
	});
});

describe("chargesFromOnCreate (BR-F05-03, AC-F05-04)", () => {
	test("with past charges, the start date", () => {
		expect(
			chargesFromOnCreate({
				startDate: "2025-09-05",
				recordingDate: "2026-11-02",
				backfill: true,
			}),
		).toBe("2025-09-05");
	});

	test("without, the later of the start date and the recording date", () => {
		expect(
			chargesFromOnCreate({
				startDate: "2025-09-05",
				recordingDate: "2026-11-02",
				backfill: false,
			}),
		).toBe("2026-11-02");
		expect(
			chargesFromOnCreate({
				startDate: "2026-12-05",
				recordingDate: "2026-11-02",
				backfill: false,
			}),
		).toBe("2026-12-05");
	});

	test("a start on the recording date is the same either way", () => {
		for (const backfill of [true, false]) {
			expect(
				chargesFromOnCreate({
					startDate: "2026-11-02",
					recordingDate: "2026-11-02",
					backfill,
				}),
			).toBe("2026-11-02");
		}
	});

	// golden: each Subscription was created on its start date without backfill.
	test("golden: created on the start date without backfill, chargesFrom is the start date", () => {
		for (const name of [
			"sunrise",
			"netflix",
			"cultGym",
			"amazonPrime",
		] as const) {
			const golden = goldenSubscription(name);
			expect(
				chargesFromOnCreate({
					startDate: golden.startDate,
					recordingDate: golden.startDate,
					backfill: false,
				}),
			).toBe(golden.chargesFrom);
		}
	});

	test("an upcoming start with past charges chosen is still the start date", () => {
		expect(
			chargesFromOnCreate({
				startDate: "2026-12-05",
				recordingDate: "2026-11-02",
				backfill: true,
			}),
		).toBe("2026-12-05");
	});
});

describe("backfillPreview (BR-F05-04)", () => {
	const netflix = {
		startDate: "2025-09-05",
		cadence: MONTHLY,
		amountMinor: 64900,
	};

	// F05 section 5: 14 dates, 9,086.00.
	test("monthly 649.00 from 5 Sep 2025, recorded 2 Nov 2026: 14 charges, 9,086.00", () => {
		const preview = backfillPreview(netflix, "2026-11-02");
		expect(preview.count).toBe(14);
		expect(preview.totalMinor).toBe(908600);
		expect(preview.dates[0]).toBe("2025-09-05");
		expect(preview.dates.at(-1)).toBe("2026-10-05");
		expect(preview.dates).toHaveLength(14);
	});

	test("a start in the future has no past charges, so the choice does not appear", () => {
		expect(
			backfillPreview({ ...netflix, startDate: "2026-12-05" }, "2026-11-02"),
		).toEqual({
			dates: [],
			count: 0,
			totalMinor: 0,
		});
	});

	test("a start on the recording date has none: a date due today is not past", () => {
		expect(
			backfillPreview({ ...netflix, startDate: "2026-11-02" }, "2026-11-02")
				.count,
		).toBe(0);
	});

	test("a start the day before has one", () => {
		expect(
			backfillPreview({ ...netflix, startDate: "2026-11-01" }, "2026-11-02")
				.dates,
		).toEqual(["2026-11-01"]);
	});

	test("a due date on the recording date is left out, the one before it is in", () => {
		expect(backfillPreview(netflix, "2026-10-05").dates.at(-1)).toBe(
			"2026-09-05",
		);
		expect(backfillPreview(netflix, "2026-10-06").dates.at(-1)).toBe(
			"2026-10-05",
		);
	});

	test("one past charge", () => {
		const preview = backfillPreview(
			{ ...netflix, startDate: "2026-10-05" },
			"2026-11-02",
		);
		expect(preview).toEqual({
			dates: ["2026-10-05"],
			count: 1,
			totalMinor: 64900,
		});
	});

	test("a weekly Subscription started 10 years ago has 522 past charges", () => {
		const preview = backfillPreview(
			{
				startDate: "2016-11-03",
				cadence: { unit: "week", every: 1 },
				amountMinor: 12000,
			},
			"2026-11-02",
		);
		expect(preview.count).toBe(522);
		expect(preview.totalMinor).toBe(522 * 12000);
	});

	test("clamped months count once each", () => {
		const preview = backfillPreview(
			{ startDate: "2026-01-31", cadence: MONTHLY, amountMinor: 100 },
			"2026-04-01",
		);
		expect(preview.dates).toEqual(["2026-01-31", "2026-02-28", "2026-03-31"]);
	});
});

describe("chargesFromAfterSchedule (BR-F05-11)", () => {
	// Created 2 Nov to start 5 Dec, moved on 3 Nov to 1 Dec; and F05 section 5's late schedule
	// change, C = 2 November, new start 8 September.
	test.each([
		[
			"a new start after the change date is the new chargesFrom",
			"2026-12-01",
			"2026-11-03",
			"2026-12-01",
		],
		[
			"a new start before the change date gives the day after it",
			"2026-09-08",
			"2026-11-02",
			"2026-11-03",
		],
		[
			"a new start on the change date gives the day after it: the change date keeps the old schedule",
			"2026-11-02",
			"2026-11-02",
			"2026-11-03",
		],
		[
			"a new start the day after the change date is itself",
			"2026-11-03",
			"2026-11-02",
			"2026-11-03",
		],
	])("%s", (_title, startDate, changeDate, expected) => {
		expect(chargesFromAfterSchedule({ startDate, changeDate })).toBe(expected);
	});

	test("crosses a month and a year end", () => {
		expect(
			chargesFromAfterSchedule({
				startDate: "2025-01-01",
				changeDate: "2026-12-31",
			}),
		).toBe("2027-01-01");
		expect(
			chargesFromAfterSchedule({
				startDate: "2025-01-01",
				changeDate: "2028-02-28",
			}),
		).toBe("2028-02-29");
	});
});

describe("nextChargeDates", () => {
	test("golden Netflix from 3 November: 5 Nov, 5 Dec, 5 Jan", () => {
		expect(nextChargeDates(sub(), { from: "2026-11-03", count: 3 })).toEqual([
			"2026-11-05",
			"2026-12-05",
			"2027-01-05",
		]);
	});

	test("leaves out tombstoned dates", () => {
		expect(
			nextChargeDates(sub(), {
				from: "2026-11-03",
				skipped: ["2026-11-05"],
				count: 2,
			}),
		).toEqual(["2026-12-05", "2027-01-05"]);
	});

	test("leaves out paused dates and starts at chargesFrom", () => {
		expect(
			nextChargeDates(
				sub({ pause: { from: "2026-11-05", until: "2027-01-05" } }),
				{
					from: "2026-11-03",
					count: 2,
				},
			),
		).toEqual(["2027-01-05", "2027-02-05"]);
		expect(
			nextChargeDates(sub({ chargesFrom: "2026-12-01" }), {
				from: "2026-11-03",
				count: 1,
			}),
		).toEqual(["2026-12-05"]);
	});

	test("stops at the end date and may return fewer than asked", () => {
		expect(
			nextChargeDates(sub({ endDate: "2026-12-31" }), {
				from: "2026-11-03",
				count: 5,
			}),
		).toEqual(["2026-11-05", "2026-12-05"]);
		expect(
			nextChargeDates(sub({ endDate: "2026-10-31" }), {
				from: "2026-11-03",
				count: 5,
			}),
		).toEqual([]);
	});

	test("count 0 is empty", () => {
		expect(nextChargeDates(sub(), { from: "2026-11-03", count: 0 })).toEqual([]);
	});

	test("includes `from` itself when it is a due date", () => {
		expect(nextChargeDates(sub(), { from: "2026-11-05", count: 1 })).toEqual([
			"2026-11-05",
		]);
	});
});

describe("scheduleChangeNote (BR-F05-31, AC-F05-20)", () => {
	// F05 section 5: on 6 November, after the 5 November charge, the start moves to 2026-09-15;
	// made instead on 2 November, to 2026-09-20; and the late schedule change (start 8
	// September, C = 2 November) names 8 October as passed.
	test.each<
		[string, { startDate: string; chargesFrom: string }, string, string, object]
	>([
		[
			"a day moved later: 15 Nov is less than a month after 5 Nov, so it is offered for a skip",
			{ startDate: "2026-09-15", chargesFrom: "2026-11-07" },
			"2026-11-05",
			"2026-11-06",
			{
				kind: "doubleCharge",
				skipOn: "2026-11-15",
				lastChargeOn: "2026-11-05",
				nextAfterSkip: "2026-12-15",
			},
		],
		[
			"a day moved later whose first date has passed: nothing is charged until 20 Nov",
			{ startDate: "2026-09-20", chargesFrom: "2026-11-03" },
			"2026-10-05",
			"2026-11-02",
			{ kind: "passed", passedOn: "2026-10-20", nextOn: "2026-11-20" },
		],
		[
			"the late schedule change of section 5 (start 8 September, C = 2 November) names 8 October as passed",
			{ startDate: "2026-09-08", chargesFrom: "2026-11-03" },
			"2026-10-05",
			"2026-11-02",
			{ kind: "passed", passedOn: "2026-10-08", nextOn: "2026-11-08" },
		],
	])("%s", (_title, next, lastChargeOn, changeDate, expected) => {
		expect(
			scheduleChangeNote({ next: sub(next), lastChargeOn, changeDate }),
		).toEqual(expected);
	});

	test("a first date exactly one period after the last charge needs no note", () => {
		const next = sub({ startDate: "2026-09-05", chargesFrom: "2026-11-03" });
		expect(
			scheduleChangeNote({
				next,
				lastChargeOn: "2026-10-05",
				changeDate: "2026-11-02",
			}),
		).toBeNull();
	});

	test("a first date one day short of a period is a double charge", () => {
		const next = sub({ startDate: "2026-09-04", chargesFrom: "2026-11-03" });
		expect(
			scheduleChangeNote({
				next,
				lastChargeOn: "2026-10-05",
				changeDate: "2026-11-02",
			}),
		).toMatchObject({ kind: "doubleCharge", skipOn: "2026-11-04" });
	});

	test("a weekly schedule judges one week, not one month", () => {
		const next = sub({
			startDate: "2026-11-02",
			cadence: { unit: "week", every: 1 },
			chargesFrom: "2026-11-06",
		});
		expect(
			scheduleChangeNote({
				next,
				lastChargeOn: "2026-11-05",
				changeDate: "2026-11-05",
			}),
		).toMatchObject({
			kind: "doubleCharge",
			skipOn: "2026-11-09",
			nextAfterSkip: "2026-11-16",
		});
	});

	test("a cadence change judges one new period", () => {
		// Monthly to every 2 months, same start: the first date after 3 Nov is 5 Nov, 31 days after 5 Oct.
		const next = sub({
			cadence: { unit: "month", every: 2 },
			chargesFrom: "2026-11-03",
		});
		expect(
			scheduleChangeNote({
				next,
				lastChargeOn: "2026-10-05",
				changeDate: "2026-11-02",
			}),
		).toMatchObject({
			kind: "doubleCharge",
			skipOn: "2026-11-05",
			nextAfterSkip: "2027-01-05",
		});
	});

	test("a tombstone on the first date moves the question to the next date", () => {
		const next = sub({ startDate: "2026-09-15", chargesFrom: "2026-11-07" });
		expect(
			scheduleChangeNote({
				next,
				skipped: ["2026-11-15"],
				lastChargeOn: "2026-11-05",
				changeDate: "2026-11-06",
			}),
		).toBeNull();
	});

	test("a double charge with no later date before the end has nothing after the skip", () => {
		const next = sub({
			startDate: "2026-09-15",
			chargesFrom: "2026-11-07",
			endDate: "2026-11-20",
		});
		expect(
			scheduleChangeNote({
				next,
				lastChargeOn: "2026-11-05",
				changeDate: "2026-11-06",
			}),
		).toEqual({
			kind: "doubleCharge",
			skipOn: "2026-11-15",
			lastChargeOn: "2026-11-05",
			nextAfterSkip: null,
		});
	});

	// A date a month on can land short of the last charge's own month-end: 28 Jan plus one month is
	// 28 Feb, and a schedule anchored on the 31st has 31 Jan and 28 Feb. Equal to the limit is neither.
	test("a first date exactly at the limit is neither a double charge nor a passed date, though a date has passed", () => {
		const next = sub({ startDate: "2026-01-31", chargesFrom: "2026-02-01" });
		expect(
			scheduleChangeNote({
				next,
				lastChargeOn: "2026-01-28",
				changeDate: "2026-01-31",
			}),
		).toBeNull();
	});

	test("the last charge itself being a date of the new schedule is not a passed date", () => {
		// Every 3 months from 5 Jul has 5 Oct, the last charge. The first date, 5 Jan, is skipped, so
		// the next is 5 Apr, past the limit: nothing has passed, so nothing is said.
		const next = sub({
			startDate: "2026-07-05",
			cadence: { unit: "month", every: 3 },
			chargesFrom: "2026-11-03",
		});
		expect(
			scheduleChangeNote({
				next,
				skipped: ["2027-01-05"],
				lastChargeOn: "2026-10-05",
				changeDate: "2026-11-02",
			}),
		).toBeNull();
	});

	test("no charge yet means no note", () => {
		expect(
			scheduleChangeNote({
				next: sub({ chargesFrom: "2026-11-03" }),
				lastChargeOn: null,
				changeDate: "2026-11-02",
			}),
		).toBeNull();
	});

	test("no chargeable date means no note", () => {
		const next = sub({ chargesFrom: "2026-11-03", endDate: "2026-11-01" });
		expect(
			scheduleChangeNote({
				next,
				lastChargeOn: "2026-10-05",
				changeDate: "2026-11-02",
			}),
		).toBeNull();
	});

	test("a pause that covers the first date moves the question past the pause", () => {
		const next = sub({
			startDate: "2026-09-15",
			chargesFrom: "2026-11-07",
			pause: { from: "2026-11-15", until: "2027-01-01" },
		});
		expect(
			scheduleChangeNote({
				next,
				lastChargeOn: "2026-11-05",
				changeDate: "2026-11-06",
			}),
		).toBeNull();
	});

	test("a first date that is the change date's next day and exactly a period on has no note", () => {
		const next = sub({ startDate: "2026-12-05", chargesFrom: "2026-12-05" });
		expect(
			scheduleChangeNote({
				next,
				lastChargeOn: "2026-11-05",
				changeDate: "2026-11-06",
			}),
		).toBeNull();
	});
});

describe("skipsOffSchedule (BR-F05-11, D-596)", () => {
	const schedule = { startDate: "2026-09-08", cadence: MONTHLY };

	test("tombstones after C that are not dates of the new schedule go", () => {
		expect(
			skipsOffSchedule(
				schedule,
				["2026-11-05", "2026-12-08", "2027-01-20"],
				"2026-11-02",
			),
		).toEqual(["2026-11-05", "2027-01-20"]);
	});

	test("tombstones through C stay, whatever the schedule", () => {
		expect(
			skipsOffSchedule(schedule, ["2026-10-10", "2026-11-02"], "2026-11-02"),
		).toEqual([]);
	});

	test("a tombstone the day after C is judged", () => {
		expect(skipsOffSchedule(schedule, ["2026-11-03"], "2026-11-02")).toEqual([
			"2026-11-03",
		]);
	});

	test("none gives none", () => {
		expect(skipsOffSchedule(schedule, [], "2026-11-02")).toEqual([]);
	});
});

describe("endMovesEarlier (BR-F05-12)", () => {
	test.each([
		[null, "2026-09-30", true],
		["2026-12-31", "2026-09-30", true],
		["2026-12-31", "2026-12-30", true],
		["2026-12-31", "2026-12-31", false],
		["2026-09-30", "2026-12-31", false],
		["2026-09-30", null, false],
		[null, null, false],
	])("stored %s, new %s: %s", (stored, next, expected) => {
		expect(endMovesEarlier(stored, next)).toBe(expected);
	});
});

describe("chargesAfterEnd (BR-F05-12, BR-F05-41)", () => {
	const charge = (dueOn: string, edited = false) => ({ id: dueOn, dueOn, edited });

	// golden: cancelling Netflix with end date 2026-09-30 deletes #16 (5 October).
	test("golden: Netflix ending 30 September deletes the 5 October charge", () => {
		const netflix = goldenSubscription("netflix").charged.map((dueOn) =>
			charge(dueOn),
		);
		expect(chargesAfterEnd(netflix, "2026-09-30")).toEqual({
			deleted: [charge("2026-10-05")],
			editedStay: 0,
		});
	});

	test("the end date itself is kept, the day after is deleted", () => {
		expect(
			chargesAfterEnd(
				[charge("2026-10-05"), charge("2026-10-06")],
				"2026-10-05",
			).deleted,
		).toEqual([charge("2026-10-06")]);
	});

	test("edited charges stay and are counted", () => {
		expect(
			chargesAfterEnd(
				[
					charge("2026-10-05", true),
					charge("2026-11-05"),
					charge("2026-12-05", true),
				],
				"2026-09-30",
			),
		).toEqual({ deleted: [charge("2026-11-05")], editedStay: 2 });
	});

	test("lists deleted charges oldest first", () => {
		expect(
			chargesAfterEnd(
				[charge("2026-12-05"), charge("2026-10-05"), charge("2026-11-05")],
				"2026-09-30",
			).deleted.map((each) => each.dueOn),
		).toEqual(["2026-10-05", "2026-11-05", "2026-12-05"]);
	});

	test("charges through the end date are untouched, edited or not", () => {
		expect(
			chargesAfterEnd(
				[charge("2026-09-05"), charge("2026-09-30", true)],
				"2026-09-30",
			),
		).toEqual({
			deleted: [],
			editedStay: 0,
		});
	});

	test("no charges give nothing", () => {
		expect(chargesAfterEnd([], "2026-09-30")).toEqual({
			deleted: [],
			editedStay: 0,
		});
	});

	test("keeps whatever else a charge carries", () => {
		const rich = {
			id: "x",
			dueOn: "2026-11-05",
			edited: false,
			amountMinor: 64900,
		};
		expect(chargesAfterEnd([rich], "2026-09-30").deleted[0]).toBe(rich);
	});
});

describe("chargesFromAfterEnd (BR-F05-13, BR-F05-32, AC-F05-07, AC-F05-22, AC-F05-30)", () => {
	const base = {
		chargesFrom: "2026-09-05",
		startDate: "2026-09-05",
		changeDate: "2026-11-02",
	};
	const after = (changes: {
		storedEndDate: string | null;
		newEndDate: string | null;
		chargesFrom?: string;
		backfillGap?: boolean;
		startDate?: string;
	}) => chargesFromAfterEnd({ ...base, ...changes });

	// Section 7.5: "Restart from today" moves chargesFrom to 2 November. "It never actually
	// stopped" keeps the gap chargeable (AC-F05-22); after a restart and its Undo, a backfill
	// still creates 5 October (AC-F05-30).
	test.each<[string, Parameters<typeof after>[0], string]>([
		[
			"cancelling a running Subscription moves nothing",
			{ storedEndDate: null, newEndDate: "2026-09-30" },
			"2026-09-05",
		],
		[
			"a resume from an ended Subscription restarts from the change date",
			{ storedEndDate: "2026-09-30", newEndDate: null },
			"2026-11-02",
		],
		[
			"a resume with a new end date after C restarts from the change date too",
			{ storedEndDate: "2026-09-30", newEndDate: "2026-12-31" },
			"2026-11-02",
		],
		[
			"an end date moved to before the change date means it ran longer: nothing moves",
			{ storedEndDate: "2026-09-30", newEndDate: "2026-10-15" },
			"2026-09-05",
		],
		[
			"an end date moved to the change date means it ran longer: nothing moves",
			{ storedEndDate: "2026-09-30", newEndDate: "2026-11-02" },
			"2026-09-05",
		],
		[
			"an end date moved to the day after C is a resume",
			{ storedEndDate: "2026-09-30", newEndDate: "2026-11-03" },
			"2026-11-02",
		],
		[
			"backfillGap keeps chargesFrom where it was when that is already earlier",
			{ storedEndDate: "2026-09-30", newEndDate: null, backfillGap: true },
			"2026-09-05",
		],
		[
			"backfillGap puts chargesFrom back to the day after the stored end after an earlier resume moved it",
			{
				storedEndDate: "2026-09-30",
				newEndDate: null,
				chargesFrom: "2026-11-02",
				backfillGap: true,
			},
			"2026-10-01",
		],
		[
			"backfillGap never goes before the start date",
			{
				storedEndDate: "2026-09-30",
				newEndDate: null,
				chargesFrom: "2026-01-01",
				startDate: "2026-09-05",
				backfillGap: true,
			},
			"2026-09-05",
		],
		[
			"backfillGap applies to a later end date that is still on or before C",
			{
				storedEndDate: "2026-09-30",
				newEndDate: "2026-10-15",
				chargesFrom: "2026-11-02",
				backfillGap: true,
			},
			"2026-10-01",
		],
		[
			"backfillGap applies to a later end date after C",
			{
				storedEndDate: "2026-09-30",
				newEndDate: "2026-12-31",
				chargesFrom: "2026-11-02",
				backfillGap: true,
			},
			"2026-10-01",
		],
		[
			"backfillGap with the same end date sent again changes nothing: it is not a later end",
			{
				storedEndDate: "2026-09-30",
				newEndDate: "2026-09-30",
				chargesFrom: "2026-11-02",
				backfillGap: true,
			},
			"2026-11-02",
		],
	])("%s", (_title, changes, expected) => {
		expect(after(changes)).toBe(expected);
	});

	test("backfillGap with no stored end date changes nothing", () => {
		expect(
			after({ storedEndDate: null, newEndDate: null, backfillGap: true }),
		).toBe("2026-09-05");
		expect(
			after({
				storedEndDate: null,
				newEndDate: null,
				chargesFrom: "2026-11-02",
				backfillGap: true,
			}),
		).toBe("2026-11-02");
	});

	test("backfillGap with a stored end on or after C changes nothing: it is still running", () => {
		expect(
			after({
				storedEndDate: "2026-11-02",
				newEndDate: null,
				chargesFrom: "2026-10-20",
				backfillGap: true,
			}),
		).toBe("2026-10-20");
		expect(
			after({
				storedEndDate: "2026-12-31",
				newEndDate: null,
				chargesFrom: "2026-10-20",
				backfillGap: true,
			}),
		).toBe("2026-10-20");
	});

	test("a stored end on or after C: a later end or none changes nothing", () => {
		expect(
			after({ storedEndDate: "2026-11-02", newEndDate: "2026-12-31" }),
		).toBe("2026-09-05");
		expect(after({ storedEndDate: "2026-12-31", newEndDate: null })).toBe(
			"2026-09-05",
		);
		expect(
			after({
				storedEndDate: "2026-12-31",
				newEndDate: "2027-03-31",
				chargesFrom: "2026-10-20",
			}),
		).toBe("2026-10-20");
	});

	test("an end date moved earlier or kept moves nothing", () => {
		expect(
			after({ storedEndDate: "2026-10-31", newEndDate: "2026-09-30" }),
		).toBe("2026-09-05");
		expect(
			after({ storedEndDate: "2026-09-30", newEndDate: "2026-09-30" }),
		).toBe("2026-09-05");
		expect(
			after({
				storedEndDate: "2026-10-31",
				newEndDate: "2026-09-30",
				backfillGap: true,
				chargesFrom: "2026-11-02",
			}),
		).toBe("2026-11-02");
	});

	test("a resume keeps a chargesFrom that is already later than C", () => {
		expect(
			after({
				storedEndDate: "2026-09-30",
				newEndDate: null,
				chargesFrom: "2026-11-20",
			}),
		).toBe("2026-11-20");
	});

	test("a resume on the day the Subscription ended: the stored end is C itself", () => {
		expect(after({ storedEndDate: "2026-11-02", newEndDate: null })).toBe(
			"2026-09-05",
		);
	});
});

describe("resumeGapDates (BR-F05-42)", () => {
	const ended = (
		changes: Partial<Chargeable & { charged: string[]; skipped: string[] }> = {},
	) => ({
		...sub({ endDate: "2026-09-30" }),
		charged: ["2026-09-05"],
		skipped: [],
		...changes,
	});

	// Section 7.4 and 7.5: Netflix cancelled with 30 September, #16 deleted; 5 October is the gap.
	test("golden: Netflix cancelled on 30 September has 5 October as its missed charge", () => {
		expect(resumeGapDates(ended(), GOLDEN_TODAY)).toEqual(["2026-10-05"]);
	});

	test("leaves out dates that already have a charge or a tombstone", () => {
		expect(
			resumeGapDates(
				ended({ charged: ["2026-09-05", "2026-10-05"] }),
				GOLDEN_TODAY,
			),
		).toEqual([]);
		expect(
			resumeGapDates(ended({ skipped: ["2026-10-05"] }), GOLDEN_TODAY),
		).toEqual([]);
	});

	test("leaves out paused dates", () => {
		expect(
			resumeGapDates(
				ended({ pause: { from: "2026-10-01", until: "2026-10-20" } }),
				GOLDEN_TODAY,
			),
		).toEqual([]);
	});

	test("lists every missed date through today, never one in the future", () => {
		expect(
			resumeGapDates(
				ended({ endDate: "2026-08-31", charged: [] }),
				"2026-11-05",
			),
		).toEqual(["2026-09-05", "2026-10-05", "2026-11-05"]);
		expect(
			resumeGapDates(
				ended({ endDate: "2026-08-31", charged: [] }),
				"2026-11-04",
			),
		).toEqual(["2026-09-05", "2026-10-05"]);
	});

	test("the end date itself is not part of the gap, though it is a due date with no charge", () => {
		expect(
			resumeGapDates(
				ended({ endDate: "2026-10-05", charged: ["2026-09-05"] }),
				GOLDEN_TODAY,
			),
		).toEqual([]);
	});

	test("a Subscription not yet ended has no gap", () => {
		expect(resumeGapDates(ended({ endDate: null }), GOLDEN_TODAY)).toEqual([]);
		expect(
			resumeGapDates(ended({ endDate: "2026-12-31" }), GOLDEN_TODAY),
		).toEqual([]);
	});

	test("an end date of today has no gap: nothing is due after it through today", () => {
		expect(
			resumeGapDates(ended({ endDate: GOLDEN_TODAY }), GOLDEN_TODAY),
		).toEqual([]);
	});

	test("an end date of yesterday with nothing due since has no gap", () => {
		expect(
			resumeGapDates(ended({ endDate: "2026-11-01" }), GOLDEN_TODAY),
		).toEqual([]);
	});

	test("a weekly Subscription's gap holds every week", () => {
		const weekly = {
			...sub({
				startDate: "2026-10-01",
				chargesFrom: "2026-10-01",
				cadence: { unit: "week", every: 1 },
				endDate: "2026-10-10",
			}),
			charged: ["2026-10-01", "2026-10-08"],
			skipped: [],
		};
		expect(resumeGapDates(weekly, "2026-11-02")).toEqual([
			"2026-10-15",
			"2026-10-22",
			"2026-10-29",
		]);
	});
});

describe("step2Through (BR-F05-08 step 2)", () => {
	const C = "2026-11-02";

	test("without an end or pause change, through the change date", () => {
		expect(
			step2Through({ changeDate: C, storedEndDate: null, storedPause: null }),
		).toBe(C);
	});

	test("an end date set before C stops there: step 3 would delete anything later", () => {
		expect(
			step2Through({
				changeDate: C,
				storedEndDate: null,
				newEndDate: "2026-09-30",
				storedPause: null,
			}),
		).toBe("2026-09-30");
	});

	test("an end date moved earlier than the stored one, still before C, stops there", () => {
		expect(
			step2Through({
				changeDate: C,
				storedEndDate: "2026-10-31",
				newEndDate: "2026-09-30",
				storedPause: null,
			}),
		).toBe("2026-09-30");
	});

	test("an end date after C, or equal to it, leaves C", () => {
		for (const newEndDate of ["2026-11-02", "2026-11-03", "2026-12-31"]) {
			expect(
				step2Through({
					changeDate: C,
					storedEndDate: null,
					newEndDate,
					storedPause: null,
				}),
			).toBe(C);
		}
	});

	test("an end date moved later or cleared leaves C", () => {
		expect(
			step2Through({
				changeDate: C,
				storedEndDate: "2026-09-30",
				newEndDate: null,
				storedPause: null,
			}),
		).toBe(C);
		expect(
			step2Through({
				changeDate: C,
				storedEndDate: "2026-09-30",
				newEndDate: "2026-10-15",
				storedPause: null,
			}),
		).toBe(C);
	});

	test("an end date that is not sent leaves C", () => {
		expect(
			step2Through({
				changeDate: C,
				storedEndDate: "2026-09-30",
				newEndDate: undefined,
				storedPause: null,
			}),
		).toBe(C);
	});

	// BR-F05-34: the Undo of Resume now puts the pause back over C.
	test("a pause extended over C stops the day before it", () => {
		const stored: Pause = { from: "2026-11-05", until: "2026-11-10" };
		const next: Pause = { from: "2026-11-05", until: "2027-01-05" };
		expect(
			step2Through({
				changeDate: "2026-11-10",
				storedEndDate: null,
				storedPause: stored,
				newPause: next,
			}),
		).toBe("2026-11-09");
	});

	test("a pause that does not cover C leaves C", () => {
		expect(
			step2Through({
				changeDate: C,
				storedEndDate: null,
				storedPause: null,
				newPause: { from: "2026-11-05", until: "2027-01-05" },
			}),
		).toBe(C);
	});

	test("a pause already in force that only changes its end leaves C", () => {
		expect(
			step2Through({
				changeDate: "2026-11-10",
				storedEndDate: null,
				storedPause: { from: "2026-11-05", until: "2026-12-05" },
				newPause: { from: "2026-11-05", until: "2027-01-05" },
			}),
		).toBe("2026-11-10");
	});

	test("clearing a pause leaves C", () => {
		expect(
			step2Through({
				changeDate: C,
				storedEndDate: null,
				storedPause: { from: "2026-11-05", until: "2027-01-05" },
				newPause: null,
			}),
		).toBe(C);
	});

	test("a pause that starts on C covers C and so stops the day before", () => {
		expect(
			step2Through({
				changeDate: "2026-11-05",
				storedEndDate: null,
				storedPause: null,
				newPause: { from: "2026-11-05", until: "2027-01-05" },
			}),
		).toBe("2026-11-04");
	});

	test("an early end date and a pause over C together take the earlier", () => {
		expect(
			step2Through({
				changeDate: "2026-11-10",
				storedEndDate: null,
				newEndDate: "2026-09-30",
				storedPause: { from: "2026-11-05", until: "2026-11-10" },
				newPause: { from: "2026-11-05", until: "2027-01-05" },
			}),
		).toBe("2026-09-30");
	});
});

describe("skipIssue and unskipIssue (BR-F05-26, BR-F05-27, AC-F05-18)", () => {
	const message = "Only an upcoming charge can be skipped.";

	// golden: skipping Netflix's 5 November on 2 November.
	test("golden: Netflix's 5 November can be skipped on 2 November", () => {
		expect(skipIssue(sub(), "2026-11-05", "2026-11-02")).toBeNull();
		expect(skipIssue(sub(), "2026-12-05", "2026-11-02")).toBeNull();
	});

	test.each([
		["a charge date before C", "2026-10-05"],
		["the change date itself", "2026-11-02"],
		["a date that is not due", "2026-11-06"],
		["a day before a due date", "2026-11-04"],
	])("refuses %s", (_name, dueOn) => {
		expect(skipIssue(sub(), dueOn, "2026-11-02")).toBe(message);
	});

	test("a due date that is the change date is refused: today's charge exists, delete it in Transactions", () => {
		expect(skipIssue(sub(), "2026-11-05", "2026-11-05")).toBe(message);
	});

	test("the day after C is allowed when it is due", () => {
		expect(skipIssue(sub(), "2026-11-05", "2026-11-04")).toBeNull();
	});

	test("refuses a date after the end date", () => {
		expect(
			skipIssue(sub({ endDate: "2026-11-30" }), "2026-12-05", "2026-11-02"),
		).toBe(message);
		expect(
			skipIssue(sub({ endDate: "2026-12-05" }), "2026-12-05", "2026-11-02"),
		).toBeNull();
	});

	test("refuses a date before chargesFrom", () => {
		expect(
			skipIssue(
				sub({ chargesFrom: "2026-12-01" }),
				"2026-11-05",
				"2026-11-02",
			),
		).toBe(message);
	});

	test("refuses a paused date", () => {
		expect(
			skipIssue(
				sub({ pause: { from: "2026-11-05", until: "2027-01-05" } }),
				"2026-12-05",
				"2026-11-02",
			),
		).toBe(message);
	});

	test("a weekly schedule skips on its own weekday only", () => {
		const weekly = sub({
			startDate: "2026-10-01",
			chargesFrom: "2026-10-01",
			cadence: { unit: "week", every: 1 },
		});
		expect(skipIssue(weekly, "2026-11-12", "2026-11-02")).toBeNull();
		expect(skipIssue(weekly, "2026-11-13", "2026-11-02")).toBe(message);
	});

	test("a clamped date can be skipped", () => {
		const monthEnd = sub({ startDate: "2026-01-31", chargesFrom: "2026-01-31" });
		expect(skipIssue(monthEnd, "2026-11-30", "2026-11-02")).toBeNull();
		expect(skipIssue(monthEnd, "2026-11-28", "2026-11-02")).toBe(message);
	});

	test("unskip: a date after C is allowed", () => {
		expect(unskipIssue("2026-11-05", "2026-11-03")).toBeNull();
	});

	// AC-F05-18: "Undo skip on 5 November returns 422".
	test("unskip: the change date and earlier are refused", () => {
		const text = "This charge date has passed, so it can't be brought back.";
		expect(unskipIssue("2026-11-05", "2026-11-05")).toBe(text);
		expect(unskipIssue("2026-11-05", "2026-11-06")).toBe(text);
		expect(unskipIssue("2026-10-10", "2026-11-02")).toBe(text);
	});
});

describe("doubleChargeSkipIssue (BR-F05-31, AC-F05-20)", () => {
	const message = "Choose a date with a charge to skip.";
	const next = { startDate: "2026-09-15", cadence: MONTHLY };

	test("a due date of the new schedule after C is allowed", () => {
		expect(doubleChargeSkipIssue(next, "2026-11-15", "2026-11-06")).toBeNull();
	});

	test("a date that is not a due date of the new schedule is refused", () => {
		expect(doubleChargeSkipIssue(next, "2026-11-05", "2026-11-06")).toBe(
			message,
		);
		expect(doubleChargeSkipIssue(next, "2026-11-16", "2026-11-06")).toBe(
			message,
		);
	});

	test("a due date on or before C is refused", () => {
		expect(doubleChargeSkipIssue(next, "2026-10-15", "2026-11-06")).toBe(
			message,
		);
		expect(doubleChargeSkipIssue(next, "2026-11-15", "2026-11-15")).toBe(
			message,
		);
	});

	test("the day after C is allowed when it is due", () => {
		expect(doubleChargeSkipIssue(next, "2026-11-15", "2026-11-14")).toBeNull();
	});
});

describe("pause (BR-F05-28, BR-F05-29, BR-F05-43)", () => {
	const TODAY = "2026-11-02";
	const LIMIT = "2028-11-02";

	test("a pause may end 24 months after today", () => {
		expect(PAUSE_MONTHS_AHEAD).toBe(24);
		expect(pauseLimit(TODAY)).toBe(LIMIT);
		expect(pauseLimit("2026-02-28")).toBe("2028-02-28");
		expect(pauseLimit("2026-01-31")).toBe("2028-01-31");
		expect(pauseLimit("2028-02-29")).toBe("2030-02-28");
	});

	describe("pausableDates", () => {
		test("golden Netflix on 2 November: 5 Nov, 5 Dec, 5 Jan, then every month", () => {
			const dates = pausableDates(sub(), { changeDate: TODAY, to: LIMIT });
			expect(dates.slice(0, 3)).toEqual([
				"2026-11-05",
				"2026-12-05",
				"2027-01-05",
			]);
			expect(dates).toHaveLength(24);
			expect(dates.at(-1)).toBe("2028-10-05");
		});

		test("starts after the change date: the date C itself is not pausable", () => {
			expect(
				pausableDates(sub(), { changeDate: "2026-11-05", to: "2027-01-31" }),
			).toEqual(["2026-12-05", "2027-01-05"]);
		});

		test("leaves out tombstoned dates", () => {
			expect(
				pausableDates(sub(), {
					changeDate: TODAY,
					skipped: ["2026-11-05"],
					to: "2027-01-31",
				}),
			).toEqual(["2026-12-05", "2027-01-05"]);
		});

		test("ignores the stored pause: it is the one being replaced", () => {
			const paused = sub({
				pause: { from: "2026-11-05", until: "2027-01-05" },
			});
			expect(
				pausableDates(paused, { changeDate: TODAY, to: "2027-01-31" }),
			).toEqual(["2026-11-05", "2026-12-05", "2027-01-05"]);
		});

		test("stops at the end date and starts at chargesFrom", () => {
			expect(
				pausableDates(sub({ endDate: "2026-12-31" }), {
					changeDate: TODAY,
					to: LIMIT,
				}),
			).toEqual(["2026-11-05", "2026-12-05"]);
			expect(
				pausableDates(sub({ chargesFrom: "2026-12-01" }), {
					changeDate: TODAY,
					to: "2027-01-31",
				}),
			).toEqual(["2026-12-05", "2027-01-05"]);
		});

		test("none when nothing is left before the end", () => {
			expect(
				pausableDates(sub({ endDate: "2026-11-03" }), {
					changeDate: TODAY,
					to: LIMIT,
				}),
			).toEqual([]);
		});
	});

	describe("pauseForCount", () => {
		const dates = ["2026-11-05", "2026-12-05", "2027-01-05", "2027-02-05"];

		// F05 section 5: "2 charges" gives { from: 2026-11-05, until: 2027-01-05 }.
		test("golden: 2 charges pause 5 Nov to 5 Jan", () => {
			expect(pauseForCount(dates, 2, LIMIT)).toEqual({
				from: "2026-11-05",
				until: "2027-01-05",
			});
		});

		test("1 and 3 charges", () => {
			expect(pauseForCount(dates, 1, LIMIT)).toEqual({
				from: "2026-11-05",
				until: "2026-12-05",
			});
			expect(pauseForCount(dates, 3, LIMIT)).toEqual({
				from: "2026-11-05",
				until: "2027-02-05",
			});
		});

		test("is null when no date follows the last skipped charge", () => {
			expect(pauseForCount(dates, 4, LIMIT)).toBeNull();
			expect(pauseForCount(dates, 9, LIMIT)).toBeNull();
		});

		test("is null when the resume date is past the limit, and fine on it", () => {
			expect(pauseForCount(dates, 2, "2027-01-04")).toBeNull();
			expect(pauseForCount(dates, 2, "2027-01-05")).toEqual({
				from: "2026-11-05",
				until: "2027-01-05",
			});
		});

		test("is null for no dates", () => {
			expect(pauseForCount([], 1, LIMIT)).toBeNull();
		});
	});

	describe("pausePreview", () => {
		const dates = ["2026-11-05", "2026-12-05", "2027-01-05", "2027-02-05"];

		test("golden: pausing 5 Nov to 5 Jan covers two dates and resumes on 5 Jan", () => {
			expect(
				pausePreview(dates, { from: "2026-11-05", until: "2027-01-05" }),
			).toEqual({
				paused: ["2026-11-05", "2026-12-05"],
				resumeOn: "2027-01-05",
			});
		});

		test("a pause to a date between due dates resumes on the next due date", () => {
			expect(
				pausePreview(dates, { from: "2026-11-05", until: "2026-12-20" }),
			).toEqual({
				paused: ["2026-11-05", "2026-12-05"],
				resumeOn: "2027-01-05",
			});
		});

		test("no date after the pause means nothing resumes", () => {
			expect(
				pausePreview(dates, { from: "2027-01-05", until: "2027-06-01" }),
			).toEqual({
				paused: ["2027-01-05", "2027-02-05"],
				resumeOn: null,
			});
		});

		test("a pause that covers no due date pauses nothing", () => {
			expect(
				pausePreview(dates, { from: "2026-11-06", until: "2026-11-20" }),
			).toEqual({
				paused: [],
				resumeOn: "2026-12-05",
			});
		});
	});

	describe("resumeNowPause", () => {
		const pause = { from: "2026-11-05", until: "2027-01-05" };

		// F05 section 5: Resume now on 10 November sets until to 10 November.
		test("golden: on 10 November a pause in force ends that day", () => {
			expect(resumeNowPause(pause, "2026-11-10")).toEqual({
				from: "2026-11-05",
				until: "2026-11-10",
			});
		});

		test("the day after it started", () => {
			expect(resumeNowPause(pause, "2026-11-06")).toEqual({
				from: "2026-11-05",
				until: "2026-11-06",
			});
		});

		test("before it starts, it is cleared", () => {
			expect(resumeNowPause(pause, "2026-11-02")).toBeNull();
			expect(resumeNowPause(pause, "2026-11-04")).toBeNull();
		});

		test("on its first day, nothing has been paused yet, so it is cleared (D-600)", () => {
			expect(resumeNowPause(pause, "2026-11-05")).toBeNull();
		});

		test("on its last day, until is the change date", () => {
			expect(resumeNowPause(pause, "2027-01-04")).toEqual({
				from: "2026-11-05",
				until: "2027-01-04",
			});
		});
	});

	describe("pauseIssue (AC-F05-28)", () => {
		const issue = (
			next: Pause,
			options: {
				stored?: Pause | null;
				skipped?: string[];
				changeDate?: string;
				today?: string;
				changes?: Partial<Chargeable>;
			} = {},
		) =>
			pauseIssue({
				subscription: sub({
					pause: options.stored ?? null,
					...options.changes,
				}),
				skipped: options.skipped ?? [],
				next,
				changeDate: options.changeDate ?? TODAY,
				today: options.today ?? options.changeDate ?? TODAY,
			});

		const FROM = ["pause", "from"];
		const UNTIL = ["pause", "until"];

		test("golden: a new pause from the next due date to 5 January is fine", () => {
			expect(issue({ from: "2026-11-05", until: "2027-01-05" })).toBeNull();
		});

		test.each([
			["a date that is not the next due date", "2026-12-05"],
			["a day that is not due", "2026-11-06"],
			["the change date, though it is due", "2026-11-02"],
			["a past date", "2026-10-05"],
		])("refuses a start of %s", (_name, from) => {
			expect(issue({ from, until: "2027-06-05" })).toEqual({
				path: FROM,
				message: "Choose a date with a charge to pause from.",
			});
		});

		test("the first date after C is not the next due date when it has a tombstone", () => {
			expect(
				issue(
					{ from: "2026-11-05", until: "2027-01-05" },
					{ skipped: ["2026-11-05"] },
				),
			).toEqual({
				path: FROM,
				message: "Choose a date with a charge to pause from.",
			});
			expect(
				issue(
					{ from: "2026-12-05", until: "2027-01-05" },
					{ skipped: ["2026-11-05"] },
				),
			).toBeNull();
		});

		test("refuses a start when nothing is left to charge", () => {
			expect(
				issue(
					{ from: "2026-11-05", until: "2026-12-05" },
					{ changes: { endDate: "2026-11-02" } },
				),
			).toEqual({
				path: FROM,
				message: "Choose a date with a charge to pause from.",
			});
		});

		test("refuses an end on or before the start: choose a date after 5 Nov", () => {
			for (const until of ["2026-11-05", "2026-11-04", "2026-10-01"]) {
				expect(issue({ from: "2026-11-05", until })).toEqual({
					path: UNTIL,
					message: "Choose a date after 5 Nov.",
				});
			}
		});

		test("takes an end the day after the start", () => {
			expect(issue({ from: "2026-11-05", until: "2026-11-06" })).toBeNull();
		});

		test("refuses an end past 24 months, and takes the limit itself", () => {
			expect(issue({ from: "2026-11-05", until: "2028-11-03" })).toEqual({
				path: UNTIL,
				message: "Choose a date up to 2 Nov 2028.",
			});
			expect(issue({ from: "2026-11-05", until: "2028-11-02" })).toBeNull();
		});

		test("the limit counts from today, not the change date", () => {
			expect(
				issue(
					{ from: "2026-11-05", until: "2028-11-10" },
					{ changeDate: "2026-11-03", today: "2026-11-09" },
				),
			).toEqual({ path: UNTIL, message: "Choose a date up to 9 Nov 2028." });
		});

		test("a start failure is reported before an end failure", () => {
			expect(issue({ from: "2026-12-05", until: "2026-11-01" })?.path).toEqual(
				FROM,
			);
		});

		describe("a pause in force", () => {
			const stored: Pause = { from: "2026-11-05", until: "2027-01-05" };
			const C = "2026-11-10";

			// Resume now on 10 November.
			test("Resume now: the same start, ending on the change date", () => {
				expect(
					issue(
						{ from: "2026-11-05", until: C },
						{ stored, changeDate: C },
					),
				).toBeNull();
			});

			test("Change pause: the same start, a later end", () => {
				expect(
					issue(
						{ from: "2026-11-05", until: "2027-03-05" },
						{ stored, changeDate: C },
					),
				).toBeNull();
			});

			test("an end before the change date is refused: choose a date after 9 Nov", () => {
				expect(
					issue(
						{ from: "2026-11-05", until: "2026-11-09" },
						{ stored, changeDate: C },
					),
				).toEqual({
					path: UNTIL,
					message: "Choose a date after 9 Nov.",
				});
			});

			test("an end past 24 months is refused", () => {
				expect(
					issue(
						{ from: "2026-11-05", until: "2028-11-20" },
						{ stored, changeDate: C, today: C },
					),
				).toEqual({
					path: UNTIL,
					message: "Choose a date up to 10 Nov 2028.",
				});
			});

			test("a pause whose stored end is the change date is still in force, and may keep that end or move it", () => {
				const C = "2027-01-05";
				expect(
					issue(
						{ from: "2026-11-05", until: C },
						{ stored, changeDate: C },
					),
				).toBeNull();
				expect(
					issue(
						{ from: "2026-11-05", until: "2027-03-05" },
						{ stored, changeDate: C },
					),
				).toBeNull();
				expect(
					issue(
						{ from: "2026-11-05", until: "2026-12-05" },
						{ stored, changeDate: C },
					),
				).toEqual({
					path: UNTIL,
					message: "Choose a date after 4 Jan.",
				});
			});

			test("on its first day, an end on the change date is not after the start", () => {
				expect(
					issue(
						{ from: "2026-11-05", until: "2026-11-05" },
						{ stored, changeDate: "2026-11-05" },
					),
				).toEqual({ path: UNTIL, message: "Choose a date after 5 Nov." });
			});

			test("a different start replaces it, and follows the new-pause rules", () => {
				expect(
					issue(
						{ from: "2026-12-05", until: "2027-03-05" },
						{ stored, changeDate: C },
					),
				).toBeNull();
				expect(
					issue(
						{ from: "2026-11-06", until: "2027-03-05" },
						{ stored, changeDate: C },
					),
				).toEqual({
					path: FROM,
					message: "Choose a date with a charge to pause from.",
				});
			});

			test("a pause that has ended is no longer in force: its old start is refused", () => {
				const over: Pause = { from: "2026-09-05", until: "2026-10-05" };
				expect(
					issue(
						{ from: "2026-09-05", until: "2027-01-05" },
						{ stored: over, changeDate: C },
					),
				).toEqual({
					path: FROM,
					message: "Choose a date with a charge to pause from.",
				});
				expect(
					issue(
						{ from: "2026-12-05", until: "2027-01-05" },
						{ stored: over, changeDate: C },
					),
				).toBeNull();
			});
		});

		describe("a pause that has not started", () => {
			const stored: Pause = { from: "2026-11-05", until: "2026-12-05" };

			test("Change pause sends a new pause from the same next due date", () => {
				expect(
					issue({ from: "2026-11-05", until: "2027-03-05" }, { stored }),
				).toBeNull();
			});

			test("the pause being replaced does not hide its own dates from the start check", () => {
				expect(
					issue({ from: "2026-11-05", until: "2026-12-05" }, { stored }),
				).toBeNull();
			});
		});
	});

	describe("chargesFromAfterPause (BR-F05-29, AC-F05-19)", () => {
		const stored: Pause = { from: "2026-11-05", until: "2027-01-05" };
		const after = (
			storedPause: Pause | null,
			newPause: Pause | null,
			changeDate: string,
			chargesFrom = "2026-09-05",
		) =>
			chargesFromAfterPause({
				chargesFrom,
				storedPause,
				newPause,
				changeDate,
			});

		test("no stored pause moves nothing", () => {
			expect(
				after(
					null,
					{ from: "2026-11-05", until: "2027-01-05" },
					"2026-11-02",
				),
			).toBe("2026-09-05");
			expect(after(null, null, "2026-11-02")).toBe("2026-09-05");
		});

		test("a pause that has not started moves nothing, cleared or replaced", () => {
			expect(after(stored, null, "2026-11-02")).toBe("2026-09-05");
			expect(
				after(
					stored,
					{ from: "2026-12-05", until: "2027-02-05" },
					"2026-11-02",
				),
			).toBe("2026-09-05");
		});

		test("a pause that only moves its end moves nothing, started or not", () => {
			expect(
				after(
					stored,
					{ from: "2026-11-05", until: "2027-03-05" },
					"2026-11-10",
				),
			).toBe("2026-09-05");
			expect(
				after(
					stored,
					{ from: "2026-11-05", until: "2026-11-10" },
					"2026-11-10",
				),
			).toBe("2026-09-05");
		});

		test("clearing a started pause moves chargesFrom to the change date when that is before its end", () => {
			expect(after(stored, null, "2026-11-10")).toBe("2026-11-10");
		});

		test("clearing a pause that has already ended moves chargesFrom to its end", () => {
			expect(after(stored, null, "2027-02-01")).toBe("2027-01-05");
		});

		// AC-F05-19: Resume now on 10 November, then a later pause that replaces it.
		test("golden: replacing the resumed pause on 20 November never charges 5 November", () => {
			const resumed: Pause = { from: "2026-11-05", until: "2026-11-10" };
			expect(
				after(
					resumed,
					{ from: "2026-12-05", until: "2027-02-05" },
					"2026-11-20",
				),
			).toBe("2026-11-10");
		});

		test("a started pause replaced by one with another start moves chargesFrom the same way", () => {
			expect(
				after(
					stored,
					{ from: "2026-12-05", until: "2027-02-05" },
					"2026-11-10",
				),
			).toBe("2026-11-10");
		});

		test("never moves chargesFrom earlier", () => {
			expect(after(stored, null, "2026-11-10", "2026-12-20")).toBe(
				"2026-12-20",
			);
		});

		test("a pause that starts on the change date has started", () => {
			expect(after(stored, null, "2026-11-05")).toBe("2026-11-05");
		});
	});
});
