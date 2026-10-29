import { sql } from "drizzle-orm";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

import { loadGolden, type LoadedGolden } from "../../../../../seed/load-golden";
import { readFilterParams, type TransactionFilter } from "@/lib/transactions/url";
import { runtimePool } from "../../../db/pools";
import { createUser } from "../../../db/tests/private-rows";
import { parseOwnerEnv } from "../../../env";
import { rollup, type RollupGroup } from "../rollup";
import { addExpense, asUser, goldenContext } from "./helpers";

/** `rollup` (F03 section 11, D-293) on golden's M1 rows, through the runtime role and RLS.
 * Tests that add rows do it inside `asUser`, which rolls back. */

let owner: Client;
let golden: LoadedGolden;

beforeAll(async () => {
	owner = new Client({
		connectionString: parseOwnerEnv(process.env).DATABASE_URL_OWNER,
	});
	await owner.connect();
	golden = await loadGolden(owner, await createUser(owner, "rollup"));
});

afterAll(async () => {
	await owner?.query(`DELETE FROM auth."user" WHERE id = $1`, [golden?.userId]);
	await owner?.end();
	await runtimePool().end();
});

const ctx = () => goldenContext(golden.userId);

function filterOf(query: string): TransactionFilter {
	const { filter, invalid } = readFilterParams(new URLSearchParams(query), {
		currency: "INR",
	});
	expect(invalid).toEqual([]);
	return filter;
}

const OCTOBER = { from: "2026-10-01", to: "2026-10-31" } as const;

/** A group with zero figures, to spell out only the figures that matter. */
const group = (fields: Partial<RollupGroup> & { key: string }): RollupGroup => ({
	label: null,
	count: 0,
	incomeMinor: 0,
	spendingMinor: 0,
	toGoalsMinor: 0,
	netMinor: 0,
	...fields,
});

describe("total", () => {
	// golden: Transactions list checks, the header totals. At M1 the Goal rows are not loaded
	// (D-465): check A loses #14, #22 and #23 and its To Goals, and check F selects nothing.
	// AC-F03-27
	test.each([
		["A", "from=2026-10-01&to=2026-10-31", 11, 8500000, 3116800],
		["B", "from=2026-10-01&to=2026-10-31&cat=food", 4, 0, 622000],
		["C", "from=2026-09-01&to=2026-10-31&cat=shopping", 3, 0, 540000],
		["D", "q=swiggy", 4, 0, 329000],
		["E", "from=2026-10-01&to=2026-10-31&src=subscription", 3, 0, 2014800],
		["F", "type=goal_contribution,goal_withdrawal", 0, 0, 0],
		["G", "q=groceries", 2, 0, 610000],
		["H", "q=649", 2, 0, 129800],
		["I", "from=2026-11-01&to=2026-11-02", 2, 0, 1842000],
	])(
		"check %s (%s): count %i, In %i, Out %i",
		async (_check, query, count, incomeMinor, spendingMinor) => {
			const { result } = await asUser(golden.userId, (tx) =>
				rollup(tx, ctx(), [{ filter: filterOf(query), by: "total" }]),
			);
			expect(result).toEqual([
				{
					count,
					incomeMinor,
					spendingMinor,
					toGoalsMinor: 0,
					netMinor: incomeMinor - spendingMinor,
				},
			]);
		},
	);

	// golden: Monthly totals, all time to 2 November.
	test("all time: income 182,000.00, spending 77,637.00, net 104,363.00", async () => {
		const { result } = await asUser(golden.userId, (tx) =>
			rollup(tx, ctx(), [{ filter: {}, by: "total" }]),
		);
		expect(result).toEqual([
			{
				count: 22,
				incomeMinor: 18200000,
				spendingMinor: 7763700,
				toGoalsMinor: 0,
				netMinor: 10436300,
			},
		]);
	});

	test("is all zeros when the filter selects nothing", async () => {
		const { result } = await asUser(golden.userId, (tx) =>
			rollup(tx, ctx(), [{ filter: { from: "2030-01-01" }, by: "total" }]),
		);
		expect(result).toEqual([
			{
				count: 0,
				incomeMinor: 0,
				spendingMinor: 0,
				toGoalsMinor: 0,
				netMinor: 0,
			},
		]);
	});

	// golden #18: a refund lowers Out; with no expense beside it, Out goes below zero (TXN-7).
	test("lets refunds take Out below zero", async () => {
		const { result } = await asUser(golden.userId, (tx) =>
			rollup(tx, ctx(), [{ filter: { type: ["refund"] }, by: "total" }]),
		);
		expect(result[0]).toMatchObject({
			count: 1,
			spendingMinor: -150000,
			netMinor: 150000,
		});
	});

	test("reads the amount of a numeric search in the profile's currency", async () => {
		const run = (currency: "INR" | "JPY") =>
			asUser(golden.userId, (tx) =>
				rollup(tx, goldenContext(golden.userId, { currency }), [
					{ filter: { q: "649" }, by: "total" },
				]),
			);
		// golden check H: 649.00 is 64900 paise. In yen, 649 is 649 minor units, which no row has.
		expect((await run("INR")).result[0].count).toBe(2);
		expect((await run("JPY")).result[0].count).toBe(0);
	});
});

describe("bounds (BR-F03-58)", () => {
	// golden: section 5's summary span for check A.
	test("are the first and last occurredOn of the filter's rows", async () => {
		const { result } = await asUser(golden.userId, (tx) =>
			rollup(tx, ctx(), [{ filter: OCTOBER, by: "bounds" }]),
		);
		expect(result).toEqual([{ firstOn: "2026-10-01", lastOn: "2026-10-31" }]);
	});

	// golden #1 is on 31 August in UTC, and #26 and #27 on 31 October.
	test("use the local date, never the UTC one", async () => {
		const { result } = await asUser(golden.userId, (tx) =>
			rollup(tx, ctx(), [{ filter: {}, by: "bounds" }]),
		);
		expect(result).toEqual([{ firstOn: "2026-09-01", lastOn: "2026-11-01" }]);
	});

	test("are null when the filter selects nothing", async () => {
		const { result } = await asUser(golden.userId, (tx) =>
			rollup(tx, ctx(), [{ filter: { q: "zzz" }, by: "bounds" }]),
		);
		expect(result).toEqual([null]);
	});
});

describe("category", () => {
	// golden: section 5's group order for check A, without the two Goal groups at M1, and
	// Spending by category for October.
	test("runs by weight for check A, with October's spending per category", async () => {
		const { result } = await asUser(golden.userId, (tx) =>
			rollup(tx, ctx(), [{ filter: OCTOBER, by: "category" }]),
		);
		expect(result).toEqual([
			[
				group({
					key: "salary",
					count: 1,
					incomeMinor: 8500000,
					netMinor: 8500000,
				}),
				group({
					key: "housing",
					count: 1,
					spendingMinor: 1800000,
					netMinor: -1800000,
				}),
				group({
					key: "food",
					count: 4,
					spendingMinor: 622000,
					netMinor: -622000,
				}),
				group({
					key: "shopping",
					count: 2,
					spendingMinor: 300000,
					netMinor: -300000,
				}),
				group({
					key: "entertainment",
					count: 2,
					spendingMinor: 214800,
					netMinor: -214800,
				}),
				group({
					key: "transportation",
					count: 1,
					spendingMinor: 180000,
					netMinor: -180000,
				}),
			],
		]);
	});

	// golden: Spending by category, September; invariant 1, category spending sums to the
	// month's spending (28,049.00).
	test("September's categories sum to September's spending", async () => {
		const { result } = await asUser(golden.userId, (tx) =>
			rollup(tx, ctx(), [
				{ filter: { from: "2026-09-01", to: "2026-09-30" }, by: "category" },
				{ filter: { from: "2026-09-01", to: "2026-09-30" }, by: "total" },
			]),
		);
		const [categories, total] = result;
		expect(
			categories.map(({ key, spendingMinor }) => [key, spendingMinor]),
		).toEqual([
			["salary", 0],
			["housing", 1800000],
			["freelance", 0],
			["food", 505000],
			["shopping", 240000],
			["health", 150000],
			["entertainment", 64900],
			["transportation", 45000],
		]);
		const sum = categories.reduce(
			(all, { spendingMinor }) => all + spendingMinor,
			0,
		);
		expect(sum).toBe(2804900);
		expect(total.spendingMinor).toBe(2804900);
	});

	// AC-F03-04: October food is 6,220.00 by occurredOn; by the UTC date it would be 6,640.00.
	test("buckets by occurredOn", async () => {
		const { result } = await asUser(golden.userId, (tx) =>
			rollup(tx, ctx(), [
				{ filter: { ...OCTOBER, cat: ["food"] }, by: "category" },
			]),
		);
		expect(result[0]).toEqual([
			group({
				key: "food",
				count: 4,
				spendingMinor: 622000,
				netMinor: -622000,
			}),
		]);
	});
});

describe("payee", () => {
	// golden: section 5's summary breakdown by payee for check A; Acme Corp's income leads.
	test("groups by the lowercased payee, labeled, by weight", async () => {
		const { result } = await asUser(golden.userId, (tx) =>
			rollup(tx, ctx(), [{ filter: OCTOBER, by: "payee" }]),
		);
		expect(
			result[0].map(({ key, label, count, incomeMinor, spendingMinor }) => [
				key,
				label,
				count,
				incomeMinor + spendingMinor,
			]),
		).toEqual([
			["acme corp", "Acme Corp", 1, 8500000],
			["sunrise apartments", "Sunrise Apartments", 1, 1800000],
			["croma", "Croma", 2, 300000],
			["bigbasket", "BigBasket", 1, 290000],
			["zomato", "Zomato", 1, 230000],
			["indian oil", "Indian Oil", 1, 180000],
			["amazon prime", "Amazon Prime", 1, 149900],
			["swiggy", "Swiggy", 2, 102000],
			["netflix", "Netflix", 1, 64900],
		]);
	});

	// AC-F03-36, the rollup half: the label follows the newest row.
	test("takes its label from the newest row, whatever its case", async () => {
		const { result } = await asUser(golden.userId, async (tx) => {
			await addExpense(tx, golden.userId, {
				payee: "SWIGGY",
				amountMinor: 10000,
				occurredOn: "2026-11-02",
			});
			// An older row in another case changes nothing.
			await addExpense(tx, golden.userId, {
				payee: "swiggy",
				amountMinor: 10000,
				occurredOn: "2026-08-01",
			});
			return rollup(tx, ctx(), [{ filter: { q: "swiggy" }, by: "payee" }]);
		});
		expect(result[0]).toEqual([
			group({
				key: "swiggy",
				label: "SWIGGY",
				count: 6,
				spendingMinor: 349000,
				netMinor: -349000,
			}),
		]);
	});

	test("breaks a same-day tie by time, then by id", async () => {
		const { result } = await asUser(golden.userId, async (tx) => {
			// golden #26 is Swiggy at 00:30 on 1 November; these come later the same day.
			await addExpense(tx, golden.userId, {
				payee: "SwIgGy",
				amountMinor: 100,
				occurredOn: "2026-11-01",
				occurredAt: "2026-11-01T10:00:00Z",
			});
			await addExpense(tx, golden.userId, {
				payee: "SWIGgy",
				amountMinor: 100,
				occurredOn: "2026-11-01",
				occurredAt: "2026-11-01T09:00:00Z",
			});
			return rollup(tx, ctx(), [{ filter: { q: "swiggy" }, by: "payee" }]);
		});
		expect(result[0][0]?.label).toBe("SwIgGy");
	});

	test("breaks a same-minute tie by id: the larger id is the newer row", async () => {
		const { result } = await asUser(golden.userId, async (tx) => {
			for (const [id, payee] of [
				["0199a000-0000-7000-8000-00000000f002", "TIE"],
				["0199a000-0000-7000-8000-00000000f001", "Tie"],
			] as const) {
				await addExpense(tx, golden.userId, {
					id,
					payee,
					amountMinor: 100,
					occurredOn: "2030-01-01",
					occurredAt: "2030-01-01T06:30:00Z",
				});
			}
			return rollup(tx, ctx(), [
				{ filter: { from: "2030-01-01" }, by: "payee" },
			]);
		});
		expect(result[0]).toEqual([
			group({
				key: "tie",
				label: "TIE",
				count: 2,
				spendingMinor: 200,
				netMinor: -200,
			}),
		]);
	});

	test("weighs Out by its size, so a payee whose refunds exceed its spending still ranks high", async () => {
		const { result } = await asUser(golden.userId, async (tx) => {
			await addExpense(tx, golden.userId, {
				payee: "Refunder",
				type: "refund",
				amountMinor: 50000,
				occurredOn: "2030-01-01",
			});
			await addExpense(tx, golden.userId, {
				payee: "Spender",
				amountMinor: 10000,
				occurredOn: "2030-01-01",
			});
			return rollup(tx, ctx(), [
				{ filter: { from: "2030-01-01" }, by: "payee" },
			]);
		});
		// Weight is In + |Out| + |To Goals| (BR-F03-55): 500.00 for Refunder, 100.00 for Spender.
		expect(
			result[0].map(({ key, spendingMinor }) => [key, spendingMinor]),
		).toEqual([
			["refunder", -50000],
			["spender", 10000],
		]);
	});

	// D-472: code point order puts "zeta" (z, U+007A) before "ümit" (ü, U+00FC); a linguistic
	// collation would put ü first.
	test("orders equal weights by key in code point order", async () => {
		const { result } = await asUser(golden.userId, async (tx) => {
			for (const payee of ["Ümit", "zeta", "Beta"]) {
				await addExpense(tx, golden.userId, {
					payee,
					amountMinor: 77700,
					occurredOn: "2030-01-01",
					occurredAt: "2030-01-01T06:30:00Z",
				});
			}
			return rollup(tx, ctx(), [
				{ filter: { from: "2030-01-01" }, by: "payee" },
			]);
		});
		expect(result[0].map(({ key }) => key)).toEqual(["beta", "zeta", "ümit"]);
	});
});

describe("day", () => {
	// golden: Calendar heat map, October: daily spending, unclamped. 1 October also has
	// Acme Corp's 85,000.00 salary.
	test("gives October's daily spending, oldest first", async () => {
		const { result } = await asUser(golden.userId, (tx) =>
			rollup(tx, ctx(), [{ filter: OCTOBER, by: "day" }]),
		);
		expect(
			result[0].map(({ key, spendingMinor }) => [key, spendingMinor]),
		).toEqual([
			["2026-10-01", 1800000],
			["2026-10-04", 230000],
			["2026-10-05", 64900],
			["2026-10-07", 450000],
			["2026-10-09", -150000],
			["2026-10-11", 180000],
			["2026-10-12", 149900],
			["2026-10-14", 290000],
			["2026-10-19", 64000],
			["2026-10-31", 38000],
		]);
		expect(result[0][0]).toMatchObject({ count: 2, incomeMinor: 8500000 });
		const sum = result[0].reduce(
			(all, { spendingMinor }) => all + spendingMinor,
			0,
		);
		expect(sum).toBe(3116800);
	});
});

describe("month", () => {
	// golden: Monthly totals; at M1 September has 9 rows, without #3 and #9.
	// AC-F03-04: #1 counts in September, #12 in October, #26 and #27 in November.
	test("gives each month's totals by occurredOn", async () => {
		const { result } = await asUser(golden.userId, (tx) =>
			rollup(tx, ctx(), [{ filter: {}, by: "month" }]),
		);
		expect(result[0]).toEqual([
			group({
				key: "2026-09",
				count: 9,
				incomeMinor: 9700000,
				spendingMinor: 2804900,
				netMinor: 6895100,
			}),
			group({
				key: "2026-10",
				count: 11,
				incomeMinor: 8500000,
				spendingMinor: 3116800,
				netMinor: 5383200,
			}),
			group({
				key: "2026-11",
				count: 2,
				spendingMinor: 1842000,
				netMinor: -1842000,
			}),
		]);
	});
});

describe("week", () => {
	// Saturday 31 October (#25, 380.00), Sunday 1 November (#26 and #27, 18,420.00) and, added
	// here, Monday 2 November (300.00).
	const weeks = (weekStart: "monday" | "sunday" | "saturday") =>
		asUser(golden.userId, async (tx) => {
			await addExpense(tx, golden.userId, {
				payee: "Chai Point",
				amountMinor: 30000,
				occurredOn: "2026-11-02",
			});
			return rollup(tx, goldenContext(golden.userId, { weekStart }), [
				{ filter: { from: "2026-10-31", to: "2026-11-02" }, by: "week" },
			]);
		});
	const pairs = (groups: RollupGroup[]) =>
		groups.map(({ key, count, spendingMinor }) => [key, count, spendingMinor]);

	test("starting Monday: 26 October holds Saturday and Sunday; Monday starts a week", async () => {
		const { result } = await weeks("monday");
		expect(pairs(result[0])).toEqual([
			["2026-10-26", 3, 1880000],
			["2026-11-02", 1, 30000],
		]);
	});

	test("starting Sunday: Saturday ends the week of 25 October; Sunday starts one", async () => {
		const { result } = await weeks("sunday");
		expect(pairs(result[0])).toEqual([
			["2026-10-25", 1, 38000],
			["2026-11-01", 3, 1872000],
		]);
	});

	test("starting Saturday: all three days are the week of 31 October", async () => {
		const { result } = await weeks("saturday");
		expect(pairs(result[0])).toEqual([["2026-10-31", 4, 1910000]]);
	});
});

describe("many requests (D-293)", () => {
	test("answer in order, in one statement", async () => {
		const { result, statements } = await asUser(golden.userId, (tx) =>
			rollup(tx, ctx(), [
				{ filter: OCTOBER, by: "total" },
				{ filter: OCTOBER, by: "bounds" },
				{ filter: OCTOBER, by: "category" },
				{ filter: OCTOBER, by: "payee" },
				{ filter: OCTOBER, by: "day" },
				{ filter: {}, by: "week" },
				{ filter: {}, by: "month" },
				{ filter: { q: "zzz" }, by: "total" },
			]),
		);
		expect(statements).toBe(1);
		const [total, bounds, category, payee, day, week, month, none] = result;
		expect(total.spendingMinor).toBe(3116800);
		expect(bounds).toEqual({ firstOn: "2026-10-01", lastOn: "2026-10-31" });
		expect(category).toHaveLength(6);
		expect(payee).toHaveLength(9);
		expect(day).toHaveLength(10);
		expect(week.length).toBeGreaterThan(0);
		expect(month).toHaveLength(3);
		expect(none.count).toBe(0);
	});

	test("an empty list sends no statement", async () => {
		const { result, statements } = await asUser(golden.userId, (tx) =>
			rollup(tx, ctx(), []),
		);
		expect(result).toEqual([]);
		expect(statements).toBe(0);
	});
});

describe("money (MON-6)", () => {
	test("a sum past Number.MAX_SAFE_INTEGER throws instead of rounding", async () => {
		const run = asUser(golden.userId, async (tx) => {
			// 9,100 rows of the largest amount: 9.1 × 10^15, above 2^53 − 1.
			const at = "2026-11-02T06:30:00Z";
			await tx.execute(
				sql`INSERT INTO app.transactions (id, user_id, created_at, updated_at, type, amount_minor,
				   occurred_at, occurred_on, category, payee, source, version)
				 SELECT gen_random_uuid(), ${golden.userId}, ${at}, ${at}, 'expense', 999999999999,
				        ${at}, '2026-11-02', 'food', 'Big', 'manual', 1
				 FROM generate_series(1, 9100)`,
			);
			return rollup(tx, ctx(), [{ filter: { q: "big" }, by: "total" }]);
		});
		await expect(run).rejects.toThrow(RangeError);
	});
});

describe("isolation (SEC-2)", () => {
	test("another user's rows never count", async () => {
		const other = await loadGolden(
			owner,
			await createUser(owner, "rollup-other"),
		);
		try {
			const { result } = await asUser(golden.userId, (tx) =>
				rollup(tx, ctx(), [{ filter: {}, by: "total" }]),
			);
			expect(result[0].count).toBe(22);
		} finally {
			await owner.query(`DELETE FROM auth."user" WHERE id = $1`, [
				other.userId,
			]);
		}
	});
});
