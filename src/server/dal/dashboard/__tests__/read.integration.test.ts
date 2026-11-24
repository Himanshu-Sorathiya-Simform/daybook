import type { Client } from "pg";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

import { GOLDEN_BUDGETS } from "../../../../../seed/golden";
import {
	insertBudgets,
	insertProfile,
	type LoadedBudget,
} from "../../../../../seed/load-golden";
import { connectOwner } from "../../../db/__tests__/owner";
import { createUser } from "../../../db/__tests__/private-rows";
import { accountEmpty } from "../../account-empty";
import { goldenBudgetUser } from "../../budgets/__tests__/helpers";
import { addSubscription, ownerExec } from "../../subscriptions/__tests__/helpers";
import {
	addExpense,
	asUser,
	goldenContext,
	uuidV7At,
} from "../../transactions/__tests__/helpers";
import { transactionSummary } from "../../transactions/summary";
import { dashboardData } from "../read";

/** `GET /api/dashboard`'s data (F08 section 5, BR-F08-03, BR-F08-04) through the runtime role and
 * RLS, against the golden dataset on 2 November. Expected figures are copied from F08 section 5
 * and docs/03-golden-dataset.md. */

let owner: Client;
let golden: string;
let neighbour: string;
let empty: string;
const users: string[] = [];

beforeAll(async () => {
	owner = await connectOwner();
	golden = (await goldenBudgetUser(owner, "dash-golden")).userId;
	// A second golden user: had RLS failed, every golden figure here would double.
	neighbour = (await goldenBudgetUser(owner, "dash-neighbour")).userId;
	empty = await createUser(owner, "dash-empty");
	await insertProfile(owner, empty);
	users.push(golden, neighbour, empty);
});

afterAll(async () => {
	await owner?.query(`DELETE FROM auth."user" WHERE id = ANY($1)`, [users]);
	await owner?.end();
});

const month = (who: string, value: string) =>
	asUser(who, (tx) => dashboardData(tx, goldenContext(who), value));

/** A user with a profile and nothing else, for the cases that add one row. */
async function blankUser(label: string): Promise<string> {
	const id = await createUser(owner, label);
	await insertProfile(owner, id);
	users.push(id);
	return id;
}

const SEPTEMBER_OUT = 2804900;
const OCTOBER_OUT = 3116800;

// AC-F08-01
describe("golden October (F08 section 5)", () => {
	test("the summary: spending against September, and the savings", async () => {
		const { result } = await month(golden, "2026-10");
		expect(result).toMatchObject({
			month: "2026-10",
			partial: false,
			earliestMonth: "2026-09",
			accountEmpty: false,
			currency: "INR",
			spending: {
				outMinor: OCTOBER_OUT,
				previousOutMinor: SEPTEMBER_OUT,
				deltaMinor: 311900,
				deltaTenths: 111,
			},
			savings: {
				incomeMinor: 8500000,
				outMinor: OCTOBER_OUT,
				netMinor: 5383200,
				// The loaded golden user holds no Goal rows until F06 (D-471): the dataset's
				// To Goals 7,000.00 and unallocated 46,832.00 follow then.
				toGoalsMinor: 0,
				unallocatedMinor: 5383200,
				rateTenths: 633,
				previous: {
					incomeMinor: 9700000,
					netMinor: 6895100,
					rateTenths: 711,
				},
			},
		});
	});

	test("the days of September and October with Out, a refund below zero", async () => {
		const { result } = await month(golden, "2026-10");
		expect(result.daily).toEqual([
			{ date: "2026-09-01", outMinor: 1800000 },
			{ date: "2026-09-03", outMinor: 185000 },
			{ date: "2026-09-05", outMinor: 64900 },
			{ date: "2026-09-08", outMinor: 240000 },
			{ date: "2026-09-10", outMinor: 150000 },
			{ date: "2026-09-12", outMinor: 320000 },
			{ date: "2026-09-20", outMinor: 45000 },
			{ date: "2026-10-01", outMinor: 1800000 },
			{ date: "2026-10-04", outMinor: 230000 },
			{ date: "2026-10-05", outMinor: 64900 },
			{ date: "2026-10-07", outMinor: 450000 },
			{ date: "2026-10-09", outMinor: -150000 },
			{ date: "2026-10-11", outMinor: 180000 },
			{ date: "2026-10-12", outMinor: 149900 },
			{ date: "2026-10-14", outMinor: 290000 },
			{ date: "2026-10-19", outMinor: 64000 },
			{ date: "2026-10-31", outMinor: 38000 },
		]);
	});

	test("the months for the picker, September to November", async () => {
		const { result } = await month(golden, "2026-10");
		expect(result.months).toEqual([
			{ month: "2026-09", outMinor: SEPTEMBER_OUT },
			{ month: "2026-10", outMinor: OCTOBER_OUT },
			{ month: "2026-11", outMinor: 1842000 },
		]);
	});

	test("the Budgets: overall, the counts, the top four, and housing not budgeted", async () => {
		const { result } = await month(golden, "2026-10");
		expect(result.budgets).toEqual({
			overall: {
				limitMinor: 1100000,
				spentMinor: 1316800,
				utilizationTenths: 1197,
				state: "over",
			},
			summary: { over: 2, atLimit: 1, near: 1 },
			count: 4,
			top: [
				{
					category: "entertainment",
					limitMinor: 100000,
					spentMinor: 214800,
					utilizationTenths: 2148,
					state: "over",
				},
				{
					category: "food",
					limitMinor: 500000,
					spentMinor: 622000,
					utilizationTenths: 1244,
					state: "over",
				},
				{
					category: "shopping",
					limitMinor: 300000,
					spentMinor: 300000,
					utilizationTenths: 1000,
					state: "over",
				},
				{
					category: "transportation",
					limitMinor: 200000,
					spentMinor: 180000,
					utilizationTenths: 900,
					state: "warning",
				},
			],
			unbudgeted: [{ category: "housing", outMinor: 1800000 }],
		});
	});

	test("spending by category, largest first, with no Other and no empty category", async () => {
		const { result } = await month(golden, "2026-10");
		expect(result.categories).toEqual([
			{ category: "housing", outMinor: 1800000 },
			{ category: "food", outMinor: 622000 },
			{ category: "shopping", outMinor: 300000 },
			{ category: "entertainment", outMinor: 214800 },
			{ category: "transportation", outMinor: 180000 },
		]);
	});

	test("income against spending for the 12 months ending October", async () => {
		const { result } = await month(golden, "2026-10");
		expect(result.incomeExpenses).toHaveLength(12);
		expect(result.incomeExpenses[0]).toEqual({
			month: "2025-11",
			incomeMinor: 0,
			outMinor: 0,
		});
		expect(result.incomeExpenses.slice(-2)).toEqual([
			{ month: "2026-09", incomeMinor: 9700000, outMinor: SEPTEMBER_OUT },
			{ month: "2026-10", incomeMinor: 8500000, outMinor: OCTOBER_OUT },
		]);
		expect(
			result.incomeExpenses
				.slice(0, 10)
				.every((row) => row.incomeMinor === 0 && row.outMinor === 0),
		).toBe(true);
	});

	test("Coming up: the costs and the four renewals", async () => {
		const { result } = await month(golden, "2026-10");
		expect(result.subscriptions).toMatchObject({
			monthlyMinor: 2027392,
			yearlyMinor: 24328700,
			count: 4,
		});
		expect(
			result.subscriptions.upcoming.map((entry) => [
				entry.name,
				entry.dueOn,
				entry.amountMinor,
			]),
		).toEqual([
			["Netflix", "2026-11-05", 64900],
			["Cult Gym", "2026-11-10", 150000],
			["Sunrise Apartments", "2026-12-01", 1800000],
			["Amazon Prime", "2027-10-12", 149900],
		]);
	});

	// Without the Goal rows #22 and #23 (D-471), the 8 newest are #25, #24, #21 to #16.
	test("Recent Transactions: the 8 newest rows the table holds, with their days' totals", async () => {
		const { result } = await month(golden, "2026-10");
		expect(
			result.recent.items.map((row) => [row.type, row.amountMinor]),
		).toEqual([
			["expense", 38000],
			["expense", 64000],
			["expense", 290000],
			["expense", 149900],
			["expense", 180000],
			["refund", 150000],
			["expense", 450000],
			["expense", 64900],
		]);
		expect(
			result.recent.groups.map((group) => [group.key, group.outMinor]),
		).toEqual([
			["2026-10-31", 38000],
			["2026-10-19", 64000],
			["2026-10-14", 290000],
			["2026-10-12", 149900],
			["2026-10-11", 180000],
			["2026-10-09", -150000],
			["2026-10-07", 450000],
			["2026-10-05", 64900],
		]);
	});

	test("the placeholders: no Goals and no portfolio until F06 and F07", async () => {
		const { result } = await month(golden, "2026-10");
		expect(result.goals).toEqual([]);
		expect(result.investments).toBeNull();
	});

	// AC-F08-11
	test("runs 5 statements, within the budget of 8", async () => {
		const { statements } = await month(golden, "2026-10");
		expect(statements).toBe(5);
		expect(statements).toBeLessThanOrEqual(8);
	});

	// AC-F08-02
	test("spending, income and To Goals equal the list's header for October", async () => {
		const { result } = await asUser(golden, async (tx) => ({
			answer: await dashboardData(tx, goldenContext(golden), "2026-10"),
			summary: await transactionSummary(
				tx,
				goldenContext(golden),
				{ from: "2026-10-01", to: "2026-10-31" },
				[],
			),
		}));
		expect(result.answer.savings.incomeMinor).toBe(result.summary.incomeMinor);
		expect(result.answer.spending.outMinor).toBe(result.summary.spendingMinor);
		expect(result.answer.savings.toGoalsMinor).toBe(result.summary.toGoalsMinor);
	});

	test("category spending sums to total spending (golden invariant 1)", async () => {
		const { result } = await month(golden, "2026-10");
		const sum = result.categories.reduce(
			(total, row) => total + row.outMinor,
			0,
		);
		expect(sum).toBe(result.spending.outMinor);
	});

	test("a neighbour's identical data never doubles a figure", async () => {
		const a = (await month(golden, "2026-10")).result;
		const b = (await month(neighbour, "2026-10")).result;
		expect(b.spending).toEqual(a.spending);
		expect(b.months).toEqual(a.months);
		expect(b.recent.items).toHaveLength(8);
	});
});

describe("golden November, to date (F08 section 5)", () => {
	test("spending against October, and no income", async () => {
		const { result } = await month(golden, "2026-11");
		expect(result).toMatchObject({
			month: "2026-11",
			partial: true,
			spending: {
				outMinor: 1842000,
				previousOutMinor: OCTOBER_OUT,
				deltaMinor: -1274800,
				deltaTenths: -409,
			},
			savings: {
				incomeMinor: 0,
				netMinor: -1842000,
				toGoalsMinor: 0,
				unallocatedMinor: -1842000,
				rateTenths: null,
				previous: {
					incomeMinor: 8500000,
					netMinor: 5383200,
					rateTenths: 633,
				},
			},
		});
	});

	test("one day with Out in November, after October's", async () => {
		const { result } = await month(golden, "2026-11");
		expect(result.daily.slice(-1)).toEqual([
			{ date: "2026-11-01", outMinor: 1842000 },
		]);
		expect(
			result.daily.filter((day) => day.date.startsWith("2026-11")),
		).toHaveLength(1);
		expect(
			result.daily.filter((day) => day.date.startsWith("2026-10")),
		).toHaveLength(10);
		expect(result.daily.some((day) => day.date.startsWith("2026-09"))).toBe(
			false,
		);
	});

	test("all four Budgets within limit, housing not budgeted", async () => {
		const { result } = await month(golden, "2026-11");
		expect(result.budgets.summary).toEqual({ over: 0, atLimit: 0, near: 0 });
		expect(result.budgets.count).toBe(4);
		expect(result.budgets.unbudgeted).toEqual([
			{ category: "housing", outMinor: 1800000 },
		]);
	});

	test("the 12 months end in November, and Recent holds the two charges of 1 November", async () => {
		const { result } = await month(golden, "2026-11");
		expect(result.incomeExpenses[0]?.month).toBe("2025-12");
		expect(result.incomeExpenses[11]).toEqual({
			month: "2026-11",
			incomeMinor: 0,
			outMinor: 1842000,
		});
		expect(
			result.recent.items.map((row) => row.amountMinor).sort((a, b) => a - b),
		).toEqual([42000, 1800000]);
		expect(result.recent.groups).toHaveLength(1);
		expect(result.recent.groups[0]).toMatchObject({
			key: "2026-11-01",
			outMinor: 1842000,
		});
	});
});

describe("other months", () => {
	test("a month before the first Transaction answers zeros, never an error", async () => {
		const { result } = await month(golden, "2026-06");
		expect(result.spending).toEqual({
			outMinor: 0,
			previousOutMinor: 0,
			deltaMinor: 0,
			deltaTenths: null,
		});
		expect(result.savings.rateTenths).toBeNull();
		expect(result.categories).toEqual([]);
		expect(result.recent).toEqual({ items: [], groups: [] });
		expect(result.earliestMonth).toBe("2026-09");
		expect(result.incomeExpenses[0]?.month).toBe("2025-07");
		expect(result.incomeExpenses[11]?.month).toBe("2026-06");
		expect(result.accountEmpty).toBe(false);
	});

	test("September, the first month, compares with August's zero", async () => {
		const { result } = await month(golden, "2026-09");
		expect(result.spending).toMatchObject({
			outMinor: SEPTEMBER_OUT,
			previousOutMinor: 0,
			deltaTenths: null,
		});
		expect(result.savings.previous).toEqual({
			incomeMinor: 0,
			netMinor: 0,
			rateTenths: null,
		});
	});

	test("the picker's months do not change with the month asked for", async () => {
		const a = (await month(golden, "2026-09")).result.months;
		const b = (await month(golden, "2026-11")).result.months;
		expect(a).toEqual(b);
	});
});

describe("a new account", () => {
	test("is empty, with zeros, empty lists and a single month in the picker", async () => {
		const { result, statements } = await month(empty, "2026-11");
		expect(result).toMatchObject({
			accountEmpty: true,
			partial: true,
			earliestMonth: "2026-11",
			months: [{ month: "2026-11", outMinor: 0 }],
			daily: [],
			categories: [],
			spending: { outMinor: 0, deltaTenths: null },
			savings: { incomeMinor: 0, netMinor: 0, rateTenths: null },
			budgets: {
				overall: {
					limitMinor: 0,
					spentMinor: 0,
					utilizationTenths: null,
					state: null,
				},
				summary: { over: 0, atLimit: 0, near: 0 },
				count: 0,
				top: [],
				unbudgeted: [],
			},
			subscriptions: {
				monthlyMinor: 0,
				yearlyMinor: 0,
				count: 0,
				upcoming: [],
			},
			recent: { items: [], groups: [] },
			goals: [],
			investments: null,
		});
		expect(result.incomeExpenses).toHaveLength(12);
		expect(statements).toBe(5);
	});
});

describe("income with no spending, and refunds above spending", () => {
	test("income alone gives a rate of 100.0% and no spending", async () => {
		const who = await blankUser("dash-income");
		const { result } = await asUser(who, async (tx) => {
			await addExpense(tx, who, {
				payee: "Acme",
				amountMinor: 8500000,
				occurredOn: "2026-11-01",
				type: "income",
				category: "salary",
			});
			return dashboardData(tx, goldenContext(who), "2026-11");
		});
		expect(result.savings).toMatchObject({
			incomeMinor: 8500000,
			netMinor: 8500000,
			rateTenths: 1000,
		});
		expect(result.spending.outMinor).toBe(0);
		expect(result.daily).toEqual([]);
		expect(result.categories).toEqual([]);
		expect(result.accountEmpty).toBe(false);
	});

	test("a category whose refunds exceed its spending stays negative", async () => {
		const who = await blankUser("dash-refund");
		const { result } = await asUser(who, async (tx) => {
			await addExpense(tx, who, {
				payee: "Croma",
				amountMinor: 1000,
				occurredOn: "2026-11-01",
				category: "shopping",
			});
			await addExpense(tx, who, {
				payee: "Croma",
				amountMinor: 4000,
				occurredOn: "2026-11-01",
				category: "shopping",
				type: "refund",
			});
			await addExpense(tx, who, {
				payee: "Swiggy",
				amountMinor: 500,
				occurredOn: "2026-11-01",
				category: "food",
			});
			return dashboardData(tx, goldenContext(who), "2026-11");
		});
		expect(result.categories).toEqual([
			{ category: "food", outMinor: 500 },
			{ category: "shopping", outMinor: -3000 },
		]);
		expect(result.daily).toEqual([{ date: "2026-11-01", outMinor: -2500 }]);
	});

	test("a day whose expenses and refunds cancel has no entry", async () => {
		const who = await blankUser("dash-cancel");
		const { result } = await asUser(who, async (tx) => {
			await addExpense(tx, who, {
				payee: "A",
				amountMinor: 700,
				occurredOn: "2026-11-01",
			});
			await addExpense(tx, who, {
				payee: "A",
				amountMinor: 700,
				occurredOn: "2026-11-01",
				type: "refund",
			});
			return dashboardData(tx, goldenContext(who), "2026-11");
		});
		expect(result.daily).toEqual([]);
		expect(result.categories).toEqual([]);
	});
});

// AC-F08-13
describe("accountEmpty (F15, BR-F15-01)", () => {
	const check = (
		who: string,
		change?: (tx: Parameters<typeof accountEmpty>[0]) => Promise<unknown>,
	) =>
		asUser(who, async (tx) => {
			await change?.(tx);
			return accountEmpty(tx);
		});

	test("is true with a profile and nothing else, in one statement", async () => {
		const { result, statements } = await check(empty);
		expect(result).toBe(true);
		expect(statements).toBe(1);
	});

	test("is false for the golden user", async () => {
		expect((await check(golden)).result).toBe(false);
	});

	test("is false with only a Transaction", async () => {
		const who = await blankUser("dash-only-txn");
		expect(
			(
				await check(who, (tx) =>
					addExpense(tx, who, {
						payee: "A",
						amountMinor: 100,
						occurredOn: "2026-11-01",
					}),
				)
			).result,
		).toBe(false);
	});

	test("is false with only a demo Transaction", async () => {
		const who = await blankUser("dash-only-demo");
		expect(
			(
				await check(who, (tx) =>
					addExpense(tx, who, {
						payee: "A",
						amountMinor: 100,
						occurredOn: "2026-11-01",
						demo: true,
					}),
				)
			).result,
		).toBe(false);
	});

	test("is false with only a Budget, and the dashboard shows the widgets, not the panel", async () => {
		const who = await blankUser("dash-only-budget");
		const food = GOLDEN_BUDGETS[0];
		await insertBudgets(owner, who, [
			{ ...food, id: uuidV7At("2026-11-02T06:30:00Z") } as LoadedBudget,
		]);
		const { result } = await month(who, "2026-11");
		expect(result.accountEmpty).toBe(false);
		expect(result.budgets.count).toBe(1);
		expect(result.spending.outMinor).toBe(0);
	});

	test("is false with only a Subscription", async () => {
		const who = await blankUser("dash-only-sub");
		await addSubscription(owner, who);
		expect((await check(who)).result).toBe(false);
		await ownerExec(owner, "DELETE FROM app.subscriptions WHERE user_id = $1", [
			who,
		]);
		expect((await check(who)).result).toBe(true);
	});

	test("does not see another user's rows", async () => {
		expect((await check(empty)).result).toBe(true);
	});
});

describe("the dashboard's own rows", () => {
	test("never shows another user's Transactions in Recent or the day list", async () => {
		const lonely = await blankUser("dash-lonely");
		const { result } = await month(lonely, "2026-10");
		expect(result.recent.items).toEqual([]);
		expect(result.daily).toEqual([]);
		expect(result.months).toHaveLength(1);
	});
});
