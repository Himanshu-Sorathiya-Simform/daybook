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

// T1: the window at the extremes of the world's offsets, and across leap days and clock changes.
describe("entryWindow, edge cases (TIME-7)", () => {
	test("reads the recording date at UTC-12:00, the last zone to reach a day", () => {
		// 00:00 UTC on 1 March is 12:00 on 28 February at UTC-12:00.
		expect(entryWindow("2026-03-01T00:00:00.000Z", "Etc/GMT+12")).toEqual({
			firstOn: "2026-02-18",
			lastOn: "2026-02-28",
		});
	});

	test("reads the recording date at UTC+14:00, the first zone to reach a day", () => {
		// 00:00 UTC on 1 March is 14:00 on 1 March at UTC+14:00.
		expect(
			entryWindow("2026-03-01T00:00:00.000Z", "Pacific/Kiritimati"),
		).toEqual({
			firstOn: "2026-02-19",
			lastOn: "2026-03-01",
		});
		// 10:00 UTC on 28 February is already 1 March there.
		expect(
			entryWindow("2026-02-28T10:00:00.000Z", "Pacific/Kiritimati").lastOn,
		).toBe("2026-03-01");
		expect(
			entryWindow("2026-02-28T09:59:00.000Z", "Pacific/Kiritimati").lastOn,
		).toBe("2026-02-28");
	});

	// 2024 is a leap year: the 10 days before 10 March start on 29 February, before 11 March on 1 March.
	test.each([
		["2024-03-10", "2024-02-29"],
		["2024-03-11", "2024-03-01"],
		["2024-03-09", "2024-02-28"],
		["2024-03-01", "2024-02-20"],
		["2024-02-29", "2024-02-19"],
		["2023-03-10", "2023-02-28"],
		["2023-03-11", "2023-03-01"],
		["2028-03-10", "2028-02-29"],
		["2100-03-10", "2100-02-28"],
	])("recorded on %s, the window starts on %s", (recorded, first) => {
		expect(entryWindow(`${recorded}T12:00:00.000Z`, "UTC")).toEqual({
			firstOn: first,
			lastOn: recorded,
		});
	});

	test("counts 11 dates, the recording date and the 10 before it", () => {
		const window = entryWindow("2024-03-10T12:00:00.000Z", "UTC");
		const dates = [
			"2024-02-29",
			...Array.from(
				{ length: 10 },
				(_, index) => `2024-03-${String(index + 1).padStart(2, "0")}`,
			),
		];
		expect(dates).toHaveLength(11);
		expect(dates.filter((date) => inWindow(date, window))).toEqual(dates);
		expect(inWindow("2024-02-28", window)).toBe(false);
		expect(inWindow("2024-03-11", window)).toBe(false);
	});

	// The recording date follows the wall clock: both instants of New York's repeated hour on
	// 1 November are the same date, and the spring-forward gap does not move it.
	test.each([
		["2026-03-08T06:59:00.000Z", "2026-03-08"],
		["2026-03-08T07:00:00.000Z", "2026-03-08"],
		["2026-03-08T04:59:00.000Z", "2026-03-07"],
		["2026-11-01T03:59:00.000Z", "2026-10-31"],
		["2026-11-01T04:00:00.000Z", "2026-11-01"],
		["2026-11-01T05:30:00.000Z", "2026-11-01"],
		["2026-11-01T06:30:00.000Z", "2026-11-01"],
		["2026-11-02T04:59:00.000Z", "2026-11-01"],
		["2026-11-02T05:00:00.000Z", "2026-11-02"],
	])("in New York, %s is recorded on %s", (createdAt, lastOn) => {
		expect(entryWindow(createdAt, "America/New_York").lastOn).toBe(lastOn);
	});

	test("the window spans a clock change by dates, so it still holds 11 of them", () => {
		// The window is in dates, not hours: the 25-hour day of 1 November and the 23-hour day of
		// 8 March each count as one.
		expect(entryWindow("2026-11-01T12:00:00.000Z", "America/New_York")).toEqual({
			firstOn: "2026-10-22",
			lastOn: "2026-11-01",
		});
		expect(entryWindow("2026-03-10T12:00:00.000Z", "America/New_York")).toEqual({
			firstOn: "2026-02-28",
			lastOn: "2026-03-10",
		});
		expect(entryWindow("2026-03-18T12:00:00.000Z", "America/New_York")).toEqual({
			firstOn: "2026-03-08",
			lastOn: "2026-03-18",
		});
	});
});

describe("pastSlack, on input that is not an instant", () => {
	const now = "2026-11-02T06:30:00.000Z";

	// Callers check the shape first (the schemas); an invalid date compares false both ways, so
	// it is never "past the slack" and this function never throws on it.
	test.each(["junk", "", "2026-13-45T00:00:00Z", "Invalid Date"])(
		"%j is never past the slack, as the instant or as the limit",
		(bad) => {
			expect(pastSlack(bad, now)).toBe(false);
			expect(pastSlack(now, bad)).toBe(false);
		},
	);

	test("an invalid Date object compares false too", () => {
		expect(pastSlack(new Date("junk"), now)).toBe(false);
		expect(pastSlack(now, new Date("junk"))).toBe(false);
	});

	test("takes a Date and a string alike", () => {
		expect(pastSlack(new Date("2026-11-02T06:35:00.001Z"), now)).toBe(true);
		expect(pastSlack("2026-11-02T06:35:00.001Z", new Date(now))).toBe(true);
	});
});
