// @vitest-environment node
import { describe, expect, test } from "vitest";

import {
	CLOCK_SLACK_MS,
	entryWindow,
	inWindow,
	pastSlack,
	WINDOW_DAYS,
} from "../dates";

describe("pastSlack (TIME-7, BR-F03-09, BR-P2-20)", () => {
	const now = "2026-11-02T06:30:00.000Z";

	test("allows up to exactly 5 minutes ahead, and refuses a millisecond more", () => {
		expect(CLOCK_SLACK_MS).toBe(300000);
		expect(pastSlack("2026-11-02T06:35:00.000Z", now)).toBe(false);
		expect(pastSlack("2026-11-02T06:35:00.001Z", now)).toBe(true);
	});

	test("allows any time in the past", () => {
		expect(pastSlack("2020-01-01T00:00:00.000Z", now)).toBe(false);
	});

	test("compares instants, whatever their offset", () => {
		expect(pastSlack("2026-11-02T12:05:00+05:30", now)).toBe(false);
		expect(pastSlack("2026-11-02T12:06:00+05:30", now)).toBe(true);
		expect(pastSlack(new Date("2026-11-02T06:36:00.000Z"), new Date(now))).toBe(
			true,
		);
	});
});

describe("entryWindow (TIME-7, BR-F03-08)", () => {
	// AC-F03-06: recorded on 2026-10-16, the dates allowed are 2026-10-06 to 2026-10-16.
	test("runs from the recording date minus 10 days to the recording date", () => {
		expect(WINDOW_DAYS).toBe(10);
		expect(entryWindow("2026-10-16T06:30:00.000Z", "Asia/Kolkata")).toEqual({
			firstOn: "2026-10-06",
			lastOn: "2026-10-16",
		});
	});

	test("reads the recording date in the profile zone, not UTC", () => {
		// 20:00 UTC on 15 October is 01:30 on 16 October in India, 13:00 on 15 October in LA.
		expect(entryWindow("2026-10-15T20:00:00.000Z", "Asia/Kolkata").lastOn).toBe(
			"2026-10-16",
		);
		expect(
			entryWindow("2026-10-15T20:00:00.000Z", "America/Los_Angeles").lastOn,
		).toBe("2026-10-15");
	});

	test("crosses a month and a year", () => {
		expect(entryWindow("2026-01-05T06:30:00.000Z", "Asia/Kolkata")).toEqual({
			firstOn: "2025-12-26",
			lastOn: "2026-01-05",
		});
	});
});

describe("inWindow", () => {
	const window = { firstOn: "2026-10-06", lastOn: "2026-10-16" };

	test.each([
		["2026-10-05", false],
		["2026-10-06", true],
		["2026-10-10", true],
		["2026-10-16", true],
		["2026-10-17", false],
	])("%s is in 6 to 16 October: %s", (date, inside) => {
		expect(inWindow(date, window)).toBe(inside);
	});
});
