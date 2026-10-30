import { afterEach, describe, expect, test } from "vitest";

import { RANGE_PRESETS, type RangePreset } from "@/lib/transactions/model";
import { presetOf, presetRange } from "@/lib/transactions/presets";

const MACHINE_ZONE = process.env["TZ"];

afterEach(() => {
	if (MACHINE_ZONE === undefined) delete process.env["TZ"];
	else process.env["TZ"] = MACHINE_ZONE;
});

type Row = [today: string, preset: RangePreset, from: string, to: string];

// F03 section 3's table (today 2026-11-02, the golden clock), then month and year edges.
const TABLE: Row[] = [
	["2026-11-02", "this_month", "2026-11-01", "2026-11-30"],
	["2026-11-02", "last_month", "2026-10-01", "2026-10-31"],
	["2026-11-02", "last_3_months", "2026-09-01", "2026-11-30"],
	["2026-11-02", "year_to_date", "2026-01-01", "2026-11-02"],
	["2026-11-02", "last_12_months", "2025-12-01", "2026-11-30"],

	["2027-01-15", "this_month", "2027-01-01", "2027-01-31"],
	["2027-01-15", "last_month", "2026-12-01", "2026-12-31"],
	["2027-01-15", "last_3_months", "2026-11-01", "2027-01-31"],
	["2027-01-15", "year_to_date", "2027-01-01", "2027-01-15"],
	["2027-01-15", "last_12_months", "2026-02-01", "2027-01-31"],

	["2028-02-29", "this_month", "2028-02-01", "2028-02-29"],
	["2028-02-29", "last_month", "2028-01-01", "2028-01-31"],
	["2028-02-29", "last_3_months", "2027-12-01", "2028-02-29"],
	["2028-02-29", "year_to_date", "2028-01-01", "2028-02-29"],
	["2028-02-29", "last_12_months", "2027-03-01", "2028-02-29"],

	["2026-12-31", "this_month", "2026-12-01", "2026-12-31"],
	["2026-12-31", "last_month", "2026-11-01", "2026-11-30"],
	["2026-12-31", "last_3_months", "2026-10-01", "2026-12-31"],
	["2026-12-31", "year_to_date", "2026-01-01", "2026-12-31"],
	["2026-12-31", "last_12_months", "2026-01-01", "2026-12-31"],

	["2027-01-01", "this_month", "2027-01-01", "2027-01-31"],
	["2027-01-01", "last_month", "2026-12-01", "2026-12-31"],
	["2027-01-01", "last_3_months", "2026-11-01", "2027-01-31"],
	["2027-01-01", "year_to_date", "2027-01-01", "2027-01-01"],
	["2027-01-01", "last_12_months", "2026-02-01", "2027-01-31"],

	["2026-03-31", "last_month", "2026-02-01", "2026-02-28"],
	["2026-05-31", "last_3_months", "2026-03-01", "2026-05-31"],
];

describe("presetRange", () => {
	test.each(TABLE)("on %s, %s runs from %s to %s", (today, preset, from, to) => {
		expect(presetRange(preset, today)).toEqual({ from, to });
	});

	// TIME-10: no `Date` local getter may leak the machine's zone into a date.
	test.each(["Pacific/Kiritimati", "America/Los_Angeles", "Asia/Kolkata", "UTC"])(
		"gives the same dates when the machine runs in %s",
		(zone) => {
			process.env["TZ"] = zone;
			for (const [today, preset, from, to] of TABLE) {
				expect(presetRange(preset, today)).toEqual({ from, to });
			}
		},
	);
});

describe("presetOf", () => {
	test("all time has no dates", () => {
		expect(presetOf(undefined, undefined, "2026-11-02")).toBe("all");
	});

	test.each(RANGE_PRESETS)(
		"recognizes the dates of %s on the golden day",
		(preset) => {
			const { from, to } = presetRange(preset, "2026-11-02");
			expect(presetOf(from, to, "2026-11-02")).toBe(preset);
		},
	);

	// BR-F03-67's edge case: a custom range equal to a preset is that preset.
	test("a custom range equal to this month is this month", () => {
		expect(presetOf("2026-11-01", "2026-11-30", "2026-11-02")).toBe(
			"this_month",
		);
	});

	test("a range one day off any preset is custom", () => {
		expect(presetOf("2026-11-01", "2026-11-29", "2026-11-02")).toBe("custom");
		expect(presetOf("2026-10-02", "2026-10-31", "2026-11-02")).toBe("custom");
		expect(presetOf("2026-01-01", "2026-11-01", "2026-11-02")).toBe("custom");
	});

	test("the same dates mean another preset on another day", () => {
		expect(presetOf("2026-10-01", "2026-10-31", "2026-11-02")).toBe(
			"last_month",
		);
		expect(presetOf("2026-10-01", "2026-10-31", "2026-10-15")).toBe(
			"this_month",
		);
		expect(presetOf("2026-10-01", "2026-10-31", "2026-12-01")).toBe("custom");
	});

	test("when two presets share dates, the earlier one in section 3's order wins", () => {
		// On 31 December, year to date and the last 12 months are the same year.
		expect(presetOf("2026-01-01", "2026-12-31", "2026-12-31")).toBe(
			"year_to_date",
		);
		// On 31 January, this month and year to date are the same month.
		expect(presetOf("2027-01-01", "2027-01-31", "2027-01-31")).toBe(
			"this_month",
		);
	});

	test("a range with one end missing is custom", () => {
		expect(presetOf("2026-11-01", undefined, "2026-11-02")).toBe("custom");
		expect(presetOf(undefined, "2026-11-30", "2026-11-02")).toBe("custom");
	});
});
