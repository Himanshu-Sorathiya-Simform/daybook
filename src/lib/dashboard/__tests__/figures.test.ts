import { describe, expect, test } from "vitest";

import {
	budgetCounts,
	budgetsLine,
	changeTenths,
	daysInMonth,
	paceAt,
	paceLabel,
	paceSentence,
	runningTotals,
	savingsRateTenths,
	spendingComparison,
	stripCap,
	stripHint,
	stripNotes,
	summaryNotes,
	topBudgets,
} from "../figures";
import {
	GOLDEN_LOCALE,
	NOVEMBER_DAILY,
	OCTOBER_DAILY,
	SEPTEMBER_DAILY,
} from "./golden";

const DAILY = [...SEPTEMBER_DAILY, ...OCTOBER_DAILY, ...NOVEMBER_DAILY];
const L = GOLDEN_LOCALE;

describe("changeTenths (BR-F08-07)", () => {
	test("is golden October spending against September: +11.1%", () => {
		expect(changeTenths(3116800, 2804900)).toBe(111);
	});

	test("is golden November spending against October: −40.9%", () => {
		expect(changeTenths(1842000, 3116800)).toBe(-409);
	});

	test("is 0 for no change", () => {
		expect(changeTenths(500, 500)).toBe(0);
	});

	test("is null when the previous figure is 0", () => {
		expect(changeTenths(500, 0)).toBeNull();
		expect(changeTenths(0, 0)).toBeNull();
	});

	test("rounds half away from zero once", () => {
		// 1 in 2,000 is exactly half a tenth of a percent: it rounds away from zero.
		expect(changeTenths(2001, 2000)).toBe(1);
		expect(changeTenths(1999, 2000)).toBe(-1);
	});

	test("goes below −100% never but may exceed +100%", () => {
		expect(changeTenths(0, 1000)).toBe(-1000);
		expect(changeTenths(5000, 1000)).toBe(4000);
	});
});

describe("savingsRateTenths (MON-8)", () => {
	test("is golden October: 63.3%", () => {
		expect(savingsRateTenths(5383200, 8500000)).toBe(633);
	});

	test("is golden September: 71.1%", () => {
		expect(savingsRateTenths(9700000 - 2804900, 9700000)).toBe(711);
	});

	test("is null without income, as November's dash", () => {
		expect(savingsRateTenths(-1842000, 0)).toBeNull();
	});

	test("is 100.0% for income with no spending", () => {
		expect(savingsRateTenths(8500000, 8500000)).toBe(1000);
	});

	test("is negative when spending is above income", () => {
		expect(savingsRateTenths(-1000, 4000)).toBe(-250);
	});
});

describe("budgetCounts and budgetsLine (BR-F08-08)", () => {
	// Golden October: entertainment 214.8%, food 124.4%, shopping 100.0%, transportation 90.0%.
	const OCTOBER = [
		{ state: "over", utilizationTenths: 2148 },
		{ state: "over", utilizationTenths: 1244 },
		{ state: "over", utilizationTenths: 1000 },
		{ state: "warning", utilizationTenths: 900 },
	] as const;

	test("count golden October as 2 over, 1 at limit, 1 near", () => {
		expect(budgetCounts(OCTOBER)).toEqual({ over: 2, atLimit: 1, near: 1 });
	});

	test("count golden November as none: all four within limit", () => {
		const november = [
			{ state: "ok", utilizationTenths: 84 },
			{ state: "ok", utilizationTenths: 0 },
			{ state: "ok", utilizationTenths: 0 },
			{ state: "ok", utilizationTenths: 0 },
		] as const;
		expect(budgetCounts(november)).toEqual({ over: 0, atLimit: 0, near: 0 });
	});

	test("count the edge of each state: 799 ok, 800 near, 999 near, 1000 at limit, 1001 over", () => {
		const row = (
			state: "ok" | "warning" | "over",
			utilizationTenths: number,
		) => ({
			state,
			utilizationTenths,
		});
		expect(budgetCounts([row("ok", 799)])).toEqual({
			over: 0,
			atLimit: 0,
			near: 0,
		});
		expect(budgetCounts([row("warning", 800)])).toEqual({
			over: 0,
			atLimit: 0,
			near: 1,
		});
		expect(budgetCounts([row("warning", 999)])).toEqual({
			over: 0,
			atLimit: 0,
			near: 1,
		});
		expect(budgetCounts([row("over", 1000)])).toEqual({
			over: 0,
			atLimit: 1,
			near: 0,
		});
		expect(budgetCounts([row("over", 1001)])).toEqual({
			over: 1,
			atLimit: 0,
			near: 0,
		});
	});

	test("count nothing for no rows", () => {
		expect(budgetCounts([])).toEqual({ over: 0, atLimit: 0, near: 0 });
	});

	test.each([
		[{ over: 2, atLimit: 1, near: 1 }, 4, "2 over, 1 at limit, 1 near limit"],
		[{ over: 0, atLimit: 0, near: 0 }, 4, "All 4 within limit"],
		[{ over: 1, atLimit: 0, near: 0 }, 3, "1 over"],
		[{ over: 0, atLimit: 2, near: 0 }, 3, "2 at limit"],
		[{ over: 0, atLimit: 0, near: 3 }, 3, "3 near limit"],
		[{ over: 1, atLimit: 0, near: 2 }, 5, "1 over, 2 near limit"],
		[{ over: 0, atLimit: 0, near: 0 }, 1, "All 1 within limit"],
		[{ over: 0, atLimit: 0, near: 0 }, 0, "No Budgets"],
	])("the line for %j of %i is %s", (counts, budgets, line) => {
		expect(budgetsLine(counts, budgets)).toBe(line);
	});
});

describe("topBudgets (BR-F08-09)", () => {
	const row = (
		category:
			| "food"
			| "housing"
			| "shopping"
			| "health"
			| "transportation"
			| "entertainment",
		utilizationTenths: number,
	) => ({
		category,
		utilizationTenths,
	});

	test("takes the five highest utilizations, highest first", () => {
		const rows = [
			row("food", 1244),
			row("shopping", 1000),
			row("entertainment", 2148),
			row("transportation", 900),
			row("housing", 500),
			row("health", 100),
		];
		expect(topBudgets(rows).map((each) => each.category)).toEqual([
			"entertainment",
			"food",
			"shopping",
			"transportation",
			"housing",
		]);
	});

	test("breaks a tie by category order", () => {
		const rows = [row("shopping", 1000), row("food", 1000)];
		expect(topBudgets(rows).map((each) => each.category)).toEqual([
			"food",
			"shopping",
		]);
	});

	test("takes fewer when there are fewer, and honors another limit", () => {
		expect(topBudgets([row("food", 5)])).toHaveLength(1);
		expect(topBudgets([row("food", 5), row("health", 6)], 1)).toEqual([
			row("health", 6),
		]);
		expect(topBudgets([])).toEqual([]);
	});

	test("never changes its input", () => {
		const rows = [row("food", 1), row("health", 2)];
		const copy = structuredClone(rows);
		topBudgets(rows);
		expect(rows).toEqual(copy);
	});
});

// AC-F08-17
describe("stripCap (BR-F08-30)", () => {
	test("is 1.25 times the second-largest day: golden October's 5,625.00", () => {
		const cap = stripCap(OCTOBER_DAILY.map((entry) => entry.outMinor));
		expect(cap).toBe(562500);
	});

	test("is the same for September: the second-largest is 3,200.00", () => {
		expect(stripCap(SEPTEMBER_DAILY.map((entry) => entry.outMinor))).toBe(
			400000,
		);
	});

	test("counts a tie as two days", () => {
		expect(stripCap([800, 800, 100])).toBe(1000);
	});

	test("ignores refunds and empty days", () => {
		expect(stripCap([1000, -5000, 0, 200])).toBe(250);
	});

	test("is null with fewer than two days of Out: November's single bar", () => {
		expect(stripCap(NOVEMBER_DAILY.map((entry) => entry.outMinor))).toBeNull();
		expect(stripCap([])).toBeNull();
		expect(stripCap([500, 0, -1])).toBeNull();
	});
});

// AC-F08-19
describe("stripNotes and stripHint (BR-F08-30)", () => {
	const OCT_CAP = stripCap(OCTOBER_DAILY.map((entry) => entry.outMinor));

	test("cut golden October's 1st, the rent, and mark the 9th as a refund", () => {
		expect(stripNotes(OCTOBER_DAILY, "2026-10", OCT_CAP)).toEqual({
			cut: ["2026-10-01"],
			refunds: ["2026-10-09"],
		});
	});

	test("read golden October as the strip's hint, in en-IN", () => {
		expect(stripHint(OCTOBER_DAILY, "2026-10", L)).toBe(
			"Select a day to see its Transactions. 1 Oct is cut to fit. 9 Oct is a refund, below zero.",
		);
	});

	test("read September's hint: the rent is cut, no refund", () => {
		expect(stripHint(SEPTEMBER_DAILY, "2026-09", L)).toBe(
			"Select a day to see its Transactions. 1 Sept is cut to fit.",
		);
	});

	test("cut nothing in November's single bar, and say only to select a day", () => {
		expect(stripHint(NOVEMBER_DAILY, "2026-11", L)).toBe(
			"Select a day to see its Transactions.",
		);
	});

	test("read only the month asked for, though the list holds two", () => {
		const both = [...SEPTEMBER_DAILY, ...OCTOBER_DAILY];
		expect(stripNotes(both, "2026-10", OCT_CAP).cut).toEqual(["2026-10-01"]);
		expect(stripHint(both, "2026-09", L)).toContain("1 Sept is cut to fit.");
		expect(stripHint(both, "2026-09", L)).not.toContain("Oct");
	});

	test("a day exactly at the cap is not cut", () => {
		const days = [
			{ date: "2026-10-01", outMinor: 1000 },
			{ date: "2026-10-02", outMinor: 1000 },
			{ date: "2026-10-03", outMinor: 800 },
		];
		// The second-largest is 1000, so the cap is 1250 and nothing is above it.
		expect(stripNotes(days, "2026-10", stripCap([1000, 1000, 800]))).toEqual({
			cut: [],
			refunds: [],
		});
	});

	test("a null cap cuts nothing, and a refund is still marked", () => {
		expect(
			stripNotes([{ date: "2026-10-09", outMinor: -5 }], "2026-10", null),
		).toEqual({ cut: [], refunds: ["2026-10-09"] });
	});

	test("lists several cut days and refund days, oldest first", () => {
		const days = [
			{ date: "2026-10-20", outMinor: 5000 },
			{ date: "2026-10-03", outMinor: 5000 },
			{ date: "2026-10-05", outMinor: 100 },
			{ date: "2026-10-04", outMinor: 100 },
			{ date: "2026-10-12", outMinor: -50 },
			{ date: "2026-10-02", outMinor: -60 },
		];
		expect(stripNotes(days, "2026-10", 1000)).toEqual({
			cut: ["2026-10-03", "2026-10-20"],
			refunds: ["2026-10-02", "2026-10-12"],
		});
	});
});

describe("daysInMonth", () => {
	test.each([
		["2026-10", 31],
		["2026-11", 30],
		["2026-02", 28],
		["2028-02", 29],
		["2100-02", 28],
		["2000-02", 29],
		["2026-12", 31],
		["2026-01", 31],
	])("%s has %i days", (month, days) => {
		expect(daysInMonth(month)).toBe(days);
	});
});

describe("runningTotals (BR-F08-29)", () => {
	test("adds each day to the last, to the day asked", () => {
		const totals = runningTotals(OCTOBER_DAILY, "2026-10", 7);
		expect(totals).toEqual([
			1800000, 1800000, 1800000, 2030000, 2094900, 2094900, 2544900,
		]);
	});

	test("subtracts a refund: 9 October", () => {
		expect(runningTotals(OCTOBER_DAILY, "2026-10", 9)[8]).toBe(2394900);
	});

	test("ends at the month's spending: golden October 31,168.00", () => {
		expect(runningTotals(OCTOBER_DAILY, "2026-10", 31)[30]).toBe(3116800);
	});

	test("ends at September's spending: 28,049.00", () => {
		expect(runningTotals(SEPTEMBER_DAILY, "2026-09", 30)[29]).toBe(2804900);
	});

	test("reads only the month asked, though the list holds others", () => {
		expect(runningTotals(DAILY, "2026-11", 2)).toEqual([1842000, 1842000]);
	});

	test("is all zeros for a month with no entries", () => {
		expect(runningTotals(OCTOBER_DAILY, "2026-08", 3)).toEqual([0, 0, 0]);
	});

	test("is empty for 0 days", () => {
		expect(runningTotals(OCTOBER_DAILY, "2026-10", 0)).toEqual([]);
	});

	test("adds two entries for one day", () => {
		const twice = [
			{ date: "2026-10-02", outMinor: 100 },
			{ date: "2026-10-02", outMinor: 50 },
		];
		expect(runningTotals(twice, "2026-10", 2)).toEqual([0, 150]);
	});
});

describe("paceAt (BR-F08-31)", () => {
	test("compares golden October's 7th with September's: 25,449.00 against 20,499.00", () => {
		expect(paceAt(DAILY, "2026-10", 7)).toEqual({
			currentMinor: 2544900,
			previousMinor: 2049900,
		});
	});

	test("compares October's last day with all of September: 31,168.00 against 28,049.00", () => {
		expect(paceAt(DAILY, "2026-10", 31)).toEqual({
			currentMinor: 3116800,
			previousMinor: 2804900,
		});
	});

	test("compares November's 2nd with October's 2nd", () => {
		expect(paceAt(DAILY, "2026-11", 2)).toEqual({
			currentMinor: 1842000,
			previousMinor: 1800000,
		});
	});

	test("keeps a shorter previous month at its whole total past its last day", () => {
		const daily = [
			{ date: "2026-02-10", outMinor: 5000 },
			{ date: "2026-03-30", outMinor: 100 },
		];
		expect(paceAt(daily, "2026-03", 31)).toEqual({
			currentMinor: 100,
			previousMinor: 5000,
		});
		expect(paceAt(daily, "2026-03", 28)).toEqual({
			currentMinor: 0,
			previousMinor: 5000,
		});
	});

	test("is zero before the 1st, and holds the whole month's total past its end", () => {
		expect(paceAt(DAILY, "2026-10", 0)).toEqual({
			currentMinor: 0,
			previousMinor: 0,
		});
		expect(paceAt(DAILY, "2026-10", 40)).toEqual({
			currentMinor: 3116800,
			previousMinor: 2804900,
		});
	});

	test("is zero on both sides with no data", () => {
		expect(paceAt([], "2026-10", 5)).toEqual({
			currentMinor: 0,
			previousMinor: 0,
		});
	});

	test("crosses a year", () => {
		const daily = [{ date: "2025-12-31", outMinor: 700 }];
		expect(paceAt(daily, "2026-01", 1)).toEqual({
			currentMinor: 0,
			previousMinor: 0,
		});
		expect(paceAt(daily, "2026-01", 31).previousMinor).toBe(700);
	});
});

describe("the Pace words (BR-F08-31)", () => {
	test("say more, with golden October's 7th", () => {
		expect(
			paceSentence(
				{ day: 7, month: "2026-10" },
				paceAt(DAILY, "2026-10", 7),
				L,
			),
		).toBe(
			"By day 7 you had spent ₹25,449.00, ₹4,950.00 more than by the same day in September.",
		);
	});

	test("say more for the last day: the golden figure of AC-F08-16", () => {
		expect(
			paceSentence(
				{ day: 31, month: "2026-10" },
				paceAt(DAILY, "2026-10", 31),
				L,
			),
		).toBe(
			"By day 31 you had spent ₹31,168.00, ₹3,119.00 more than by the same day in September.",
		);
	});

	test("say less", () => {
		expect(
			paceSentence(
				{ day: 2, month: "2026-11" },
				{ currentMinor: 1000, previousMinor: 3500 },
				L,
			),
		).toBe(
			"By day 2 you had spent ₹10.00, ₹25.00 less than by the same day in October.",
		);
	});

	test("say the same when the totals are equal", () => {
		expect(
			paceSentence(
				{ day: 2, month: "2026-11" },
				{ currentMinor: 1000, previousMinor: 1000 },
				L,
			),
		).toBe(
			"By day 2 you had spent ₹10.00, the same as by the same day in October.",
		);
	});

	test("label the chart", () => {
		expect(
			paceLabel(
				{ day: 31, month: "2026-10" },
				paceAt(DAILY, "2026-10", 31),
				L,
			),
		).toBe(
			"Running total: ₹31,168.00 by day 31, against ₹28,049.00 in September.",
		);
	});
});

describe("spendingComparison (BR-F08-07)", () => {
	test("reads golden October against September", () => {
		expect(
			spendingComparison(
				{ outMinor: 3116800, previousOutMinor: 2804900 },
				"2026-09",
				L,
			),
		).toBe("₹3,119.00 more than September (+11.1%)");
	});

	test("reads golden November against October", () => {
		expect(
			spendingComparison(
				{ outMinor: 1842000, previousOutMinor: 3116800 },
				"2026-10",
				L,
			),
		).toBe("₹12,748.00 less than October (−40.9%)");
	});

	test("is a dash when the previous month has no spending", () => {
		expect(
			spendingComparison(
				{ outMinor: 5000, previousOutMinor: 0 },
				"2026-09",
				L,
			),
		).toBe("—");
	});

	test("says the same when nothing changed", () => {
		expect(
			spendingComparison(
				{ outMinor: 5000, previousOutMinor: 5000 },
				"2026-09",
				L,
			),
		).toBe("The same as September (0.0%)");
	});
});

// AC-F08-19
describe("summaryNotes (BR-F08-08)", () => {
	const OCT = { incomeMinor: 8500000, netMinor: 5383200, rateTenths: 633 };
	const SEP = { incomeMinor: 9700000, netMinor: 6895100, rateTenths: 711 };
	const NOV = { incomeMinor: 0, netMinor: -1842000, rateTenths: null };

	test("read golden October against September", () => {
		expect(summaryNotes(OCT, SEP, "2026-10", L)).toEqual({
			income: "₹12,000.00 less than September",
			net: "₹15,119.00 less than September",
			rate: "7.8 points lower",
		});
	});

	test("read golden November: no income yet, below zero", () => {
		expect(summaryNotes(NOV, OCT, "2026-11", L)).toEqual({
			income: "No income yet",
			net: "Below zero",
			rate: "No income yet",
		});
	});

	test("leave the income and rate notes out when the previous month had no income", () => {
		const notes = summaryNotes(
			OCT,
			{ incomeMinor: 0, netMinor: -100, rateTenths: null },
			"2026-10",
			L,
		);
		expect(notes.income).toBeNull();
		expect(notes.rate).toBeNull();
		expect(notes.net).toBe("₹53,833.00 more than September");
	});

	test("say more and higher", () => {
		expect(summaryNotes(SEP, OCT, "2026-09", L)).toEqual({
			income: "₹12,000.00 more than August",
			net: "₹15,119.00 more than August",
			rate: "7.8 points higher",
		});
	});

	test("say the same, and no change, when nothing moved", () => {
		expect(summaryNotes(OCT, OCT, "2026-10", L)).toEqual({
			income: "The same as September",
			net: "The same as September",
			rate: "No change",
		});
	});

	test("compare a negative net with income in the month, not call it below zero", () => {
		const month = { incomeMinor: 1000, netMinor: -500, rateTenths: -500 };
		expect(summaryNotes(month, OCT, "2026-10", L).net).toBe(
			"₹53,837.00 less than September",
		);
	});

	test("call a zero net with no income no change from a zero previous net", () => {
		const none = { incomeMinor: 0, netMinor: 0, rateTenths: null };
		expect(summaryNotes(none, none, "2026-10", L)).toEqual({
			income: "No income yet",
			net: "The same as September",
			rate: "No income yet",
		});
	});

	test("write the points with the locale's decimal sign", () => {
		const german = { ...L, numberLocale: "de-DE-u-nu-latn" };
		expect(summaryNotes(OCT, SEP, "2026-10", german).rate).toBe(
			"7,8 points lower",
		);
	});
});
