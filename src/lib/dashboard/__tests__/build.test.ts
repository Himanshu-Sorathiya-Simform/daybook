import { describe, expect, test } from "vitest";

import {
	buildMonthView,
	type BudgetRecord,
	type CategorySpending,
} from "@/lib/budgets/view";
import type { Transaction } from "@/lib/transactions/model";

import { GOLDEN_BUDGETS } from "../../../../seed/golden";
import { buildDashboard, type DashboardInput } from "../build";
import { NOVEMBER_DAILY, OCTOBER_DAILY, SEPTEMBER_DAILY } from "./golden";

const RECORDS = GOLDEN_BUDGETS.map((budget) => ({
	...budget,
})) as unknown as BudgetRecord[];

const OCTOBER_SPENDING = {
	housing: 1800000,
	food: 622000,
	shopping: 300000,
	entertainment: 214800,
	transportation: 180000,
};
const view = (month: string, spending: CategorySpending = OCTOBER_SPENDING) =>
	buildMonthView({ month, budgets: RECORDS, spending, previousSpending: {} });

const day = (key: string, spendingMinor: number) => ({
	key,
	incomeMinor: 0,
	spendingMinor,
});
const DAYS = [...SEPTEMBER_DAILY, ...OCTOBER_DAILY, ...NOVEMBER_DAILY].map((entry) =>
	day(entry.date, entry.outMinor),
);

const SUBSCRIPTIONS = {
	monthlyMinor: 2027392,
	yearlyMinor: 24328700,
	count: 4,
	upcoming: [],
};
const MONTHS = [
	{ key: "2026-09", incomeMinor: 9700000, spendingMinor: 2804900 },
	{ key: "2026-10", incomeMinor: 8500000, spendingMinor: 3116800 },
	{ key: "2026-11", incomeMinor: 0, spendingMinor: 1842000 },
];

/** Golden October as the data access layer would read it on 2 November. */
const october = (changes: Partial<DashboardInput> = {}): DashboardInput => ({
	month: "2026-10",
	today: "2026-11-02",
	currency: "INR",
	totals: {
		current: {
			incomeMinor: 8500000,
			spendingMinor: 3116800,
			toGoalsMinor: 700000,
			netMinor: 5383200,
		},
		previous: {
			incomeMinor: 9700000,
			spendingMinor: 2804900,
			toGoalsMinor: 800000,
			netMinor: 6895100,
		},
	},
	categories: [
		day("food", 622000),
		day("housing", 1800000),
		day("transportation", 180000),
		day("shopping", 300000),
		day("entertainment", 214800),
	],
	days: DAYS,
	months: MONTHS,
	bounds: { firstOn: "2026-09-01", lastOn: "2026-11-01" },
	budgets: view("2026-10"),
	subscriptions: SUBSCRIPTIONS,
	recent: { items: [] as Transaction[], groups: [] },
	accountEmpty: false,
	...changes,
});

describe("buildDashboard, golden October (F08 section 5)", () => {
	const answer = buildDashboard(october());

	test("names the month and says it is not to date", () => {
		expect(answer).toMatchObject({
			month: "2026-10",
			partial: false,
			earliestMonth: "2026-09",
			accountEmpty: false,
			currency: "INR",
		});
	});

	test("compares spending with September", () => {
		expect(answer.spending).toEqual({
			outMinor: 3116800,
			previousOutMinor: 2804900,
			deltaMinor: 311900,
			deltaTenths: 111,
		});
	});

	test("works out the savings, the rate and September's", () => {
		expect(answer.savings).toEqual({
			incomeMinor: 8500000,
			outMinor: 3116800,
			netMinor: 5383200,
			toGoalsMinor: 700000,
			unallocatedMinor: 4683200,
			rateTenths: 633,
			previous: { incomeMinor: 9700000, netMinor: 6895100, rateTenths: 711 },
		});
	});

	test("lists the days with Out, oldest first", () => {
		expect(answer.daily).toHaveLength(18);
		expect(answer.daily[0]).toEqual({ date: "2026-09-01", outMinor: 1800000 });
		expect(answer.daily.at(-1)).toEqual({
			date: "2026-11-01",
			outMinor: 1842000,
		});
	});

	test("sorts the categories by Out, largest first", () => {
		expect(answer.categories.map((row) => row.category)).toEqual([
			"housing",
			"food",
			"shopping",
			"entertainment",
			"transportation",
		]);
	});

	test("lists the months from the first to the current one", () => {
		expect(answer.months).toEqual([
			{ month: "2026-09", outMinor: 2804900 },
			{ month: "2026-10", outMinor: 3116800 },
			{ month: "2026-11", outMinor: 1842000 },
		]);
	});

	test("takes the 12 months ending at the month asked for", () => {
		expect(answer.incomeExpenses.map((row) => row.month)).toEqual([
			"2025-11",
			"2025-12",
			"2026-01",
			"2026-02",
			"2026-03",
			"2026-04",
			"2026-05",
			"2026-06",
			"2026-07",
			"2026-08",
			"2026-09",
			"2026-10",
		]);
		expect(answer.incomeExpenses.slice(-2)).toEqual([
			{ month: "2026-09", incomeMinor: 9700000, outMinor: 2804900 },
			{ month: "2026-10", incomeMinor: 8500000, outMinor: 3116800 },
		]);
	});

	test("counts the Budgets by state and names the top ones", () => {
		expect(answer.budgets.summary).toEqual({ over: 2, atLimit: 1, near: 1 });
		expect(answer.budgets.count).toBe(4);
		expect(answer.budgets.top.map((row) => row.category)).toEqual([
			"entertainment",
			"food",
			"shopping",
			"transportation",
		]);
		expect(answer.budgets.overall).toEqual({
			limitMinor: 1100000,
			spentMinor: 1316800,
			utilizationTenths: 1197,
			state: "over",
		});
	});

	test("renames the unbudgeted spending to Out", () => {
		expect(answer.budgets.unbudgeted).toEqual([
			{ category: "housing", outMinor: 1800000 },
		]);
	});

	test("passes the Subscriptions and the recent rows through, and the placeholders stay empty", () => {
		expect(answer.subscriptions).toBe(SUBSCRIPTIONS);
		expect(answer.recent).toEqual({ items: [], groups: [] });
		expect(answer.goals).toEqual([]);
		expect(answer.investments).toBeNull();
	});
});

describe("buildDashboard, golden November (to date)", () => {
	const answer = buildDashboard(
		october({
			month: "2026-11",
			totals: {
				current: {
					incomeMinor: 0,
					spendingMinor: 1842000,
					toGoalsMinor: 0,
					netMinor: -1842000,
				},
				previous: {
					incomeMinor: 8500000,
					spendingMinor: 3116800,
					toGoalsMinor: 700000,
					netMinor: 5383200,
				},
			},
			budgets: view("2026-11", { housing: 1800000, food: 42000 }),
		}),
	);

	test("is to date, with spending down 40.9% on October", () => {
		expect(answer.partial).toBe(true);
		expect(answer.spending).toMatchObject({
			deltaMinor: -1274800,
			deltaTenths: -409,
		});
	});

	test("has no rate without income, and October's as the previous one", () => {
		expect(answer.savings.rateTenths).toBeNull();
		expect(answer.savings.unallocatedMinor).toBe(-1842000);
		expect(answer.savings.previous.rateTenths).toBe(633);
	});

	test("ends the 12 months in November", () => {
		expect(answer.incomeExpenses[0]?.month).toBe("2025-12");
		expect(answer.incomeExpenses[11]?.month).toBe("2026-11");
	});

	test("counts every Budget as within limit", () => {
		expect(answer.budgets.summary).toEqual({ over: 0, atLimit: 0, near: 0 });
		expect(answer.budgets.count).toBe(4);
	});
});

describe("buildDashboard, the edges", () => {
	test("without rows the earliest month is the current one, and the picker has one month", () => {
		const answer = buildDashboard(
			october({
				bounds: null,
				months: [],
				days: [],
				categories: [],
				month: "2026-11",
			}),
		);
		expect(answer.earliestMonth).toBe("2026-11");
		expect(answer.months).toEqual([{ month: "2026-11", outMinor: 0 }]);
		expect(answer.daily).toEqual([]);
		expect(answer.categories).toEqual([]);
	});

	test("an earliest date after today (never stored) is held at the current month", () => {
		const answer = buildDashboard(
			october({ bounds: { firstOn: "2027-01-05", lastOn: "2027-01-05" } }),
		);
		expect(answer.earliestMonth).toBe("2026-11");
		expect(answer.months).toEqual([{ month: "2026-11", outMinor: 1842000 }]);
	});

	test("a month with no row reads zero in the picker and the chart", () => {
		const answer = buildDashboard(
			october({
				bounds: { firstOn: "2026-07-03", lastOn: "2026-11-01" },
			}),
		);
		expect(answer.months.map((row) => [row.month, row.outMinor])).toEqual([
			["2026-07", 0],
			["2026-08", 0],
			["2026-09", 2804900],
			["2026-10", 3116800],
			["2026-11", 1842000],
		]);
	});

	test("leaves out a day and a category whose Out is zero, and keeps a negative one", () => {
		const answer = buildDashboard(
			october({
				days: [
					day("2026-10-02", 0),
					day("2026-10-03", -500),
					day("2026-10-01", 900),
				],
				categories: [
					day("food", 0),
					day("shopping", -3000),
					day("health", 500),
				],
			}),
		);
		expect(answer.daily).toEqual([
			{ date: "2026-10-01", outMinor: 900 },
			{ date: "2026-10-03", outMinor: -500 },
		]);
		expect(answer.categories).toEqual([
			{ category: "health", outMinor: 500 },
			{ category: "shopping", outMinor: -3000 },
		]);
	});

	test("breaks a tie between categories by key", () => {
		const answer = buildDashboard(
			october({ categories: [day("shopping", 100), day("food", 100)] }),
		);
		expect(answer.categories.map((row) => row.category)).toEqual([
			"food",
			"shopping",
		]);
	});

	test("has no previous change when the previous month had no spending", () => {
		const answer = buildDashboard(
			october({
				totals: {
					current: october().totals.current,
					previous: {
						incomeMinor: 0,
						spendingMinor: 0,
						toGoalsMinor: 0,
						netMinor: 0,
					},
				},
			}),
		);
		expect(answer.spending.deltaTenths).toBeNull();
		expect(answer.spending.deltaMinor).toBe(3116800);
		expect(answer.savings.previous).toEqual({
			incomeMinor: 0,
			netMinor: 0,
			rateTenths: null,
		});
	});

	test("reports an empty account as it is told", () => {
		expect(buildDashboard(october({ accountEmpty: true })).accountEmpty).toBe(
			true,
		);
	});

	test("takes the currency from the profile", () => {
		expect(buildDashboard(october({ currency: "USD" })).currency).toBe("USD");
	});

	test("reads the current month from today, so the next month is to date", () => {
		const answer = buildDashboard(
			october({ today: "2026-12-01", month: "2026-12" }),
		);
		expect(answer.partial).toBe(true);
		expect(answer.months.at(-1)?.month).toBe("2026-12");
	});

	test("never changes its input", () => {
		const input = october();
		const copy = structuredClone(input);
		buildDashboard(input);
		expect(input).toEqual(copy);
	});
});
