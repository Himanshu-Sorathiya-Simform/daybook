import { sql } from "drizzle-orm";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

import { GOLDEN_NOW } from "../../../../../seed/golden";
import { insertProfile } from "../../../../../seed/load-golden";
import { createUser } from "../../../db/__tests__/private-rows";
import { runtimePool } from "../../../db/pools";
import { parseOwnerEnv } from "../../../env";
import {
	addExpense,
	asUser,
	goldenContext,
} from "../../transactions/__tests__/helpers";
import {
	budgetHistory,
	type BudgetMonthAnswer,
	budgetMonth,
	budgetMonths,
	budgetYearSummary,
} from "../read";
import { goldenBudgetUser } from "./helpers";

/** The Budget reads (F04 section 11, BR-F04-34, BR-F04-35) through the runtime role and RLS,
 * against the golden dataset. Expected figures are copied from F04 section 5 and
 * docs/03-golden-dataset.md#budgets. */

let owner: Client;
let userId: string;
let ids: Record<string, string>;
let neighbour: string;
let empty: string;

beforeAll(async () => {
	owner = new Client({
		connectionString: parseOwnerEnv(process.env).DATABASE_URL_OWNER,
	});
	await owner.connect();
	({ userId, ids } = await goldenBudgetUser(owner, "budget-reads"));
	// A second golden user: had RLS failed, every golden figure here would double.
	neighbour = (await goldenBudgetUser(owner, "budget-reads-neighbour")).userId;
	empty = await createUser(owner, "budget-reads-empty");
	await insertProfile(owner, empty);
});

afterAll(async () => {
	await owner?.query(`DELETE FROM auth."user" WHERE id = ANY($1)`, [
		[userId, neighbour, empty].filter(Boolean),
	]);
	await owner?.end();
	await runtimePool().end();
});

const read = <T>(fn: Parameters<typeof asUser<T>>[1], who = userId) =>
	asUser(who, fn);

const figures = (view: BudgetMonthAnswer) =>
	view.budgets.map((row) => [
		row.category,
		row.limitMinor,
		row.spentMinor,
		row.utilizationTenths,
		row.state,
	]);

describe("budgetMonth (AC-F04-01, AC-F04-02)", () => {
	// F04 section 15's October, in full.
	test("answers golden October as section 15 shows it, in one statement", async () => {
		const { result, statements } = await read((tx) =>
			budgetMonth(tx, goldenContext(userId), "2026-10"),
		);
		expect(statements).toBe(1);
		const stored = (category: string, schedule: unknown, version: number) => ({
			id: ids[category],
			category,
			schedule,
			overrides: [],
			version,
			demo: false,
			createdAt: GOLDEN_NOW,
			updatedAt: GOLDEN_NOW,
		});
		expect(result).toEqual({
			month: "2026-10",
			currency: "INR",
			overall: {
				limitMinor: 1100000,
				spentMinor: 1316800,
				utilizationTenths: 1197,
				state: "over",
			},
			totalSpentMinor: 3116800,
			unbudgetedMinor: 1800000,
			unbudgeted: [
				{ category: "housing", spentMinor: 1800000, budgetId: null },
			],
			budgets: [
				{
					...stored(
						"entertainment",
						[{ from: "2026-09", limitMinor: 100000 }],
						1,
					),
					limitMinor: 100000,
					spentMinor: 214800,
					remainingMinor: -114800,
					utilizationTenths: 2148,
					state: "over",
					source: {
						kind: "schedule",
						from: "2026-09",
						limitMinor: 100000,
					},
					next: null,
				},
				{
					...stored(
						"food",
						[
							{ from: "2026-09", limitMinor: 600000 },
							{ from: "2026-10", limitMinor: 500000 },
						],
						2,
					),
					limitMinor: 500000,
					spentMinor: 622000,
					remainingMinor: -122000,
					utilizationTenths: 1244,
					state: "over",
					source: {
						kind: "schedule",
						from: "2026-10",
						limitMinor: 500000,
					},
					next: null,
				},
				{
					...stored(
						"shopping",
						[{ from: "2026-09", limitMinor: 300000 }],
						1,
					),
					limitMinor: 300000,
					spentMinor: 300000,
					remainingMinor: 0,
					utilizationTenths: 1000,
					state: "over",
					source: {
						kind: "schedule",
						from: "2026-09",
						limitMinor: 300000,
					},
					next: null,
				},
				{
					...stored(
						"transportation",
						[{ from: "2026-10", limitMinor: 200000 }],
						1,
					),
					limitMinor: 200000,
					spentMinor: 180000,
					remainingMinor: 20000,
					utilizationTenths: 900,
					state: "warning",
					source: {
						kind: "schedule",
						from: "2026-10",
						limitMinor: 200000,
					},
					next: null,
				},
			],
			inactive: [],
			previous: {
				month: "2026-09",
				limitMinor: 1000000,
				spentMinor: 809900,
				budgetCount: 3,
				overCount: 0,
			},
		});
	});

	test("answers golden September, with transportation Not budgeted and starting in October (AC-F04-13)", async () => {
		const { result } = await read((tx) =>
			budgetMonth(tx, goldenContext(userId), "2026-09"),
		);
		expect(figures(result)).toEqual([
			["food", 600000, 505000, 842, "warning"],
			["shopping", 300000, 240000, 800, "warning"],
			["entertainment", 100000, 64900, 649, "ok"],
		]);
		expect(result.overall).toMatchObject({
			spentMinor: 809900,
			utilizationTenths: 810,
		});
		expect(result.unbudgeted).toEqual([
			{ category: "housing", spentMinor: 1800000, budgetId: null },
			{ category: "health", spentMinor: 150000, budgetId: null },
			{
				category: "transportation",
				spentMinor: 45000,
				budgetId: ids["transportation"],
			},
		]);
		expect(result.totalSpentMinor).toBe(2804900);
		expect(result.inactive).toEqual([
			expect.objectContaining({
				id: ids["transportation"],
				status: "starts",
				from: "2026-10",
			}),
		]);
		expect(result.budgets[0]?.next).toEqual({
			from: "2026-10",
			limitMinor: 500000,
		});
		expect(result.previous).toEqual({
			month: "2026-08",
			limitMinor: 0,
			spentMinor: 0,
			budgetCount: 0,
			overCount: 0,
		});
	});

	// Golden #26 is 00:30 on 1 November in Kolkata, 31 October in UTC: it counts in November.
	test("answers golden November by local date, with the limits carried forward", async () => {
		const { result } = await read((tx) =>
			budgetMonth(tx, goldenContext(userId), "2026-11"),
		);
		expect(figures(result)).toEqual([
			["food", 500000, 42000, 84, "ok"],
			["shopping", 300000, 0, 0, "ok"],
			["transportation", 200000, 0, 0, "ok"],
			["entertainment", 100000, 0, 0, "ok"],
		]);
		expect(result.overall).toMatchObject({
			spentMinor: 42000,
			utilizationTenths: 38,
		});
		expect(result.totalSpentMinor).toBe(1842000);
		// AC-F04-19: October, At limit counted as over.
		expect(result.previous).toEqual({
			month: "2026-10",
			limitMinor: 1100000,
			spentMinor: 1316800,
			budgetCount: 4,
			overCount: 3,
		});
	});

	// AC-F04-02
	test("budgeted plus unbudgeted spending is the total, every month", async () => {
		const { result } = await read((tx) =>
			budgetMonths(tx, goldenContext(userId), [
				"2026-08",
				"2026-09",
				"2026-10",
				"2026-11",
				"2026-12",
			]),
		);
		for (const view of result) {
			expect(view.overall.spentMinor + view.unbudgetedMinor).toBe(
				view.totalSpentMinor,
			);
		}
	});

	test("counts confirmed expenses less refunds, and no income", async () => {
		const { result } = await read(async (tx) => {
			await addExpense(tx, userId, {
				payee: "Croma",
				amountMinor: 50000,
				occurredOn: "2026-11-01",
				category: "shopping",
				type: "refund",
			});
			await addExpense(tx, userId, {
				payee: "Acme Corp",
				amountMinor: 9900000,
				occurredOn: "2026-11-01",
				category: "salary",
				type: "income",
			});
			return budgetMonth(tx, goldenContext(userId), "2026-11");
		});
		expect(
			result.budgets.find((row) => row.category === "shopping"),
		).toMatchObject({
			spentMinor: -50000,
			utilizationTenths: -167,
			state: "ok",
		});
		expect(result.totalSpentMinor).toBe(1792000);
	});

	test("counts a month's first and last days, and nothing outside them", async () => {
		const { result } = await read(async (tx) => {
			for (const [occurredOn, amountMinor] of [
				["2026-11-30", 100],
				["2026-12-01", 10000],
				["2026-12-31", 20000],
				["2027-01-01", 40000],
			] as const) {
				await addExpense(tx, userId, {
					payee: "Edge",
					amountMinor,
					occurredOn,
					occurredAt: `${occurredOn}T06:30:00Z`,
					createdAt: `${occurredOn}T06:30:00Z`,
					category: "travel",
				});
			}
			return budgetMonth(tx, goldenContext(userId), "2026-12");
		});
		expect(result.unbudgeted).toEqual([
			{ category: "travel", spentMinor: 30000, budgetId: null },
		]);
		expect(result.previous.month).toBe("2026-11");
	});

	test("a user with no Budgets and no Transactions sees an empty month, never the golden users' rows", async () => {
		const { result } = await read(
			(tx) => budgetMonth(tx, goldenContext(empty), "2026-11"),
			empty,
		);
		expect(result).toMatchObject({
			overall: {
				limitMinor: 0,
				spentMinor: 0,
				utilizationTenths: null,
				state: null,
			},
			totalSpentMinor: 0,
			unbudgeted: [],
			budgets: [],
			inactive: [],
		});
	});
});

describe("budgetMonths", () => {
	test("answers each month asked, in the order asked, in one statement", async () => {
		const { result, statements } = await read((tx) =>
			budgetMonths(tx, goldenContext(userId), ["2026-11", "2026-09"]),
		);
		expect(statements).toBe(1);
		expect(
			result.map((view) => [view.month, view.overall.utilizationTenths]),
		).toEqual([
			["2026-11", 38],
			["2026-09", 810],
		]);
		expect(result[1]?.previous.month).toBe("2026-08");
	});

	test("answers nothing for no months, without a statement", async () => {
		const { result, statements } = await read((tx) =>
			budgetMonths(tx, goldenContext(userId), []),
		);
		expect(result).toEqual([]);
		expect(statements).toBe(0);
	});
});

describe("budgetHistory (AC-F04-20)", () => {
	test("food, 6 months to November: three with no limit, then September to November", async () => {
		const { result, statements } = await read((tx) =>
			budgetHistory(tx, goldenContext(userId), {
				category: "food",
				to: "2026-11",
				count: 6,
			}),
		);
		expect(statements).toBe(1);
		expect(result).toEqual({
			category: "food",
			currency: "INR",
			months: [
				{ month: "2026-06", limitMinor: null, spentMinor: 0 },
				{ month: "2026-07", limitMinor: null, spentMinor: 0 },
				{ month: "2026-08", limitMinor: null, spentMinor: 0 },
				{ month: "2026-09", limitMinor: 600000, spentMinor: 505000 },
				{ month: "2026-10", limitMinor: 500000, spentMinor: 622000 },
				{ month: "2026-11", limitMinor: 500000, spentMinor: 42000 },
			],
		});
	});

	test("transportation, 2 months to October: no limit and 450.00, then 2,000.00 and 1,800.00", async () => {
		const { result } = await read((tx) =>
			budgetHistory(tx, goldenContext(userId), {
				category: "transportation",
				to: "2026-10",
				count: 2,
			}),
		);
		expect(result.months).toEqual([
			{ month: "2026-09", limitMinor: null, spentMinor: 45000 },
			{ month: "2026-10", limitMinor: 200000, spentMinor: 180000 },
		]);
	});

	test("health, with no Budget record: its spending and no limits", async () => {
		const { result } = await read((tx) =>
			budgetHistory(tx, goldenContext(userId), {
				category: "health",
				to: "2026-10",
				count: 2,
			}),
		);
		expect(result.months).toEqual([
			{ month: "2026-09", limitMinor: null, spentMinor: 150000 },
			{ month: "2026-10", limitMinor: null, spentMinor: 0 },
		]);
	});

	test("one month, and the most, 49, across years", async () => {
		const one = await read((tx) =>
			budgetHistory(tx, goldenContext(userId), {
				category: "food",
				to: "2026-10",
				count: 1,
			}),
		);
		expect(one.result.months).toEqual([
			{ month: "2026-10", limitMinor: 500000, spentMinor: 622000 },
		]);
		const most = await read((tx) =>
			budgetHistory(tx, goldenContext(userId), {
				category: "food",
				to: "2027-11",
				count: 49,
			}),
		);
		expect(most.result.months).toHaveLength(49);
		expect(most.result.months[0]).toEqual({
			month: "2023-11",
			limitMinor: null,
			spentMinor: 0,
		});
		expect(most.result.months[48]).toEqual({
			month: "2027-11",
			limitMinor: 500000,
			spentMinor: 0,
		});
	});

	test("takes a one-month limit as that month's limit", async () => {
		const { result } = await read(async (tx) => {
			await tx.execute(
				sql`UPDATE app.budgets SET overrides = '[{"month": "2026-10", "limitMinor": 800000}]'
				WHERE category = 'food'`,
			);
			return budgetHistory(tx, goldenContext(userId), {
				category: "food",
				to: "2026-11",
				count: 2,
			});
		});
		expect(result.months.map((month) => month.limitMinor)).toEqual([
			800000, 500000,
		]);
	});
});

describe("budgetYearSummary (AC-F04-21)", () => {
	test("2026: January to August null, then 810, 1197, 38 and 0, in one statement", async () => {
		const { result, statements } = await read((tx) =>
			budgetYearSummary(tx, goldenContext(userId), 2026),
		);
		expect(statements).toBe(1);
		expect(result).toEqual({
			year: 2026,
			months: [
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
				"2026-11",
				"2026-12",
			].map((month, index) => ({
				month,
				utilizationTenths: [
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
				][index],
			})),
		});
	});

	test("2027 carries every limit forward with nothing spent; 2023 has no Budget", async () => {
		const later = await read((tx) =>
			budgetYearSummary(tx, goldenContext(userId), 2027),
		);
		expect(later.result.months.map((month) => month.utilizationTenths)).toEqual(
			Array.from({ length: 12 }, () => 0),
		);
		const earlier = await read((tx) =>
			budgetYearSummary(tx, goldenContext(userId), 2023),
		);
		expect(
			earlier.result.months.map((month) => month.utilizationTenths),
		).toEqual(Array.from({ length: 12 }, () => null));
	});
});
