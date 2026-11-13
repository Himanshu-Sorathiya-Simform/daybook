import { describe, expect, test } from "vitest";

import { goldenBudget } from "@/lib/budgets/__tests__/golden";
import type { BudgetRules } from "@/lib/budgets/model";
import type { Formats } from "../labels";
import {
	chartLabel,
	comparedWith,
	compareRows,
	detailHint,
	historyItems,
	inForceText,
	limitsIn,
	monthCells,
	noBudgetBefore,
	ofLimit,
	PANEL_TEXT,
	seeTransactions,
	spentNoLimit,
	SUBJECT_LABELS,
	subjectOf,
	whereItWent,
} from "../panel";
import { monthAnswer } from "./fixtures";

const IN: Formats = {
	currency: "INR",
	numberLocale: "hi-IN-u-nu-latn",
	dateLocale: "en-IN",
};
const DE: Formats = { currency: "EUR", numberLocale: "de-DE", dateLocale: "de-DE" };

describe("subjectOf (BR-F04-30)", () => {
	test("a Budget in the month, with its row as its record", () => {
		const view = monthAnswer("2026-10");
		const subject = subjectOf(view, "food");
		expect(subject?.kind).toBe("budget");
		expect(subject?.row).toBe(
			view.budgets.find((row) => row.category === "food"),
		);
		expect(subject?.record).toBe(subject?.row);
	});

	test("Not budgeted with no Budget record: September health", () => {
		const subject = subjectOf(monthAnswer("2026-09"), "health");
		expect(subject).toMatchObject({
			kind: "unbudgeted",
			row: { category: "health", spentMinor: 150000, budgetId: null },
			record: null,
		});
	});

	test("Not budgeted with a Budget record that is Not active: September transportation is both, and reads as Not budgeted", () => {
		const view = monthAnswer("2026-09");
		const subject = subjectOf(view, "transportation");
		expect(subject?.kind).toBe("unbudgeted");
		expect(subject?.row).toMatchObject({ spentMinor: 45000 });
		expect(subject?.record).toBe(
			view.inactive.find((row) => row.category === "transportation"),
		);
	});

	test("Not active alone: August transportation, with no spending", () => {
		const view = monthAnswer("2026-08");
		const subject = subjectOf(view, "transportation");
		expect(subject?.kind).toBe("inactive");
		expect(subject?.row).toMatchObject({ status: "starts", from: "2026-10" });
		expect(subject?.record).toBe(subject?.row);
	});

	test("null when the month shows the category nowhere: housing in August", () => {
		expect(subjectOf(monthAnswer("2026-08"), "housing")).toBeNull();
	});
});

describe("the selection's words (BR-F04-30)", () => {
	test("the labels", () => {
		expect(SUBJECT_LABELS).toEqual({
			budget: "Budget",
			unbudgeted: "Not budgeted",
			inactive: "Not active this month",
		});
	});

	test("spent with no limit: October entertainment's 2,148.00", () => {
		expect(spentNoLimit(214800, "2026-10", IN)).toBe(
			"₹2,148.00 spent in October, no limit",
		);
	});

	test("of the limit", () => {
		expect(ofLimit(500000, IN)).toBe("of ₹5,000.00");
	});

	test.each([
		[
			"budget",
			true,
			"L to change limit · Up and down arrows move · Esc to close",
		],
		["budget", false, "L to change limit · Esc to close"],
		["unbudgeted", true, "Up and down arrows move · Esc to close"],
		["inactive", true, "Up and down arrows move · Esc to close"],
		["inactive", false, "Esc to close"],
	] as const)("the hint for %s, docked %s (D-571)", (kind, docked, hint) => {
		expect(detailHint(kind, docked)).toBe(hint);
	});

	test("the panel's fixed words", () => {
		expect(PANEL_TEXT.label).toBe("Budget details");
		expect(PANEL_TEXT.close).toBe("Close details");
		expect(PANEL_TEXT.summaryHint).toBe(
			"Select a Budget to see its last 6 months and limit history. Up and down arrows move.",
		);
		expect(PANEL_TEXT.chartCaption).toBe(
			"Dashed line: the limit in force that month. Red: spent above it.",
		);
		expect(PANEL_TEXT.howLimitsWorkLines).toEqual([
			"A limit carries forward to every later month until you change it. Past months keep the limits they had.",
			"For a one-off, like a festival month, change the limit for one month only.",
			"Nearing limit starts at 80.0%. Over budget starts at 100.0%.",
		]);
	});
});

describe("the summary's comparison (BR-F04-30)", () => {
	test("Compared with September", () => {
		expect(comparedWith("2026-09", IN)).toBe("Compared with September");
	});

	// F04 section 5, the October summary panel
	test("golden October against September", () => {
		expect(compareRows(monthAnswer("2026-10"), IN)).toEqual([
			{
				label: "Budgeted spending",
				value: "₹13,168.00",
				note: "₹5,069.00 more than September",
			},
			{
				label: "Limits",
				value: "₹11,000.00",
				note: "₹1,000.00 more than September · 4 Budgets, 3 in September",
			},
			{ label: "Over or at limit", value: "3", note: "0 in September" },
		]);
	});

	test("golden November against October: less, the same limits and counts, fewer over", () => {
		expect(compareRows(monthAnswer("2026-11"), IN)).toEqual([
			{
				label: "Budgeted spending",
				value: "₹420.00",
				note: "₹12,748.00 less than October",
			},
			{ label: "Limits", value: "₹11,000.00", note: "Same as October" },
			{ label: "Over or at limit", value: "0", note: "3 in October" },
		]);
	});

	test("an equal count of rows over reads Same as", () => {
		const view = monthAnswer("2026-09");
		expect(compareRows(view, IN)[2]).toEqual({
			label: "Over or at limit",
			value: "0",
			note: "Same as August",
		});
	});

	test("one Budget reads in the singular", () => {
		const view = monthAnswer("2026-10");
		const one = { ...view, budgets: view.budgets.slice(0, 1) };
		expect(compareRows(one, IN)[1]?.note).toBe(
			"₹1,000.00 more than September · 1 Budget, 3 in September",
		);
	});

	test("in the profile's formats", () => {
		const view = monthAnswer("2026-10");
		const many = { ...view, previous: { ...view.previous, overCount: 1200 } };
		const rows = compareRows(many, DE);
		expect(rows[0]?.value).toBe("13.168,00 €");
		expect(rows[2]?.note).toBe("1.200 in September");
	});
});

describe("the limit history (BR-F04-30)", () => {
	const food = goldenBudget("food");

	test("golden food in October: newest first, October's entry in force", () => {
		expect(historyItems(food, "2026-10", IN)).toEqual([
			{
				kind: "entry",
				month: "2026-10",
				text: "₹5,000.00 from Oct 2026",
				inForce: true,
			},
			{
				kind: "entry",
				month: "2026-09",
				text: "₹6,000.00 from Sept 2026",
				inForce: false,
			},
		]);
	});

	test("in September, September's entry is in force", () => {
		expect(
			historyItems(food, "2026-09", IN).map((item) => item.inForce),
		).toEqual([false, true]);
	});

	test("before the first entry nothing is in force", () => {
		expect(historyItems(food, "2026-08", IN).some((item) => item.inForce)).toBe(
			false,
		);
	});

	test("a one-month limit decides its month and sits above an entry of the same month (D-571)", () => {
		const rules: BudgetRules = {
			...food,
			overrides: [{ month: "2026-10", limitMinor: 800000 }],
		};
		expect(historyItems(rules, "2026-10", IN)).toEqual([
			{
				kind: "override",
				month: "2026-10",
				text: "₹8,000.00 in Oct 2026 only",
				inForce: true,
			},
			{
				kind: "entry",
				month: "2026-10",
				text: "₹5,000.00 from Oct 2026",
				inForce: false,
			},
			{
				kind: "entry",
				month: "2026-09",
				text: "₹6,000.00 from Sept 2026",
				inForce: false,
			},
		]);
	});

	test("only the viewed month's one-month limit is in force, not another's", () => {
		const rules: BudgetRules = {
			...food,
			overrides: [
				{ month: "2026-10", limitMinor: 800000 },
				{ month: "2026-12", limitMinor: 900000 },
			],
		};
		expect(
			historyItems(rules, "2026-10", IN).map((item) => [
				item.month,
				item.kind,
				item.inForce,
			]),
		).toEqual([
			["2026-12", "override", false],
			["2026-10", "override", true],
			["2026-10", "entry", false],
			["2026-09", "entry", false],
		]);
	});

	test("a one-month limit leaves other months to the schedule", () => {
		const rules: BudgetRules = {
			...food,
			overrides: [{ month: "2026-10", limitMinor: 800000 }],
		};
		expect(
			historyItems(rules, "2026-11", IN).map((item) => item.inForce),
		).toEqual([false, true, false]);
	});

	test("a stop and a month with no limit, in month order with later months first", () => {
		const rules: BudgetRules = {
			schedule: [
				{ from: "2026-09", limitMinor: 100000 },
				{ from: "2026-11", limitMinor: null },
			],
			overrides: [
				{ month: "2026-10", limitMinor: null },
				{ month: "2027-01", limitMinor: 50000 },
			],
		};
		expect(historyItems(rules, "2026-12", IN)).toEqual([
			{
				kind: "override",
				month: "2027-01",
				text: "₹500.00 in Jan 2027 only",
				inForce: false,
			},
			{
				kind: "entry",
				month: "2026-11",
				text: "Stopped from Nov 2026",
				inForce: true,
			},
			{
				kind: "override",
				month: "2026-10",
				text: "No limit in Oct 2026 only",
				inForce: false,
			},
			{
				kind: "entry",
				month: "2026-09",
				text: "₹1,000.00 from Sept 2026",
				inForce: false,
			},
		]);
	});

	test("In force in October", () => {
		expect(inForceText("2026-10", IN)).toBe("In force in October");
	});

	test("it ends with the first entry's month", () => {
		expect(noBudgetBefore(food, IN)).toBe("No Budget before Sept 2026");
		expect(noBudgetBefore(food, DE)).toBe("No Budget before Sept. 2026");
	});
});

describe("Last 6 months (BR-F04-30)", () => {
	test("a month with a limit: Month, Limit, Spent and Used", () => {
		expect(
			monthCells(
				{ month: "2026-10", limitMinor: 500000, spentMinor: 622000 },
				IN,
			),
		).toEqual({
			month: "Oct 2026",
			limit: "₹5,000.00",
			spent: "₹6,220.00",
			used: "124.4%",
		});
	});

	test("a month with no limit reads No Budget and — (D-571)", () => {
		expect(
			monthCells({ month: "2026-06", limitMinor: null, spentMinor: 0 }, IN),
		).toEqual({
			month: "Jun 2026",
			limit: "No Budget",
			spent: "₹0.00",
			used: "—",
		});
	});

	test("the chart's text lists each month", () => {
		expect(
			chartLabel(
				[
					{ month: "2026-08", limitMinor: null, spentMinor: 0 },
					{ month: "2026-09", limitMinor: 600000, spentMinor: 505000 },
				],
				IN,
			),
		).toBe(
			"Spent by month: Aug 2026 ₹0.00, no limit; Sept 2026 ₹5,050.00 of ₹6,000.00",
		);
	});
});

describe("limitsIn (D-571)", () => {
	test("golden food has a limit in the 6 months to October", () => {
		expect(limitsIn(goldenBudget("food"), "2026-10")).toBe(true);
	});

	test("its first month counts: September alone, at the far end of the 6 months to February 2027", () => {
		const september: BudgetRules = {
			schedule: [
				{ from: "2026-09", limitMinor: 100000 },
				{ from: "2026-10", limitMinor: null },
			],
			overrides: [],
		};
		expect(limitsIn(september, "2027-02")).toBe(true);
		expect(limitsIn(september, "2027-03")).toBe(false);
	});

	test("none before the first entry: transportation, from October, in the 6 months to September", () => {
		expect(limitsIn(goldenBudget("transportation"), "2026-09")).toBe(false);
	});

	test("a one-month limit counts", () => {
		const rules: BudgetRules = {
			schedule: [{ from: "2027-01", limitMinor: 100000 }],
			overrides: [{ month: "2026-08", limitMinor: 50000 }],
		};
		expect(limitsIn(rules, "2026-10")).toBe(true);
	});
});

describe("Where it went (BR-F04-30, BR-F04-17)", () => {
	test("its title names the month", () => {
		expect(whereItWent("2026-10", IN)).toBe("Where it went in October");
	});

	test.each([
		[4, "See 4 Transactions"],
		[1, "See 1 Transaction"],
	])("%i reads %s", (count, text) => {
		expect(seeTransactions(count)).toBe(text);
	});
});
