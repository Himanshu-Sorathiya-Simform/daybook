import { describe, expect, test } from "vitest";

import { GOLDEN_BUDGETS } from "../../../../seed/golden";
import { setFrom, setMonth } from "../model";
import type { Month } from "../months";
import {
	type BudgetRecord,
	buildMonthView,
	type CategorySpending,
	type MonthView,
} from "../view";
import { goldenBudget, goldenBudgets, goldenSpending } from "./golden";

// Expected figures are copied from F04 section 5 and docs/03-golden-dataset.md#budgets.

const ID = Object.fromEntries(
	GOLDEN_BUDGETS.map((each) => [each.category, each.id]),
);

function view(month: Month, budgets: BudgetRecord[] = goldenBudgets()): MonthView {
	const [year, monthNumber] = month.split("-").map(Number) as [number, number];
	const previous =
		monthNumber === 1 ?
			`${year - 1}-12`
		:	`${year}-${String(monthNumber - 1).padStart(2, "0")}`;
	return buildMonthView({
		month,
		budgets,
		spending: goldenSpending(month),
		previousSpending: goldenSpending(previous),
	});
}

/** Each row as category, limit, spent, utilization and state, in the view's order. */
const figures = (result: MonthView) =>
	result.budgets.map((row) => [
		row.category,
		row.limitMinor,
		row.spentMinor,
		row.utilizationTenths,
		row.state,
	]);

/** The golden Budgets with one changed by `change`. */
function withChange(
	category: string,
	change: (budget: BudgetRecord) => Pick<BudgetRecord, "schedule" | "overrides">,
): BudgetRecord[] {
	return goldenBudgets().map((budget) =>
		budget.category === category ? { ...budget, ...change(budget) } : budget,
	);
}

describe("golden September (F04 section 5)", () => {
	const september = view("2026-09");

	// AC-F04-01
	test("each budgeted row, Nearing limit first, the exact 80.0% boundary included", () => {
		expect(figures(september)).toEqual([
			["food", 600000, 505000, 842, "warning"],
			["shopping", 300000, 240000, 800, "warning"],
			["entertainment", 100000, 64900, 649, "ok"],
		]);
	});

	// AC-F04-02
	test("overall 8,099.00 of 10,000.00 at 81.0%, unbudgeted 19,950.00, total 28,049.00", () => {
		expect(september.overall).toEqual({
			limitMinor: 1000000,
			spentMinor: 809900,
			utilizationTenths: 810,
			state: "warning",
		});
		expect(september.unbudgetedMinor).toBe(1995000);
		expect(september.totalSpentMinor).toBe(2804900);
	});

	// AC-F04-13
	test("Not budgeted lists housing, health and transportation by spending, with transportation's Budget", () => {
		expect(september.unbudgeted).toEqual([
			{ category: "housing", spentMinor: 1800000, budgetId: null },
			{ category: "health", spentMinor: 150000, budgetId: null },
			{
				category: "transportation",
				spentMinor: 45000,
				budgetId: ID["transportation"],
			},
		]);
	});

	// AC-F04-13
	test("transportation is Not active this month: it starts in October", () => {
		expect(september.inactive).toEqual([
			expect.objectContaining({
				id: ID["transportation"],
				category: "transportation",
				status: "starts",
				from: "2026-10",
			}),
		]);
	});

	// AC-F04-01: the source and the next change.
	test("food's limit comes from September, with October's change next", () => {
		const food = september.budgets[0];
		expect(food?.source).toEqual({
			kind: "schedule",
			from: "2026-09",
			limitMinor: 600000,
		});
		expect(food?.next).toEqual({ from: "2026-10", limitMinor: 500000 });
		expect(food?.remainingMinor).toBe(95000);
	});

	// AC-F04-19's month before: August has no Budget.
	test("the previous month, August, has no Budget", () => {
		expect(september.previous).toEqual({
			month: "2026-08",
			limitMinor: 0,
			spentMinor: 0,
			budgetCount: 0,
			overCount: 0,
		});
	});
});

describe("golden October (F04 section 5)", () => {
	const october = view("2026-10");

	// AC-F04-01
	test("Over budget first by utilization, the exact 100.0% boundary as over, then Nearing limit", () => {
		expect(figures(october)).toEqual([
			["entertainment", 100000, 214800, 2148, "over"],
			["food", 500000, 622000, 1244, "over"],
			["shopping", 300000, 300000, 1000, "over"],
			["transportation", 200000, 180000, 900, "warning"],
		]);
	});

	// AC-F04-02
	test("overall 13,168.00 of 11,000.00 at 119.7%, unbudgeted housing 18,000.00, total 31,168.00", () => {
		expect(october.overall).toEqual({
			limitMinor: 1100000,
			spentMinor: 1316800,
			utilizationTenths: 1197,
			state: "over",
		});
		expect(october.unbudgeted).toEqual([
			{ category: "housing", spentMinor: 1800000, budgetId: null },
		]);
		expect(october.unbudgetedMinor).toBe(1800000);
		expect(october.totalSpentMinor).toBe(3116800);
		expect(october.inactive).toEqual([]);
	});

	// F04 section 15's food row.
	test("food is 6,220.00 of 5,000.00, over by 1,220.00, from October with no next change", () => {
		const food = october.budgets.find((row) => row.category === "food");
		expect(food).toMatchObject({
			id: ID["food"],
			remainingMinor: -122000,
			source: { kind: "schedule", from: "2026-10", limitMinor: 500000 },
			next: null,
			schedule: [
				{ from: "2026-09", limitMinor: 600000 },
				{ from: "2026-10", limitMinor: 500000 },
			],
			overrides: [],
			version: 2,
			demo: false,
		});
	});

	// AC-F04-19
	test("the previous month is September: 8,099.00 of 10,000.00, 3 Budgets, 0 over", () => {
		expect(october.previous).toEqual({
			month: "2026-09",
			limitMinor: 1000000,
			spentMinor: 809900,
			budgetCount: 3,
			overCount: 0,
		});
	});
});

describe("golden November (F04 section 5)", () => {
	const november = view("2026-11");

	// AC-F04-01: limits carry forward; ties keep CAT-2's order.
	test("every limit carries forward; food 8.4%, the rest 0.0%", () => {
		expect(figures(november)).toEqual([
			["food", 500000, 42000, 84, "ok"],
			["shopping", 300000, 0, 0, "ok"],
			["transportation", 200000, 0, 0, "ok"],
			["entertainment", 100000, 0, 0, "ok"],
		]);
	});

	// AC-F04-02
	test("overall 420.00 of 11,000.00 at 3.8%, unbudgeted housing 18,000.00, total 18,420.00", () => {
		expect(november.overall).toEqual({
			limitMinor: 1100000,
			spentMinor: 42000,
			utilizationTenths: 38,
			state: "ok",
		});
		expect(november.unbudgeted).toEqual([
			{ category: "housing", spentMinor: 1800000, budgetId: null },
		]);
		expect(november.totalSpentMinor).toBe(1842000);
	});

	// AC-F04-19: At limit counts as over.
	test("the previous month is October: 13,168.00 of 11,000.00, 4 Budgets, 3 over", () => {
		expect(november.previous).toEqual({
			month: "2026-10",
			limitMinor: 1100000,
			spentMinor: 1316800,
			budgetCount: 4,
			overCount: 3,
		});
	});
});

// AC-F04-02
test.each(["2026-08", "2026-09", "2026-10", "2026-11", "2026-12"])(
	"budgeted plus unbudgeted spending is the total in %s",
	(month) => {
		const result = view(month);
		expect(result.overall.spentMinor + result.unbudgetedMinor).toBe(
			result.totalSpentMinor,
		);
		expect(
			result.unbudgeted.reduce((sum, each) => sum + each.spentMinor, 0),
		).toBe(result.unbudgetedMinor);
	},
);

describe("changed schedules on golden (F04 section 5)", () => {
	// AC-F04-03
	test("food at 7,000.00 from September reads 72.1% then 88.9%", () => {
		const budgets = withChange("food", (food) =>
			setFrom(food, "2026-09", 700000),
		);
		const food = (month: Month) =>
			view(month, budgets).budgets.find((row) => row.category === "food");
		expect(food("2026-09")).toMatchObject({
			utilizationTenths: 721,
			state: "ok",
		});
		expect(food("2026-10")).toMatchObject({
			utilizationTenths: 889,
			state: "warning",
		});
		expect(food("2026-11")).toMatchObject({
			utilizationTenths: 60,
			state: "ok",
		});
	});

	// AC-F04-04
	test("stopping entertainment from November leaves earlier months and gives November 4.2%", () => {
		const budgets = withChange("entertainment", (each) =>
			setFrom(each, "2026-11", null),
		);
		expect(view("2026-09", budgets).budgets).toHaveLength(3);
		expect(view("2026-10", budgets).overall.utilizationTenths).toBe(1197);
		const november = view("2026-11", budgets);
		expect(november.overall).toEqual({
			limitMinor: 1000000,
			spentMinor: 42000,
			utilizationTenths: 42,
			state: "ok",
		});
		expect(november.inactive).toEqual([
			expect.objectContaining({
				category: "entertainment",
				status: "stopped",
				from: "2026-11",
				restartsFrom: null,
			}),
		]);
		expect(november.unbudgeted.map((each) => each.category)).toEqual([
			"housing",
		]);
	});

	// AC-F04-14
	test("food at 8,000.00 for October only reads 77.8% and October overall 94.1%", () => {
		const budgets = withChange("food", (food) =>
			setMonth(food, "2026-10", 800000),
		);
		const october = view("2026-10", budgets);
		expect(october.budgets.find((row) => row.category === "food")).toMatchObject(
			{
				limitMinor: 800000,
				utilizationTenths: 778,
				state: "ok",
				source: { kind: "override", month: "2026-10", limitMinor: 800000 },
				next: null,
			},
		);
		expect(october.overall).toEqual({
			limitMinor: 1400000,
			spentMinor: 1316800,
			utilizationTenths: 941,
			state: "warning",
		});
		expect(figures(view("2026-09", budgets))).toEqual(figures(view("2026-09")));
		expect(figures(view("2026-11", budgets))).toEqual(figures(view("2026-11")));
	});

	// AC-F04-16
	test("that one-month limit survives food at 7,000.00 from September: 72.1%, 77.8%, 6.0%", () => {
		const budgets = withChange("food", (food) =>
			setFrom(setMonth(food, "2026-10", 800000), "2026-09", 700000),
		);
		const tenths = (month: Month) =>
			view(month, budgets).budgets.find((row) => row.category === "food")
				?.utilizationTenths;
		expect([tenths("2026-09"), tenths("2026-10"), tenths("2026-11")]).toEqual([
			721, 778, 60,
		]);
	});

	// AC-F04-15
	test("no limit for entertainment in October only: overall 110.2%, unbudgeted 20,148.00", () => {
		const budgets = withChange("entertainment", (each) =>
			setMonth(each, "2026-10", null),
		);
		const october = view("2026-10", budgets);
		expect(october.overall).toEqual({
			limitMinor: 1000000,
			spentMinor: 1102000,
			utilizationTenths: 1102,
			state: "over",
		});
		expect(october.unbudgetedMinor).toBe(2014800);
		expect(october.unbudgeted).toEqual([
			{ category: "housing", spentMinor: 1800000, budgetId: null },
			{
				category: "entertainment",
				spentMinor: 214800,
				budgetId: ID["entertainment"],
			},
		]);
		expect(october.inactive).toEqual([
			expect.objectContaining({
				category: "entertainment",
				status: "skipped",
			}),
		]);
		expect(view("2026-11", budgets).budgets).toHaveLength(4);
	});
});

describe("edges", () => {
	test("a month with no Budgets and no spending is empty", () => {
		expect(
			buildMonthView({
				month: "2026-11",
				budgets: [],
				spending: {},
				previousSpending: {},
			}),
		).toEqual({
			month: "2026-11",
			overall: {
				limitMinor: 0,
				spentMinor: 0,
				utilizationTenths: null,
				state: null,
			},
			totalSpentMinor: 0,
			unbudgetedMinor: 0,
			unbudgeted: [],
			budgets: [],
			inactive: [],
			previous: {
				month: "2026-10",
				limitMinor: 0,
				spentMinor: 0,
				budgetCount: 0,
				overCount: 0,
			},
		});
	});

	test("with spending and no Budget, every spending category is unbudgeted", () => {
		const result = buildMonthView({
			month: "2026-10",
			budgets: [],
			spending: goldenSpending("2026-10"),
			previousSpending: {},
		});
		expect(result.overall.utilizationTenths).toBeNull();
		expect(result.overall.state).toBeNull();
		expect(result.unbudgetedMinor).toBe(3116800);
		expect(result.unbudgeted.map((each) => each.category)).toEqual([
			"housing",
			"food",
			"shopping",
			"entertainment",
			"transportation",
		]);
	});

	// F04 section 13: refunds above expenses in a budgeted category.
	test("negative spending gives negative utilization, On track, and lowers the overall", () => {
		const spending: CategorySpending = { food: -50000, shopping: 150000 };
		const result = buildMonthView({
			month: "2026-11",
			budgets: [goldenBudget("food"), goldenBudget("shopping")],
			spending,
			previousSpending: {},
		});
		expect(figures(result)).toEqual([
			["shopping", 300000, 150000, 500, "ok"],
			["food", 500000, -50000, -100, "ok"],
		]);
		expect(result.budgets[1]?.remainingMinor).toBe(550000);
		expect(result.overall).toMatchObject({
			spentMinor: 100000,
			utilizationTenths: 125,
		});
	});

	test("an unbudgeted category with negative spending is listed last; zero spending is not listed", () => {
		const result = buildMonthView({
			month: "2026-11",
			budgets: [],
			spending: { health: -20000, travel: 0, housing: 10000 },
			previousSpending: {},
		});
		expect(result.unbudgeted).toEqual([
			{ category: "housing", spentMinor: 10000, budgetId: null },
			{ category: "health", spentMinor: -20000, budgetId: null },
		]);
		expect(result.totalSpentMinor).toBe(-10000);
	});

	test("an unbudgeted tie keeps CAT-2's order", () => {
		const result = buildMonthView({
			month: "2026-11",
			budgets: [],
			spending: { travel: 5000, food: 5000, health: 5000 },
			previousSpending: {},
		});
		expect(result.unbudgeted.map((each) => each.category)).toEqual([
			"food",
			"health",
			"travel",
		]);
	});

	test("an over row with a lower utilization still sorts before a warning row with a higher one", () => {
		const result = buildMonthView({
			month: "2026-11",
			budgets: [goldenBudget("food"), goldenBudget("shopping")],
			spending: { food: 500000, shopping: 299700 },
			previousSpending: {},
		});
		expect(
			result.budgets.map((row) => [row.category, row.utilizationTenths]),
		).toEqual([
			["food", 1000],
			["shopping", 999],
		]);
	});

	test("Not active records sort by label, not by CAT-2's order", () => {
		const budgets = withChange("entertainment", (each) =>
			setFrom(each, "2026-11", null),
		).map((budget) =>
			budget.category === "transportation" ?
				{ ...budget, ...setFrom(budget, "2026-11", null) }
			:	budget,
		);
		expect(
			view("2026-12", budgets).inactive.map((each) => each.category),
		).toEqual(["entertainment", "transportation"]);
	});

	test("the previous month crosses a year", () => {
		expect(view("2027-01").previous).toMatchObject({
			month: "2026-12",
			limitMinor: 1100000,
			budgetCount: 4,
		});
	});
});

// AC-F04-21: the year summary reads each month view's overall utilization.
test("golden 2026's overall utilization: January to August null, then 810, 1197, 38 and 0", () => {
	const months = Array.from(
		{ length: 12 },
		(_, index) => `2026-${String(index + 1).padStart(2, "0")}`,
	);
	expect(months.map((month) => view(month).overall.utilizationTenths)).toEqual([
		null,
		null,
		null,
		null,
		null,
		null,
		null,
		null,
		810,
		1197,
		38,
		0,
	]);
});
