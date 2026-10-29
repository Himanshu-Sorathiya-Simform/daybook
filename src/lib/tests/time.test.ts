import { describe, expect, test } from "vitest";
import { isIsoDate, monthsBefore, shiftDays, todayIn, utcDate } from "../time";

// The golden clock (TST-3): 2026-11-02T12:00:00+05:30.
const GOLDEN = new Date("2026-11-02T06:30:00.000Z");

test.each([
	["Asia/Kolkata", "2026-11-02"],
	["UTC", "2026-11-02"],
	["America/Los_Angeles", "2026-11-01"],
	["Pacific/Kiritimati", "2026-11-02"],
])("todayIn %s at the golden clock is %s", (zone, expected) => {
	expect(todayIn(zone, GOLDEN)).toBe(expected);
});

test("a zone ahead of UTC has already reached the next day", () => {
	expect(todayIn("Asia/Kolkata", new Date("2026-11-02T18:31:00.000Z"))).toBe(
		"2026-11-03",
	);
});

test("the last instant before a zone's midnight is still the earlier day", () => {
	expect(todayIn("Asia/Kolkata", new Date("2026-11-02T18:29:59.999Z"))).toBe(
		"2026-11-02",
	);
});

test("a zone behind UTC is still on the previous day", () => {
	expect(todayIn("America/New_York", new Date("2026-11-02T03:00:00.000Z"))).toBe(
		"2026-11-01",
	);
});

test("utcDate is the date in UTC", () => {
	expect(utcDate(new Date("2026-11-02T23:59:59.999Z"))).toBe("2026-11-02");
	expect(utcDate(new Date("2026-11-03T00:00:00.000Z"))).toBe("2026-11-03");
});

describe("isIsoDate", () => {
	test.each([
		"2026-11-02",
		"2026-01-01",
		"2026-12-31",
		"2028-02-29",
		"2000-02-29",
		"0001-01-01",
	])("accepts %j", (text) => {
		expect(isIsoDate(text)).toBe(true);
	});

	test.each([
		["2026-02-29", "29 February outside a leap year"],
		["1900-02-29", "1900 was not a leap year"],
		["2026-02-30", "a day past the month's end"],
		["2026-04-31", "31 April"],
		["2026-13-01", "month 13"],
		["2026-00-10", "month 0"],
		["2026-01-00", "day 0"],
		["2026-1-01", "a one-digit month"],
		["26-01-01", "a two-digit year"],
		["20261101", "no dashes"],
		[" 2026-11-02", "a leading space"],
		["2026-11-02T00:00", "a time"],
		["2026/11/02", "slashes"],
		["", "empty"],
	])("refuses %j: %s", (text) => {
		expect(isIsoDate(text)).toBe(false);
	});
});

describe("shiftDays", () => {
	test.each([
		["2026-11-02", -364, "2025-11-03"],
		["2026-11-02", 0, "2026-11-02"],
		["2026-11-02", 1, "2026-11-03"],
		["2026-03-01", -1, "2026-02-28"],
		["2028-03-01", -1, "2028-02-29"],
		["2026-12-31", 1, "2027-01-01"],
		// A daylight-saving change in the machine's zone never shifts a calendar date.
		["2026-03-29", 1, "2026-03-30"],
		["2026-11-01", 1, "2026-11-02"],
	])("%s moved %i days is %s", (date, days, expected) => {
		expect(shiftDays(date, days)).toBe(expected);
	});
});

describe("monthsBefore (BR-F03-62)", () => {
	test.each([
		// golden: section 5's payee history windows on 2 November.
		["2026-11-02", 3, "2026-08-02"],
		["2026-11-02", 1, "2026-10-02"],
		["2026-11-02", 12, "2025-11-02"],
		// A day the earlier month lacks clamps to its last day.
		["2026-05-31", 3, "2026-02-28"],
		["2028-05-31", 3, "2028-02-29"],
		["2026-03-31", 1, "2026-02-28"],
		["2026-01-15", 1, "2025-12-15"],
	])("%s minus %i months is %s", (date, months, expected) => {
		expect(monthsBefore(date, months)).toBe(expected);
	});
});
