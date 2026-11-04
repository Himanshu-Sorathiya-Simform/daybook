import { afterEach, describe, expect, test, vi } from "vitest";

import {
	dayLabel,
	groupFigures,
	groupLabel,
	type LabelLocale,
	loadedMessage,
	rowDisplay,
	rowName,
	rowWhen,
	signedMinor,
	transactionCount,
} from "../labels";
import { row } from "./fixtures";

// The golden profile (IN, INR) on the golden clock's day (TST-3).
const IN: LabelLocale = {
	today: "2026-11-02",
	dateLocale: "en-IN",
	timezone: "Asia/Kolkata",
	numberLocale: "hi-IN-u-nu-latn",
	currency: "INR",
};

// Golden #25: Swiggy 380.00 on Sat 31 Oct at 11:50 pm in Kolkata.
const ROW_25 = row({
	occurredOn: "2026-10-31",
	occurredAt: "2026-10-31T18:20:00.000Z",
	amountMinor: 38000,
});
// Golden #16: the Netflix charge of 649.00 on Mon 5 Oct, which carries no time (TIME-6).
const ROW_16 = row({
	payee: "Netflix",
	category: "entertainment",
	amountMinor: 64900,
	occurredOn: "2026-10-05",
	occurredAt: "2026-10-04T18:30:00.000Z",
	source: "subscription",
});

const zero = { count: 0, inMinor: 0, outMinor: 0, toGoalsMinor: 0 };

afterEach(() => {
	vi.unstubAllEnvs();
});

describe("AC-F03-60: section 5's labels table on 2026-11-02", () => {
	// AC-F03-60
	test("the all-time day header for 2026-11-01 reads Yesterday · Sun, 1 Nov", () => {
		expect(groupLabel("day", { key: "2026-11-01", label: null }, IN)).toBe(
			"Yesterday · Sun, 1 Nov",
		);
	});

	// AC-F03-60
	test("its figures read Out ₹18,420.00", () => {
		expect(
			groupFigures("day", { ...zero, count: 2, outMinor: 1842000 }, IN),
		).toBe("Out ₹18,420.00");
	});

	// AC-F03-60
	test("check A's day header for 2026-10-01 reads Thu, 1 Oct", () => {
		expect(groupLabel("day", { key: "2026-10-01", label: null }, IN)).toBe(
			"Thu, 1 Oct",
		);
	});

	// AC-F03-60
	test("its figures read In ₹85,000.00 · Out ₹18,000.00", () => {
		expect(
			groupFigures(
				"day",
				{ ...zero, count: 2, inMinor: 8500000, outMinor: 1800000 },
				IN,
			),
		).toBe("In ₹85,000.00 · Out ₹18,000.00");
	});

	// AC-F03-60
	test("check A's day header for 2026-10-18 (M2) reads Sun, 18 Oct", () => {
		expect(groupLabel("day", { key: "2026-10-18", label: null }, IN)).toBe(
			"Sun, 18 Oct",
		);
	});

	// AC-F03-60
	test("its figures read From Goals +₹1,000.00", () => {
		expect(
			groupFigures("day", { ...zero, count: 1, toGoalsMinor: -100000 }, IN),
		).toBe("From Goals +₹1,000.00");
	});

	// AC-F03-60
	test("check A's food header reads Food", () => {
		expect(groupLabel("category", { key: "food", label: null }, IN)).toBe(
			"Food",
		);
	});

	// AC-F03-60
	test("its figures read 4 · Out ₹6,220.00", () => {
		expect(
			groupFigures("category", { ...zero, count: 4, outMinor: 622000 }, IN),
		).toBe("4 · Out ₹6,220.00");
	});

	// AC-F03-60
	test("check A's Vacation header (M2) reads Vacation (Goal)", () => {
		expect(
			groupLabel(
				"category",
				{
					key: "goal:0192f0c4-7a1e-7c3b-9d2a-00000000000a",
					label: "Vacation",
				},
				IN,
			),
		).toBe("Vacation (Goal)");
	});

	// AC-F03-60
	test("its figures read 2 · To Goals ₹2,000.00", () => {
		expect(
			groupFigures(
				"category",
				{ ...zero, count: 2, toGoalsMinor: 200000 },
				IN,
			),
		).toBe("2 · To Goals ₹2,000.00");
	});

	// AC-F03-60
	test("#25 under the amount sort reads Sat, 31 Oct · 11:50 pm", () => {
		expect(rowWhen(ROW_25, "none", IN)).toBe("Sat, 31 Oct · 11:50 pm");
	});

	// AC-F03-60
	test("#16, a charge, under the amount sort reads Mon, 5 Oct", () => {
		expect(rowWhen(ROW_16, "none", IN)).toBe("Mon, 5 Oct");
	});
});

describe("dayLabel (BR-F03-31)", () => {
	test("today reads Today", () => {
		expect(dayLabel("2026-11-02", IN)).toBe("Today");
	});

	test("yesterday reads Yesterday · and its day", () => {
		expect(dayLabel("2026-11-01", IN)).toBe("Yesterday · Sun, 1 Nov");
	});

	test("the day before yesterday reads its day alone", () => {
		expect(dayLabel("2026-10-31", IN)).toBe("Sat, 31 Oct");
	});

	test("a day in another year adds the year", () => {
		expect(dayLabel("2025-10-31", IN)).toBe("Fri, 31 Oct, 2025");
	});

	test("yesterday across a new year is still Yesterday, with the year", () => {
		const newYear = { ...IN, today: "2027-01-01" };
		expect(dayLabel("2026-12-31", newYear)).toBe(
			"Yesterday · Thu, 31 Dec, 2026",
		);
		expect(dayLabel("2027-01-01", newYear)).toBe("Today");
	});

	test("yesterday across a month end", () => {
		expect(dayLabel("2026-02-28", { ...IN, today: "2026-03-01" })).toBe(
			"Yesterday · Sat, 28 Feb",
		);
	});

	test("a future day reads its day, never Today or Yesterday", () => {
		expect(dayLabel("2026-11-03", IN)).toBe("Tue, 3 Nov");
	});

	test("follows the date locale", () => {
		expect(dayLabel("2026-11-01", { ...IN, dateLocale: "en-US" })).toBe(
			"Yesterday · Sun, Nov 1",
		);
	});

	test.each(["Pacific/Kiritimati", "America/Los_Angeles"])(
		"never moves with the device zone, here %s",
		(zone) => {
			vi.stubEnv("TZ", zone);
			expect(dayLabel("2026-11-01", IN)).toBe("Yesterday · Sun, 1 Nov");
		},
	);
});

describe("rowWhen (BR-F03-31, TIME-6)", () => {
	test("under day grouping, the time in the profile zone", () => {
		expect(rowWhen(ROW_25, "day", IN)).toBe("11:50 pm");
	});

	test("under day grouping, a charge reads Auto", () => {
		expect(rowWhen(ROW_16, "day", IN)).toBe("Auto");
	});

	test.each(["category", "payee", "none"] as const)(
		"under %s grouping, the day and the time",
		(group) => {
			expect(rowWhen(ROW_25, group, IN)).toBe("Sat, 31 Oct · 11:50 pm");
		},
	);

	test.each(["category", "payee", "none"] as const)(
		"under %s grouping, a charge's day alone",
		(group) => {
			expect(rowWhen(ROW_16, group, IN)).toBe("Mon, 5 Oct");
		},
	);

	test("today outside day grouping reads Today · and the time", () => {
		expect(
			rowWhen(
				row({
					occurredOn: "2026-11-02",
					occurredAt: "2026-11-02T06:10:00.000Z",
				}),
				"none",
				IN,
			),
		).toBe("Today · 11:40 am");
	});

	test("yesterday outside day grouping reads its day, not Yesterday", () => {
		// Golden #26: Sunrise Apartments, 1 Nov at 12:30 am in Kolkata.
		expect(
			rowWhen(
				row({
					occurredOn: "2026-11-01",
					occurredAt: "2026-10-31T19:00:00.000Z",
				}),
				"none",
				IN,
			),
		).toBe("Sun, 1 Nov · 12:30 am");
	});

	test("a charge today outside day grouping reads Today", () => {
		expect(rowWhen({ ...ROW_16, occurredOn: "2026-11-02" }, "payee", IN)).toBe(
			"Today",
		);
	});

	test("a row in another year adds the year to its day", () => {
		expect(
			rowWhen(
				row({
					occurredOn: "2025-10-31",
					occurredAt: "2025-10-31T18:20:00.000Z",
				}),
				"none",
				IN,
			),
		).toBe("Fri, 31 Oct, 2025 · 11:50 pm");
	});

	test("the time follows the profile zone, not UTC: 12:30 am on 1 Nov is 7 pm on 31 Oct in UTC", () => {
		expect(
			rowWhen(
				row({
					occurredOn: "2026-11-01",
					occurredAt: "2026-10-31T19:00:00.000Z",
				}),
				"day",
				{ ...IN, timezone: "UTC" },
			),
		).toBe("7:00 pm");
	});
});

describe("groupLabel (BR-F03-55, BR-F03-56)", () => {
	test.each([
		["salary", "Salary"],
		["personal_care", "Personal care"],
		["other_income", "Other income"],
	])("a category group %s reads %s", (key, label) => {
		expect(groupLabel("category", { key, label: null }, IN)).toBe(label);
	});

	test("a payee group reads the page's label, not its lowered key", () => {
		// AC-F03-36: the key is lowered, the label is the newest row's payee.
		expect(groupLabel("payee", { key: "swiggy", label: "SWIGGY" }, IN)).toBe(
			"SWIGGY",
		);
	});

	test("a payee group with no label falls back to its key", () => {
		expect(groupLabel("payee", { key: "swiggy", label: null }, IN)).toBe(
			"swiggy",
		);
	});

	test("a Goal group under payee grouping reads the Goal's name with (Goal)", () => {
		expect(
			groupLabel("payee", { key: "goal:abc", label: "Emergency fund" }, IN),
		).toBe("Emergency fund (Goal)");
	});

	test("a Goal group whose name is missing still says it is a Goal", () => {
		expect(groupLabel("category", { key: "goal:abc", label: null }, IN)).toBe(
			" (Goal)",
		);
	});

	test("a day group is never read as a Goal group", () => {
		expect(groupLabel("day", { key: "2026-11-02", label: "goal:x" }, IN)).toBe(
			"Today",
		);
	});
});

describe("groupFigures (BR-F03-56)", () => {
	test("leaves out every figure that is zero", () => {
		expect(groupFigures("day", { ...zero, count: 1, inMinor: 100 }, IN)).toBe(
			"In ₹1.00",
		);
	});

	test("a day group with every figure zero has no figures", () => {
		expect(groupFigures("day", { ...zero, count: 2 }, IN)).toBe("");
	});

	test("a category group with every figure zero shows only its count", () => {
		// An expense and its full refund cancel out.
		expect(groupFigures("category", { ...zero, count: 2 }, IN)).toBe("2");
	});

	test("a day group never shows its count", () => {
		expect(
			groupFigures("day", { ...zero, count: 7, outMinor: 100 }, IN),
		).not.toMatch(/^7/);
	});

	test("a payee group starts with its count", () => {
		// AC-F03-36: Swiggy, all time.
		expect(
			groupFigures("payee", { ...zero, count: 4, outMinor: 329000 }, IN),
		).toBe("4 · Out ₹3,290.00");
	});

	test("a negative Out keeps its minus sign (TXN-7)", () => {
		// Shopping in a month where the refund is larger than the spending.
		expect(
			groupFigures("category", { ...zero, count: 2, outMinor: -50000 }, IN),
		).toBe("2 · Out −₹500.00");
	});

	test("all four in order: count, In, Out, To Goals", () => {
		expect(
			groupFigures(
				"payee",
				{ count: 3, inMinor: 100, outMinor: 200, toGoalsMinor: 300 },
				IN,
			),
		).toBe("3 · In ₹1.00 · Out ₹2.00 · To Goals ₹3.00");
	});

	test("From Goals comes last, with a plus", () => {
		expect(
			groupFigures(
				"day",
				{ count: 2, inMinor: 0, outMinor: 200, toGoalsMinor: -300 },
				IN,
			),
		).toBe("Out ₹2.00 · From Goals +₹3.00");
	});

	test("groups digits in the profile's number format", () => {
		expect(
			groupFigures("day", { ...zero, count: 1, inMinor: 1234567890 }, IN),
		).toBe("In ₹1,23,45,678.90");
	});

	test("follows another currency and number format", () => {
		expect(
			groupFigures(
				"day",
				{ ...zero, count: 1, outMinor: 124050 },
				{ currency: "EUR", numberLocale: "de-DE" },
			),
		).toBe("Out 1.240,50\u00a0€");
	});

	test("a currency with no minor unit has no decimals", () => {
		expect(
			groupFigures(
				"day",
				{ ...zero, count: 1, outMinor: 1500 },
				{ currency: "JPY", numberLocale: "ja-JP" },
			),
		).toBe("Out ￥1,500");
	});
});

describe("signedMinor (D-231)", () => {
	test.each([
		["income", 8500000],
		["refund", 150000],
		["goal_withdrawal", 100000],
	] as const)("%s is a plus", (type, amountMinor) => {
		expect(signedMinor({ type, amountMinor })).toBe(amountMinor);
	});

	test.each([
		["expense", 185000],
		["goal_contribution", 500000],
	] as const)("%s is a minus", (type, amountMinor) => {
		expect(signedMinor({ type, amountMinor })).toBe(-amountMinor);
	});
});

describe("rowDisplay (BR-F03-32)", () => {
	test("a payee row: title, initials, category, time and signed amount", () => {
		expect(rowDisplay(ROW_25, "day", IN)).toEqual({
			title: "Swiggy",
			payee: "Swiggy",
			category: "food",
			goal: false,
			when: "11:50 pm",
			amountMinor: -38000,
			currency: "INR",
			numberLocale: "hi-IN-u-nu-latn",
		});
	});

	test("carries the description when there is one", () => {
		expect(
			rowDisplay(row({ description: "Team dinner" }), "day", IN).description,
		).toBe("Team dinner");
	});

	test("leaves out what the row does not have, rather than passing undefined", () => {
		const shown = rowDisplay(
			row({ payee: null, category: null, description: null }),
			"day",
			IN,
		);
		expect(Object.keys(shown)).not.toContain("payee");
		expect(Object.keys(shown)).not.toContain("category");
		expect(Object.keys(shown)).not.toContain("description");
		expect(shown.title).toBe("");
	});

	test("a charge reads Auto under day grouping", () => {
		expect(rowDisplay(ROW_16, "day", IN).when).toBe("Auto");
	});

	test("an income row has a plus", () => {
		expect(
			rowDisplay(
				row({ type: "income", category: "salary", amountMinor: 100 }),
				"day",
				IN,
			).amountMinor,
		).toBe(100);
	});

	test.each([
		["goal_contribution", "To Goal", -500000],
		["goal_withdrawal", "From Goal", 500000],
	] as const)("a %s row reads %s, as a Goal row", (type, title, signed) => {
		const shown = rowDisplay(
			row({ type, payee: null, category: null, amountMinor: 500000 }),
			"day",
			IN,
		);
		expect(shown).toMatchObject({ title, goal: true, amountMinor: signed });
	});

	test("follows the grouping for the time", () => {
		expect(rowDisplay(ROW_25, "none", IN).when).toBe("Sat, 31 Oct · 11:50 pm");
	});
});

describe("counts", () => {
	test.each([
		[0, "0 Transactions"],
		[1, "1 Transaction"],
		[2, "2 Transactions"],
		[50, "50 Transactions"],
	])("%i reads %s", (count, text) => {
		expect(transactionCount(count)).toBe(text);
	});

	test.each([
		[50, "Loaded 50 more Transactions"],
		[20, "Loaded 20 more Transactions"],
		[1, "Loaded 1 more Transaction"],
	])("a page of %i announces %s", (count, text) => {
		expect(loadedMessage(count)).toBe(text);
	});
});

describe("rowName (BR-F03-32)", () => {
	test("reads what the row shows, title first: payee, category, time and signed amount", () => {
		expect(rowName(rowDisplay(ROW_25, "day", IN), IN)).toBe(
			"Swiggy, Food, 11:50 pm, −₹380.00",
		);
	});

	test("reads a description after its category", () => {
		expect(
			rowName(
				rowDisplay(row({ description: "Monthly groceries" }), "day", IN),
				IN,
			),
		).toBe("Swiggy, Food: Monthly groceries, 10:15 pm, −₹640.00");
	});

	test("reads a charge's Auto, and the day outside day grouping", () => {
		expect(rowName(rowDisplay(ROW_16, "day", IN), IN)).toBe(
			"Netflix, Entertainment, Auto, −₹649.00",
		);
		expect(rowName(rowDisplay(ROW_16, "none", IN), IN)).toBe(
			"Netflix, Entertainment, Mon, 5 Oct, −₹649.00",
		);
	});

	test("reads money in with a plus", () => {
		expect(
			rowName(
				rowDisplay(
					row({
						type: "refund",
						category: "shopping",
						payee: "Croma",
						amountMinor: 150000,
					}),
					"day",
					IN,
				),
				IN,
			),
		).toBe("Croma, Shopping, 10:15 pm, +₹1,500.00");
	});

	test("a Goal row reads no category", () => {
		expect(
			rowName(
				rowDisplay(
					row({
						type: "goal_contribution",
						payee: null,
						category: null,
						amountMinor: 500000,
					}),
					"day",
					IN,
				),
				IN,
			),
		).toBe("To Goal, 10:15 pm, −₹5,000.00");
	});

	test("a row without a category reads Other, as it shows", () => {
		expect(
			rowName({ ...rowDisplay(row({ category: null }), "day", IN) }, IN),
		).toBe("Swiggy, Other, 10:15 pm, −₹640.00");
	});

	test.each([
		["pending", "Pending sync"],
		["rejected", "Not saved"],
	] as const)("a %s row reads its badge before the amount", (status, badge) => {
		expect(rowName({ ...rowDisplay(ROW_25, "day", IN), status }, IN)).toBe(
			`Swiggy, Food, 11:50 pm, ${badge}, −₹380.00`,
		);
	});

	test("a confirmed row reads no badge", () => {
		expect(
			rowName({ ...rowDisplay(ROW_25, "day", IN), status: "confirmed" }, IN),
		).toBe("Swiggy, Food, 11:50 pm, −₹380.00");
	});
});
