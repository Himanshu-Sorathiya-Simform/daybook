import { describe, expect, test } from "vitest";

import { GOLDEN_NOW } from "../../../../seed/golden";
import {
	currentMonth,
	firstDayOf,
	inRange,
	isMonth,
	lastDayOf,
	MONTHS_AHEAD,
	MONTHS_BACK,
	monthOf,
	monthRange,
	monthsFrom,
	monthsStarting,
	RESTORE_FIRST,
	RESTORE_LAST,
	shiftMonth,
} from "../months";

describe("isMonth", () => {
	test.each(["2026-11", "2026-01", "2026-12", "2000-01", "2099-12", "0001-01"])(
		"accepts %s",
		(value) => {
			expect(isMonth(value)).toBe(true);
		},
	);

	test.each([
		["month 13", "2026-13"],
		["month 00", "2026-00"],
		["a one-digit month", "2026-1"],
		["a two-digit year", "26-11"],
		["a three-digit month", "2026-011"],
		["a full date", "2026-11-01"],
		["a slash", "2026/11"],
		["no separator", "202611"],
		["a letter in the month", "2026-1a"],
		["a leading space", " 2026-11"],
		["a trailing space", "2026-11 "],
		["a trailing line feed", "2026-11\n"],
		["full-width digits", "２０２６-１１"],
		["the empty string", ""],
		["a five-digit year", "20260-11"],
		["a negative year", "-2026-11"],
	])("refuses %s", (_name, value) => {
		expect(isMonth(value)).toBe(false);
	});

	test.each([
		["a number", 202611],
		["null", null],
		["undefined", undefined],
		["an object", { month: "2026-11" }],
		["an array", ["2026-11"]],
		["a Date", new Date(GOLDEN_NOW)],
	])("refuses %s", (_name, value) => {
		expect(isMonth(value)).toBe(false);
	});
});

describe("shiftMonth", () => {
	test.each([
		["2026-11", 0, "2026-11"],
		["2026-11", 1, "2026-12"],
		["2026-12", 1, "2027-01"],
		["2026-01", -1, "2025-12"],
		["2026-11", -36, "2023-11"],
		["2026-11", 12, "2027-11"],
		["2026-11", -1200, "1926-11"],
		["2028-02", 12, "2029-02"],
		["2026-03", -13, "2025-02"],
	])("%s shifted by %i is %s", (month, count, expected) => {
		expect(shiftMonth(month, count)).toBe(expected);
	});
});

describe("monthsFrom", () => {
	test.each([
		["2026-11", "2026-11", 0],
		["2026-10", "2026-11", 1],
		["2026-11", "2026-10", -1],
		["2026-12", "2027-01", 1],
		["2023-11", "2026-11", 36],
		["2026-11", "2027-11", 12],
		["2027-01", "2026-12", -1],
	])("from %s to %s is %i", (from, to, expected) => {
		expect(monthsFrom(from, to)).toBe(expected);
	});

	test("undoes shiftMonth for every offset in the range", () => {
		for (let count = -MONTHS_BACK; count <= MONTHS_AHEAD; count += 1) {
			expect(monthsFrom("2026-11", shiftMonth("2026-11", count))).toBe(count);
		}
	});
});

describe("monthsStarting", () => {
	test("lists months in order across a year end", () => {
		expect(monthsStarting("2026-11", 4)).toEqual([
			"2026-11",
			"2026-12",
			"2027-01",
			"2027-02",
		]);
	});

	test("lists one month, or none", () => {
		expect(monthsStarting("2026-11", 1)).toEqual(["2026-11"]);
		expect(monthsStarting("2026-11", 0)).toEqual([]);
	});

	test("lists the whole range, 49 months, without gaps", () => {
		const months = monthsStarting("2023-11", 49);
		expect(months).toHaveLength(49);
		expect(months[0]).toBe("2023-11");
		expect(months[48]).toBe("2027-11");
		expect(new Set(months).size).toBe(49);
	});
});

describe("the days of a month", () => {
	test("monthOf takes a date's month", () => {
		expect(monthOf("2026-11-02")).toBe("2026-11");
		expect(monthOf("2026-12-31")).toBe("2026-12");
	});

	test("firstDayOf is the 1st", () => {
		expect(firstDayOf("2026-10")).toBe("2026-10-01");
	});

	test.each([
		["2026-10", "2026-10-31"],
		["2026-11", "2026-11-30"],
		["2026-02", "2026-02-28"],
		["2028-02", "2028-02-29"],
		["2000-02", "2000-02-29"],
		["2100-02", "2100-02-28"],
		["2026-12", "2026-12-31"],
		["2026-04", "2026-04-30"],
	])("lastDayOf %s is %s", (month, expected) => {
		expect(lastDayOf(month)).toBe(expected);
	});
});

describe("currentMonth (TIME-5)", () => {
	test("is November on the golden clock in Asia/Kolkata", () => {
		expect(currentMonth("Asia/Kolkata", new Date(GOLDEN_NOW))).toBe("2026-11");
	});

	// Golden row #26 is 00:30 on 1 November in Kolkata, still 31 October in UTC.
	test("follows the profile zone, not UTC, at a month's edge", () => {
		const instant = new Date("2026-10-31T19:00:00Z");
		expect(currentMonth("Asia/Kolkata", instant)).toBe("2026-11");
		expect(currentMonth("UTC", instant)).toBe("2026-10");
		expect(currentMonth("America/Los_Angeles", instant)).toBe("2026-10");
	});

	test("reaches the zones furthest from UTC", () => {
		const instant = new Date("2026-10-31T10:30:00Z");
		expect(currentMonth("Pacific/Kiritimati", instant)).toBe("2026-11");
		expect(currentMonth("Pacific/Pago_Pago", instant)).toBe("2026-10");
	});

	test("turns the year in the zone", () => {
		const instant = new Date("2026-12-31T20:00:00Z");
		expect(currentMonth("Asia/Tokyo", instant)).toBe("2027-01");
		expect(currentMonth("Europe/London", instant)).toBe("2026-12");
	});
});

describe("the month range (D-247, D-566)", () => {
	test("runs 36 months back and 12 ahead", () => {
		expect(MONTHS_BACK).toBe(36);
		expect(MONTHS_AHEAD).toBe(12);
	});

	test("is Nov 2023 to Nov 2027 on golden", () => {
		expect(monthRange("2026-11")).toEqual({ first: "2023-11", last: "2027-11" });
	});

	test("crosses years from January", () => {
		expect(monthRange("2026-01")).toEqual({ first: "2023-01", last: "2027-01" });
	});

	test("holds both ends and nothing past them", () => {
		const range = monthRange("2026-11");
		expect(inRange("2023-11", range)).toBe(true);
		expect(inRange("2027-11", range)).toBe(true);
		expect(inRange("2026-11", range)).toBe(true);
		expect(inRange("2023-10", range)).toBe(false);
		expect(inRange("2027-12", range)).toBe(false);
		expect(inRange("1999-01", range)).toBe(false);
	});

	test("restoring writes reach 2000-01 to 2099-12 (BR-F04-33)", () => {
		expect(RESTORE_FIRST).toBe("2000-01");
		expect(RESTORE_LAST).toBe("2099-12");
	});
});
