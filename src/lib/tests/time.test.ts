import { describe, expect, test } from "vitest";
import { isIsoDate, todayIn, utcDate } from "../time";

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
