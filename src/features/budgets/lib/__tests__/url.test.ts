import { describe, expect, test } from "vitest";

import { BUDGETS_PAGE, budgetsHref, readMonthParam } from "../url";

/** The golden clock's month: the range runs from Nov 2023 to Nov 2027 (BR-F04-07). */
const CURRENT = "2026-11";
const read = (search: string) =>
	readMonthParam(new URLSearchParams(search), CURRENT);

describe("readMonthParam (BR-F04-14, D-566)", () => {
	test("no month is the current month, and nothing to drop", () => {
		expect(read("")).toEqual({ month: CURRENT, invalid: false });
	});

	test.each(["2026-10", "2026-09", "2026-11", "2027-01"])(
		"%s shows that month",
		(month) => {
			expect(read(`?month=${month}`)).toEqual({ month, invalid: false });
		},
	);

	// AC-F04-11: the range's own ends are in it.
	test.each(["2023-11", "2027-11"])(
		"the end of the range %s is shown",
		(month) => {
			expect(read(`?month=${month}`)).toEqual({ month, invalid: false });
		},
	);

	// AC-F04-11: one month past either end is out.
	test.each(["2023-10", "2027-12", "1999-01", "2099-12"])(
		"%s, outside the range, is dropped for the current month",
		(month) => {
			expect(read(`?month=${month}`)).toEqual({
				month: CURRENT,
				invalid: true,
			});
		},
	);

	test.each([
		["an empty value", "?month="],
		["a thirteenth month", "?month=2026-13"],
		["a month zero", "?month=2026-00"],
		["one digit for the month", "?month=2026-9"],
		["a full date", "?month=2026-10-01"],
		["slashes", "?month=2026%2F10"],
		["words", "?month=october"],
		["spaces around it", "?month=%202026-10%20"],
		["a two-digit year", "?month=26-10"],
	])("%s is dropped", (_name, search) => {
		expect(read(search)).toEqual({ month: CURRENT, invalid: true });
	});

	test("a month given twice is dropped, even when both are the same", () => {
		expect(read("?month=2026-10&month=2026-10")).toEqual({
			month: CURRENT,
			invalid: true,
		});
		expect(read("?month=2026-10&month=2026-09")).toEqual({
			month: CURRENT,
			invalid: true,
		});
	});

	test("other parameters are neither read nor flagged", () => {
		expect(read("?month=2026-10&cat=food&utm_source=mail")).toEqual({
			month: "2026-10",
			invalid: false,
		});
		expect(read("?cat=food")).toEqual({ month: CURRENT, invalid: false });
	});

	test("the range follows the current month", () => {
		expect(
			readMonthParam(new URLSearchParams("?month=2023-11"), "2026-12"),
		).toEqual({
			month: "2026-12",
			invalid: true,
		});
		expect(
			readMonthParam(new URLSearchParams("?month=2027-12"), "2026-12"),
		).toEqual({
			month: "2027-12",
			invalid: false,
		});
	});
});

describe("budgetsHref", () => {
	test("the current month is the page with no month, so the link keeps meaning now", () => {
		expect(budgetsHref(CURRENT, CURRENT)).toBe("/budgets");
		expect(BUDGETS_PAGE).toBe("/budgets");
	});

	test("any other month is named", () => {
		expect(budgetsHref("2026-10", CURRENT)).toBe("/budgets?month=2026-10");
		expect(budgetsHref("2027-11", CURRENT)).toBe("/budgets?month=2027-11");
	});
});
