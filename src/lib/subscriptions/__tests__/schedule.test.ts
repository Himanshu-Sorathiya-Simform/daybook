import { describe, expect, test } from "vitest";

import { goldenSubscription, GOLDEN_TODAY } from "./golden";
import {
	addPeriod,
	type Cadence,
	type Chargeable,
	catchUpDates,
	chargeableDates,
	dueAt,
	dueDates,
	inPause,
	isCadence,
	isChargeable,
	isDueDate,
	MAX_EVERY,
	NEXT_DUE_HORIZON_MONTHS,
	nextDueOn,
	PRESETS,
	presetOf,
	sameCadence,
} from "../schedule";

const WEEKLY: Cadence = { unit: "week", every: 1 };
const MONTHLY: Cadence = { unit: "month", every: 1 };

const rules = (changes: Partial<Chargeable> = {}): Chargeable => ({
	startDate: "2026-09-05",
	cadence: MONTHLY,
	chargesFrom: "2026-09-05",
	endDate: null,
	pause: null,
	...changes,
});

// An oracle that shares no code with the module: plain UTC arithmetic and a hand-written
// clamp, so a mistake in the date helpers can't hide in both.
const pad = (n: number) => String(n).padStart(2, "0");
const iso = (t: number) => {
	const d = new Date(t);
	return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
};
function oracleDue(start: string, cadence: Cadence, k: number): string {
	const [y, m, d] = start.split("-").map(Number) as [number, number, number];
	if (cadence.unit === "week")
		return iso(Date.UTC(y, m - 1, d + 7 * cadence.every * k));
	const total = y * 12 + (m - 1) + cadence.every * k;
	const year = Math.floor(total / 12);
	const month = total % 12;
	const last = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
	return `${year}-${pad(month + 1)}-${pad(Math.min(d, last))}`;
}
function oracleDates(start: string, cadence: Cadence, from: string, to: string) {
	const dates: string[] = [];
	for (let k = 0; k < 10000; k++) {
		const date = oracleDue(start, cadence, k);
		if (date > to) break;
		if (date >= from) dates.push(date);
	}
	return dates;
}

describe("dueDates (BR-F05-01, AC-F05-01)", () => {
	// AC-F05-01: every row of BR-F05-01's table.
	test.each([
		[
			"2026-01-31",
			MONTHLY,
			"2026-01-31",
			"2026-04-30",
			["2026-01-31", "2026-02-28", "2026-03-31", "2026-04-30"],
		],
		[
			"2028-02-29",
			{ unit: "month", every: 12 },
			"2028-02-29",
			"2032-02-29",
			["2028-02-29", "2029-02-28", "2030-02-28", "2031-02-28", "2032-02-29"],
		],
		[
			"2026-11-30",
			{ unit: "month", every: 3 },
			"2026-11-30",
			"2027-08-30",
			["2026-11-30", "2027-02-28", "2027-05-30", "2027-08-30"],
		],
		[
			"2026-10-12",
			{ unit: "month", every: 12 },
			"2026-10-12",
			"2027-10-12",
			["2026-10-12", "2027-10-12"],
		],
		[
			"2026-01-31",
			{ unit: "month", every: 2 },
			"2026-01-31",
			"2026-07-31",
			["2026-01-31", "2026-03-31", "2026-05-31", "2026-07-31"],
		],
		[
			"2026-08-31",
			{ unit: "month", every: 5 },
			"2026-08-31",
			"2027-11-30",
			["2026-08-31", "2027-01-31", "2027-06-30", "2027-11-30"],
		],
		[
			"2026-10-01",
			{ unit: "week", every: 2 },
			"2026-10-01",
			"2026-11-12",
			["2026-10-01", "2026-10-15", "2026-10-29", "2026-11-12"],
		],
	] as [string, Cadence, string, string, string[]][])(
		"%s %j gives the table's dates",
		(startDate, cadence, from, to, expected) => {
			expect(dueDates({ startDate, cadence }, from, to)).toEqual(expected);
		},
	);

	test("returns an empty list when the range is backwards", () => {
		expect(dueDates(rules(), "2026-11-05", "2026-11-04")).toEqual([]);
	});

	test("returns an empty list when no due date falls in the range", () => {
		expect(dueDates(rules(), "2026-09-06", "2026-10-04")).toEqual([]);
	});

	test("includes both ends of the range", () => {
		expect(dueDates(rules(), "2026-09-05", "2026-11-05")).toEqual([
			"2026-09-05",
			"2026-10-05",
			"2026-11-05",
		]);
	});

	test("a one-day range finds a due date and misses the days around it", () => {
		expect(dueDates(rules(), "2026-10-05", "2026-10-05")).toEqual([
			"2026-10-05",
		]);
		expect(dueDates(rules(), "2026-10-04", "2026-10-04")).toEqual([]);
		expect(dueDates(rules(), "2026-10-06", "2026-10-06")).toEqual([]);
	});

	test("starts at the start date, never before it", () => {
		expect(dueDates(rules(), "2020-01-01", "2026-09-30")).toEqual([
			"2026-09-05",
		]);
	});

	test("a range wholly before the start is empty", () => {
		expect(dueDates(rules(), "2020-01-01", "2026-09-04")).toEqual([]);
	});

	test("clamps the 31st in short months and returns to it", () => {
		expect(
			dueDates(
				{ startDate: "2026-01-31", cadence: MONTHLY },
				"2026-01-01",
				"2026-12-31",
			),
		).toEqual([
			"2026-01-31",
			"2026-02-28",
			"2026-03-31",
			"2026-04-30",
			"2026-05-31",
			"2026-06-30",
			"2026-07-31",
			"2026-08-31",
			"2026-09-30",
			"2026-10-31",
			"2026-11-30",
			"2026-12-31",
		]);
	});

	test("counts from the start, so a clamped date does not drag later ones down", () => {
		// From the previous date, 28 Feb + 1 month would be 28 Mar, not 31 Mar.
		expect(dueAt({ startDate: "2026-01-31", cadence: MONTHLY }, 2)).toBe(
			"2026-03-31",
		);
	});

	test("a yearly 29 February charges on 28 February and returns to the 29th", () => {
		const schedule = {
			startDate: "2028-02-29",
			cadence: { unit: "month", every: 12 } as Cadence,
		};
		expect(dueAt(schedule, 1)).toBe("2029-02-28");
		expect(dueAt(schedule, 4)).toBe("2032-02-29");
		expect(dueAt(schedule, 8)).toBe("2036-02-29");
	});

	test("a weekly Subscription keeps its weekday across a year-end and a leap day", () => {
		const dates = dueDates(
			{ startDate: "2027-12-23", cadence: WEEKLY },
			"2027-12-23",
			"2028-03-08",
		);
		expect(dates).toContain("2027-12-30");
		expect(dates).toContain("2028-01-06");
		expect(dates).toContain("2028-02-24");
		expect(dates).toContain("2028-03-02");
		expect(dates).not.toContain("2028-02-29");
		// 9 March is the next date, so a range to the 8th ends on the 2nd.
		expect(dates.at(-1)).toBe("2028-03-02");
	});

	test("every 3 weeks lands on the 21st day each time", () => {
		expect(
			dueDates(
				{ startDate: "2026-10-01", cadence: { unit: "week", every: 3 } },
				"2026-10-01",
				"2026-12-31",
			),
		).toEqual([
			"2026-10-01",
			"2026-10-22",
			"2026-11-12",
			"2026-12-03",
			"2026-12-24",
		]);
	});

	test("every 52 weeks and every 24 months, the largest cadences, still repeat", () => {
		expect(
			dueDates(
				{ startDate: "2026-01-01", cadence: { unit: "week", every: 52 } },
				"2026-01-01",
				"2028-12-31",
			),
		).toEqual(["2026-01-01", "2026-12-31", "2027-12-30", "2028-12-28"]);
		expect(
			dueDates(
				{ startDate: "2026-01-31", cadence: { unit: "month", every: 24 } },
				"2026-01-01",
				"2032-12-31",
			),
		).toEqual(["2026-01-31", "2028-01-31", "2030-01-31", "2032-01-31"]);
	});

	test("a daylight-saving week is still seven calendar days", () => {
		// 1 Nov 2026 is the end of daylight saving in Los Angeles; dates never read a zone.
		expect(
			dueDates(
				{ startDate: "2026-10-26", cadence: WEEKLY },
				"2026-10-26",
				"2026-11-16",
			),
		).toEqual(["2026-10-26", "2026-11-02", "2026-11-09", "2026-11-16"]);
	});

	// A weekly Subscription started 10 years ago has about 520 due dates (section 13).
	test("a weekly Subscription started 10 years ago has every date through today: 522", () => {
		const dates = dueDates(
			{ startDate: "2016-11-03", cadence: WEEKLY },
			"2016-11-03",
			"2026-11-02",
		);
		const days = (Date.UTC(2026, 10, 2) - Date.UTC(2016, 10, 3)) / 86_400_000;
		expect(dates).toHaveLength(Math.floor(days / 7) + 1);
		expect(dates).toHaveLength(522);
		expect(dates[0]).toBe("2016-11-03");
		expect(dates.at(-1)).toBe("2026-10-29");
	});

	describe("agrees with an independent calculation", () => {
		const starts = [
			"2026-01-01",
			"2026-01-29",
			"2026-01-30",
			"2026-01-31",
			"2026-02-28",
			"2028-02-29",
			"2026-03-31",
			"2026-08-31",
			"2026-12-31",
			"2024-02-29",
		];
		const cadences: Cadence[] = [
			{ unit: "week", every: 1 },
			{ unit: "week", every: 2 },
			{ unit: "week", every: 3 },
			{ unit: "week", every: 52 },
			{ unit: "month", every: 1 },
			{ unit: "month", every: 2 },
			{ unit: "month", every: 3 },
			{ unit: "month", every: 5 },
			{ unit: "month", every: 12 },
			{ unit: "month", every: 24 },
		];

		test.each(
			starts.flatMap((start) => cadences.map((c) => [start, c] as const)),
		)("%s %j, from the start", (startDate, cadence) => {
			expect(
				dueDates({ startDate, cadence }, startDate, "2034-12-31"),
			).toEqual(oracleDates(startDate, cadence, startDate, "2034-12-31"));
		});

		// The shortcut to the first date must never skip a date on or after `from`: try `from`
		// on every day of 2027, on and around due dates and clamped ones.
		test.each([
			["2026-01-31", MONTHLY],
			["2026-08-31", { unit: "month", every: 5 } as Cadence],
			["2028-02-29", { unit: "month", every: 12 } as Cadence],
			["2026-10-01", { unit: "week", every: 3 } as Cadence],
			["2026-01-01", WEEKLY],
		] as const)(
			"%s %j, from every day of 2027",
			(startDate, cadence) => {
				for (
					let t = Date.UTC(2027, 0, 1);
					t <= Date.UTC(2027, 11, 31);
					t += 86_400_000
				) {
					const from = iso(t);
					expect(
						dueDates({ startDate, cadence }, from, "2028-06-30"),
					).toEqual(oracleDates(startDate, cadence, from, "2028-06-30"));
				}
			},
			30_000,
		);
	});
});

describe("isDueDate", () => {
	test.each([
		["2026-09-05", true],
		["2026-10-05", true],
		["2026-10-04", false],
		["2026-10-06", false],
		["2026-08-05", false],
		["2030-02-05", true],
	])("%s is a due date of a monthly schedule from 5 Sep: %s", (date, expected) => {
		expect(isDueDate(rules(), date)).toBe(expected);
	});

	test("a clamped date is a due date, and the day it was clamped from is not", () => {
		const schedule = { startDate: "2026-01-31", cadence: MONTHLY };
		expect(isDueDate(schedule, "2026-02-28")).toBe(true);
		expect(isDueDate(schedule, "2026-02-27")).toBe(false);
		expect(isDueDate(schedule, "2026-03-28")).toBe(false);
		expect(isDueDate(schedule, "2026-03-31")).toBe(true);
	});

	test("a weekly schedule has every seventh day", () => {
		const schedule = { startDate: "2026-10-01", cadence: WEEKLY };
		expect(isDueDate(schedule, "2026-11-12")).toBe(true);
		expect(isDueDate(schedule, "2026-11-13")).toBe(false);
	});
});

describe("isCadence (D-90)", () => {
	test.each([
		[{ unit: "week", every: 1 }],
		[{ unit: "week", every: 52 }],
		[{ unit: "month", every: 1 }],
		[{ unit: "month", every: 24 }],
		[{ unit: "month", every: 12 }],
	])("takes %j", (value) => {
		expect(isCadence(value)).toBe(true);
	});

	test.each([
		["0 weeks", { unit: "week", every: 0 }],
		["53 weeks", { unit: "week", every: 53 }],
		["0 months", { unit: "month", every: 0 }],
		["25 months", { unit: "month", every: 25 }],
		["52 months, the weeks' limit", { unit: "month", every: 52 }],
		["a negative number", { unit: "week", every: -1 }],
		["a fraction", { unit: "month", every: 1.5 }],
		["text for every", { unit: "month", every: "2" }],
		["NaN", { unit: "month", every: Number.NaN }],
		["infinity", { unit: "week", every: Number.POSITIVE_INFINITY }],
		["a unit in days", { unit: "day", every: 10 }],
		["a unit in capitals", { unit: "WEEK", every: 1 }],
		["no unit", { every: 1 }],
		["no every", { unit: "week" }],
		["null", null],
		["a string", "monthly"],
		["a number", 1],
		["undefined", undefined],
		["an array", ["month", 1]],
	])("refuses %s", (_name, value) => {
		expect(isCadence(value)).toBe(false);
	});

	test("the limits are 52 weeks and 24 months", () => {
		expect(MAX_EVERY).toEqual({ week: 52, month: 24 });
	});
});

describe("presets (D-90)", () => {
	test("are weekly, monthly, every 3 months and yearly", () => {
		expect(PRESETS).toEqual({
			weekly: { unit: "week", every: 1 },
			monthly: { unit: "month", every: 1 },
			quarterly: { unit: "month", every: 3 },
			yearly: { unit: "month", every: 12 },
		});
	});

	test.each([
		[{ unit: "week", every: 1 }, "weekly"],
		[{ unit: "month", every: 1 }, "monthly"],
		[{ unit: "month", every: 3 }, "quarterly"],
		[{ unit: "month", every: 12 }, "yearly"],
	] as const)("%j is %s", (cadence, key) => {
		expect(presetOf({ ...cadence })).toBe(key);
	});

	test.each([
		[{ unit: "week", every: 2 }],
		[{ unit: "week", every: 12 }],
		[{ unit: "week", every: 52 }],
		[{ unit: "month", every: 2 }],
		[{ unit: "month", every: 4 }],
		[{ unit: "month", every: 6 }],
		[{ unit: "month", every: 24 }],
	] as const)("%j is custom", (cadence) => {
		expect(presetOf({ ...cadence })).toBe("custom");
	});

	// A custom choice equal to a preset is stored as it: same object shape either way.
	test("a custom choice equal to a preset reads as that preset", () => {
		expect(presetOf({ unit: "month", every: 3 })).toBe("quarterly");
		expect(presetOf({ unit: "week", every: 1 })).toBe("weekly");
	});

	test("sameCadence compares unit and every", () => {
		expect(
			sameCadence({ unit: "week", every: 2 }, { unit: "week", every: 2 }),
		).toBe(true);
		expect(
			sameCadence({ unit: "week", every: 2 }, { unit: "week", every: 3 }),
		).toBe(false);
		expect(
			sameCadence({ unit: "week", every: 1 }, { unit: "month", every: 1 }),
		).toBe(false);
	});
});

describe("addPeriod", () => {
	test.each([
		[{ unit: "week", every: 1 }, "2026-10-05", "2026-10-12"],
		[{ unit: "week", every: 2 }, "2026-10-05", "2026-10-19"],
		[{ unit: "week", every: 52 }, "2026-10-05", "2027-10-04"],
		[{ unit: "month", every: 1 }, "2026-10-05", "2026-11-05"],
		[{ unit: "month", every: 1 }, "2026-01-31", "2026-02-28"],
		[{ unit: "month", every: 3 }, "2026-11-30", "2027-02-28"],
		[{ unit: "month", every: 12 }, "2028-02-29", "2029-02-28"],
		[{ unit: "month", every: 24 }, "2026-10-05", "2028-10-05"],
	] as const)("%j after %s is %s", (cadence, date, expected) => {
		expect(addPeriod({ ...cadence }, date)).toBe(expected);
	});
});

describe("inPause (BR-F05-28)", () => {
	const pause = { from: "2026-11-05", until: "2027-01-05" };

	test("includes the first day and leaves out the day it ends", () => {
		expect(inPause(pause, "2026-11-05")).toBe(true);
		expect(inPause(pause, "2027-01-04")).toBe(true);
		expect(inPause(pause, "2027-01-05")).toBe(false);
	});

	test("leaves out the days before and after", () => {
		expect(inPause(pause, "2026-11-04")).toBe(false);
		expect(inPause(pause, "2027-02-05")).toBe(false);
	});

	test("a pause of one day holds only its first day", () => {
		const one = { from: "2026-11-05", until: "2026-11-06" };
		expect(inPause(one, "2026-11-05")).toBe(true);
		expect(inPause(one, "2026-11-06")).toBe(false);
	});

	test("no pause pauses nothing", () => {
		expect(inPause(null, "2026-11-05")).toBe(false);
	});
});

describe("isChargeable and chargeableDates (BR-F05-02)", () => {
	test("a date before chargesFrom is not chargeable, and chargesFrom itself is", () => {
		const sub = rules({ chargesFrom: "2026-10-05" });
		expect(isChargeable(sub, "2026-09-05")).toBe(false);
		expect(isChargeable(sub, "2026-10-05")).toBe(true);
	});

	test("the end date is chargeable, the day after is not", () => {
		const sub = rules({ endDate: "2026-12-05" });
		expect(isChargeable(sub, "2026-12-05")).toBe(true);
		expect(isChargeable(sub, "2027-01-05")).toBe(false);
		expect(isChargeable(sub, "2026-12-06")).toBe(false);
	});

	test("no end date has no last date", () => {
		expect(isChargeable(rules(), "2099-12-05")).toBe(true);
	});

	test("a paused date is not chargeable unless the pause is ignored", () => {
		const sub = rules({ pause: { from: "2026-11-05", until: "2027-01-05" } });
		expect(isChargeable(sub, "2026-12-05")).toBe(false);
		expect(isChargeable(sub, "2026-12-05", { ignorePause: true })).toBe(true);
		expect(isChargeable(sub, "2027-01-05")).toBe(true);
	});

	test("chargeableDates clips to chargesFrom, the end date and the pause", () => {
		const sub = rules({
			chargesFrom: "2026-10-05",
			endDate: "2027-03-05",
			pause: { from: "2026-12-05", until: "2027-02-05" },
		});
		expect(chargeableDates(sub, "2026-01-01", "2030-01-01")).toEqual([
			"2026-10-05",
			"2026-11-05",
			"2027-02-05",
			"2027-03-05",
		]);
		expect(
			chargeableDates(sub, "2026-01-01", "2030-01-01", { ignorePause: true }),
		).toEqual([
			"2026-10-05",
			"2026-11-05",
			"2026-12-05",
			"2027-01-05",
			"2027-02-05",
			"2027-03-05",
		]);
	});

	test("chargeableDates respects from and to inside the allowed range", () => {
		expect(chargeableDates(rules(), "2026-10-05", "2026-11-05")).toEqual([
			"2026-10-05",
			"2026-11-05",
		]);
	});

	test("an end date before chargesFrom leaves nothing to charge (section 13)", () => {
		const sub = rules({ chargesFrom: "2026-11-03", endDate: "2026-10-31" });
		expect(chargeableDates(sub, "2026-01-01", "2030-01-01")).toEqual([]);
	});
});

describe("catchUpDates (BR-F05-02, AC-F05-03, AC-F05-09)", () => {
	// golden: "Catch-up on 2 November ... creates row 27 (Sunrise Apartments, due 1 November)".
	test("golden: Sunrise Apartments with #1 and #12 charged needs exactly 1 November", () => {
		const sunrise = goldenSubscription("sunrise");
		expect(
			catchUpDates(sunrise, {
				through: GOLDEN_TODAY,
				today: GOLDEN_TODAY,
				charged: ["2026-09-01", "2026-10-01"],
			}),
		).toEqual(["2026-11-01"]);
	});

	// The fixture holds #27 too, so once catch-up has run there is nothing left to create.
	test("golden: with every charge in place there is nothing to create", () => {
		for (const name of [
			"sunrise",
			"netflix",
			"cultGym",
			"amazonPrime",
		] as const) {
			const sub = goldenSubscription(name);
			expect(
				catchUpDates(sub, {
					through: GOLDEN_TODAY,
					today: GOLDEN_TODAY,
					charged: sub.charged,
					skipped: sub.skipped,
				}),
			).toEqual([]);
		}
	});

	// golden: Cult Gym's 10 October charge is a tombstone, so it is never recreated.
	test("golden: Cult Gym's tombstone for 10 October is never charged", () => {
		const gym = goldenSubscription("cultGym");
		expect(
			catchUpDates(gym, {
				through: GOLDEN_TODAY,
				today: GOLDEN_TODAY,
				skipped: gym.skipped,
			}),
		).toEqual(["2026-09-10"]);
		expect(
			catchUpDates(gym, { through: GOLDEN_TODAY, today: GOLDEN_TODAY }),
		).toEqual(["2026-09-10", "2026-10-10"]);
	});

	test("never charges a date after today, whatever `through` says", () => {
		const dates = catchUpDates(rules(), {
			through: "2027-12-31",
			today: "2026-11-02",
		});
		expect(dates).toEqual(["2026-09-05", "2026-10-05"]);
	});

	test("stops at `through` when it is before today", () => {
		expect(
			catchUpDates(rules(), { through: "2026-09-30", today: "2026-11-02" }),
		).toEqual(["2026-09-05"]);
	});

	test("a date due today is charged, and one due tomorrow is not", () => {
		expect(
			catchUpDates(rules(), { through: "2026-11-05", today: "2026-11-05" }),
		).toEqual(["2026-09-05", "2026-10-05", "2026-11-05"]);
		expect(
			catchUpDates(rules(), { through: "2026-11-05", today: "2026-11-04" }),
		).toEqual(["2026-09-05", "2026-10-05"]);
	});

	test("starts at chargesFrom: months before it are never charged", () => {
		expect(
			catchUpDates(rules({ chargesFrom: "2026-10-03" }), {
				through: "2026-11-05",
				today: "2026-11-05",
			}),
		).toEqual(["2026-10-05", "2026-11-05"]);
	});

	test("stops at the end date, which is itself charged", () => {
		expect(
			catchUpDates(rules({ endDate: "2026-10-05" }), {
				through: "2026-11-05",
				today: "2026-11-05",
			}),
		).toEqual(["2026-09-05", "2026-10-05"]);
	});

	test("leaves out paused dates and skipped ones, and those already charged", () => {
		const sub = rules({ pause: { from: "2026-10-05", until: "2026-11-05" } });
		expect(
			catchUpDates(sub, { through: "2026-12-05", today: "2026-12-05" }),
		).toEqual(["2026-09-05", "2026-11-05", "2026-12-05"]);
		expect(
			catchUpDates(rules(), {
				through: "2026-12-05",
				today: "2026-12-05",
				skipped: ["2026-10-05"],
				charged: ["2026-09-05"],
			}),
		).toEqual(["2026-11-05", "2026-12-05"]);
	});

	test("a skipped date inside a pause stays skipped after the pause ends", () => {
		const sub = rules({ pause: { from: "2026-10-05", until: "2026-12-05" } });
		expect(
			catchUpDates(sub, {
				through: "2027-01-05",
				today: "2027-01-05",
				skipped: ["2026-11-05"],
			}),
		).toEqual(["2026-09-05", "2026-12-05", "2027-01-05"]);
	});

	test("an upcoming Subscription has nothing to charge", () => {
		expect(
			catchUpDates(
				rules({ startDate: "2026-12-05", chargesFrom: "2026-12-05" }),
				{
					through: "2026-11-02",
					today: "2026-11-02",
				},
			),
		).toEqual([]);
	});

	test("`through` before chargesFrom has nothing to charge", () => {
		expect(
			catchUpDates(rules({ chargesFrom: "2026-11-01" }), {
				through: "2026-10-31",
				today: "2026-11-02",
			}),
		).toEqual([]);
	});

	test("an end date before chargesFrom charges nothing (section 13)", () => {
		expect(
			catchUpDates(
				rules({ chargesFrom: "2026-11-03", endDate: "2026-10-31" }),
				{
					through: "2026-12-31",
					today: "2026-12-31",
				},
			),
		).toEqual([]);
	});

	test("a long absence charges every missed date, each on its own day", () => {
		const dates = catchUpDates(rules({ chargesFrom: "2026-09-05" }), {
			through: "2027-09-05",
			today: "2027-09-05",
		});
		expect(dates).toHaveLength(13);
		expect(dates[0]).toBe("2026-09-05");
		expect(dates.at(-1)).toBe("2027-09-05");
	});

	// AC-F05-04: a weekly Subscription started 10 years ago, with backfill.
	test("a weekly backfill of 10 years gives 522 dates in one call", () => {
		const sub = rules({
			startDate: "2016-11-03",
			cadence: WEEKLY,
			chargesFrom: "2016-11-03",
		});
		expect(
			catchUpDates(sub, { through: "2026-11-02", today: "2026-11-02" }),
		).toHaveLength(522);
	});

	test("takes any iterable for the dates it leaves out", () => {
		expect(
			catchUpDates(rules(), {
				through: "2026-11-05",
				today: "2026-11-05",
				skipped: new Set(["2026-10-05"]),
				charged: new Set(["2026-09-05"]),
			}),
		).toEqual(["2026-11-05"]);
	});
});

describe("nextDueOn (BR-F05-19)", () => {
	// golden: Subscriptions (as of 2 November), Next due.
	test.each([
		["netflix", "2026-11-05"],
		["cultGym", "2026-11-10"],
		["sunrise", "2026-12-01"],
		["amazonPrime", "2027-10-12"],
	] as const)("golden %s is %s on 2 November", (name, expected) => {
		const sub = goldenSubscription(name);
		expect(
			nextDueOn(sub, {
				today: GOLDEN_TODAY,
				charged: sub.charged,
				skipped: sub.skipped,
			}),
		).toBe(expected);
	});

	// golden: "1 November is already charged", and before catch-up it is behind today anyway.
	test("Sunrise Apartments' next due is 1 December with or without #27", () => {
		const sub = goldenSubscription("sunrise");
		const withoutRow27 = sub.charged.filter((date) => date !== "2026-11-01");
		expect(withoutRow27).toEqual(["2026-09-01", "2026-10-01"]);
		expect(nextDueOn(sub, { today: GOLDEN_TODAY, charged: withoutRow27 })).toBe(
			"2026-12-01",
		);
		expect(nextDueOn(sub, { today: GOLDEN_TODAY, charged: sub.charged })).toBe(
			"2026-12-01",
		);
	});

	test("a date due today with no charge yet is the next due", () => {
		expect(
			nextDueOn(rules(), {
				today: "2026-11-05",
				charged: ["2026-09-05", "2026-10-05"],
			}),
		).toBe("2026-11-05");
	});

	test("a date due today that is already charged is not", () => {
		expect(
			nextDueOn(rules(), {
				today: "2026-11-05",
				charged: ["2026-09-05", "2026-10-05", "2026-11-05"],
			}),
		).toBe("2026-12-05");
	});

	test("a skipped date is passed over (golden: skipping Netflix's 5 November)", () => {
		const netflix = goldenSubscription("netflix");
		expect(
			nextDueOn(netflix, {
				today: GOLDEN_TODAY,
				charged: netflix.charged,
				skipped: ["2026-11-05"],
			}),
		).toBe("2026-12-05");
	});

	test("a paused Subscription's next due is the first date after its pause (golden pause)", () => {
		const netflix = goldenSubscription("netflix");
		netflix.pause = { from: "2026-11-05", until: "2027-01-05" };
		expect(
			nextDueOn(netflix, { today: GOLDEN_TODAY, charged: netflix.charged }),
		).toBe("2027-01-05");
	});

	test("a pause that ends on a due date lets that date through", () => {
		expect(
			nextDueOn(
				rules({ pause: { from: "2026-11-05", until: "2026-12-05" } }),
				{
					today: "2026-11-02",
					charged: ["2026-09-05", "2026-10-05"],
				},
			),
		).toBe("2026-12-05");
	});

	test("an upcoming Subscription's next due is its start date", () => {
		expect(
			nextDueOn(
				rules({ startDate: "2026-12-05", chargesFrom: "2026-12-05" }),
				{
					today: "2026-11-02",
				},
			),
		).toBe("2026-12-05");
	});

	test("chargesFrom after the start moves the first date", () => {
		expect(
			nextDueOn(rules({ chargesFrom: "2026-12-01" }), { today: "2026-11-02" }),
		).toBe("2026-12-05");
	});

	test("an ended Subscription has no next due", () => {
		expect(
			nextDueOn(rules({ endDate: "2026-10-31" }), { today: "2026-11-02" }),
		).toBeNull();
	});

	test("an end date of today leaves today's due date, if it has not been charged", () => {
		expect(
			nextDueOn(rules({ endDate: "2026-11-05" }), {
				today: "2026-11-05",
				charged: ["2026-09-05", "2026-10-05"],
			}),
		).toBe("2026-11-05");
		expect(
			nextDueOn(rules({ endDate: "2026-11-05" }), {
				today: "2026-11-05",
				charged: ["2026-09-05", "2026-10-05", "2026-11-05"],
			}),
		).toBeNull();
	});

	test("skipping the only date left before the end leaves none (section 13)", () => {
		expect(
			nextDueOn(rules({ endDate: "2026-11-30" }), {
				today: "2026-11-02",
				charged: ["2026-09-05", "2026-10-05"],
				skipped: ["2026-11-05"],
			}),
		).toBeNull();
	});

	test("a pause that covers every date up to the end leaves none", () => {
		expect(
			nextDueOn(
				rules({
					endDate: "2026-12-31",
					pause: { from: "2026-11-05", until: "2027-06-05" },
				}),
				{ today: "2026-11-02", charged: ["2026-09-05", "2026-10-05"] },
			),
		).toBeNull();
	});

	test("an end date before chargesFrom leaves none", () => {
		expect(
			nextDueOn(rules({ chargesFrom: "2026-11-03", endDate: "2026-10-31" }), {
				today: "2026-11-02",
			}),
		).toBeNull();
	});

	test("skipped dates in a row are all passed over", () => {
		expect(
			nextDueOn(rules(), {
				today: "2026-11-02",
				charged: ["2026-09-05", "2026-10-05"],
				skipped: ["2026-11-05", "2026-12-05", "2027-01-05"],
			}),
		).toBe("2027-02-05");
	});

	test("a weekly Subscription's next due is the next seventh day", () => {
		expect(
			nextDueOn(
				rules({
					startDate: "2026-10-01",
					cadence: WEEKLY,
					chargesFrom: "2026-10-01",
				}),
				{
					today: "2026-11-02",
				},
			),
		).toBe("2026-11-05");
	});

	test("looks 120 months ahead and no further", () => {
		expect(NEXT_DUE_HORIZON_MONTHS).toBe(120);
		const sub = rules({ startDate: "2026-11-05", chargesFrom: "2026-11-05" });
		const skippedFor = (months: number) =>
			Array.from({ length: months }, (_, k) => dueAt(sub, k));
		// The horizon is 2036-11-02. Date 119, 5 Oct 2036, is inside it; date 120, 5 Nov 2036, is not.
		expect(
			nextDueOn(sub, { today: "2026-11-02", skipped: skippedFor(119) }),
		).toBe("2036-10-05");
		expect(
			nextDueOn(sub, { today: "2026-11-02", skipped: skippedFor(120) }),
		).toBeNull();
	});

	test("takes any iterable for the dates it leaves out", () => {
		expect(
			nextDueOn(rules(), {
				today: "2026-11-02",
				charged: new Set(["2026-09-05", "2026-10-05"]),
				skipped: new Set(["2026-11-05"]),
			}),
		).toBe("2026-12-05");
	});

	test("a Subscription due on the 31st finds the clamped date in a short month", () => {
		expect(
			nextDueOn(
				rules({ startDate: "2026-01-31", chargesFrom: "2026-01-31" }),
				{ today: "2026-02-01" },
			),
		).toBe("2026-02-28");
	});
});
