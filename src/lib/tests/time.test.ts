import { expect, test } from "vitest";
import { todayIn, utcDate } from "../time";

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
