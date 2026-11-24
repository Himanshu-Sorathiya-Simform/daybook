import { describe, expect, test } from "vitest";

import { ApiError } from "../../../api/errors";
import { readDashboardQuery } from "../query";

// The golden day: 2 November 2026, so the current month is 2026-11.
const TODAY = "2026-11-02";

const query = (text: string) => new URLSearchParams(text);

/** The parameters a 400 names, or a failure when nothing is refused. */
function refused(read: () => unknown): string[] {
	try {
		read();
	} catch (error) {
		if (!(error instanceof ApiError)) throw error;
		expect(error.code).toBe("bad_request");
		expect(error.status).toBe(400);
		return error.details["params"] as string[];
	}
	throw new Error("Nothing was refused.");
}

// AC-F08-01
describe("readDashboardQuery (BR-F08-01, D-478)", () => {
	test("is the current month without a month, or with an empty one", () => {
		expect(readDashboardQuery(query(""), TODAY)).toBe("2026-11");
		expect(readDashboardQuery(query("month="), TODAY)).toBe("2026-11");
	});

	test.each(["2026-11", "2026-10", "2026-09", "2000-01", "2025-12"])(
		"reads %s",
		(month) => {
			expect(readDashboardQuery(query(`month=${month}`), TODAY)).toBe(month);
		},
	);

	test.each([
		["a month in the future", "2026-12"],
		["a year ahead", "2027-11"],
		["before 2000-01", "1999-12"],
		["month 13", "2026-13"],
		["month 00", "2026-00"],
		["no zero", "2026-1"],
		["a full date", "2026-10-01"],
		["text", "october"],
		["spaces", "%202026-10"],
	])("refuses %s and names month", (_name, value) => {
		expect(
			refused(() => readDashboardQuery(query(`month=${value}`), TODAY)),
		).toEqual(["month"]);
	});

	test("refuses a month sent twice, even the same one twice", () => {
		expect(
			refused(() =>
				readDashboardQuery(query("month=2026-10&month=2026-10"), TODAY),
			),
		).toEqual(["month"]);
		expect(
			refused(() =>
				readDashboardQuery(query("month=2026-10&month=2026-09"), TODAY),
			),
		).toEqual(["month"]);
	});

	test("ignores names it does not know (D-458)", () => {
		expect(
			readDashboardQuery(query("range=last_month&month=2026-10&x=1"), TODAY),
		).toBe("2026-10");
	});

	test("moves the limit with the day it is given", () => {
		expect(readDashboardQuery(query("month=2026-12"), "2026-12-01")).toBe(
			"2026-12",
		);
		expect(
			refused(() => readDashboardQuery(query("month=2026-12"), "2026-11-30")),
		).toEqual(["month"]);
	});
});
