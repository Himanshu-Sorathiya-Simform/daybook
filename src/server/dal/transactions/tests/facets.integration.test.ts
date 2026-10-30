import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

import { loadGolden, type LoadedGolden } from "../../../../../seed/load-golden";
import { CATEGORY_KEYS, SOURCES, TXN_TYPES } from "@/lib/transactions/model";
import type { TransactionFilter } from "@/lib/transactions/url";
import { runtimePool } from "../../../db/pools";
import { createUser } from "../../../db/tests/private-rows";
import { parseOwnerEnv } from "../../../env";
import type { Tx } from "../../with-user";
import { facetCounts } from "../facets";
import { addExpense, asUser, goldenContext } from "./helpers";

/** `facetCounts` (BR-F03-59) on golden's 22 M1 rows, through the runtime role and RLS. */

let owner: Client;
let golden: LoadedGolden;
let other: LoadedGolden;

beforeAll(async () => {
	owner = new Client({
		connectionString: parseOwnerEnv(process.env).DATABASE_URL_OWNER,
	});
	await owner.connect();
	golden = await loadGolden(owner, await createUser(owner, "facets"));
	other = await loadGolden(owner, await createUser(owner, "facets-other"));
});

afterAll(async () => {
	await owner?.query(`DELETE FROM auth."user" WHERE id = ANY($1)`, [
		[golden?.userId, other?.userId].filter(Boolean),
	]);
	await owner?.end();
	await runtimePool().end();
});

async function facets(filter: TransactionFilter, today?: string) {
	const ctx = goldenContext(golden.userId);
	return asUser(golden.userId, (tx) =>
		facetCounts(tx, today ? { ...ctx, today } : ctx, filter),
	);
}

/** Every option at zero, then the given counts. */
const zeros = <K extends string>(
	options: readonly K[],
	counts: Partial<Record<K, number>>,
) => ({
	...Object.fromEntries(options.map((option) => [option, 0])),
	...counts,
});

const OCTOBER = { from: "2026-10-01", to: "2026-10-31" } as const;

describe("check B", () => {
	// AC-F03-40; golden: section 5's filter counts for check B, October and food. Goal rows have
	// no category, so the M1 rows give the same counts.
	test("matches section 5's table, every option present", async () => {
		const { result } = await facets({ ...OCTOBER, cat: ["food"] });
		expect(result).toEqual({
			type: zeros(TXN_TYPES, { expense: 4 }),
			category: zeros(CATEGORY_KEYS, {
				food: 4,
				entertainment: 2,
				shopping: 2,
				housing: 1,
				salary: 1,
				transportation: 1,
			}),
			date: {
				all: 7,
				this_month: 1,
				last_month: 4,
				last_3_months: 7,
				year_to_date: 7,
				last_12_months: 7,
			},
			source: { manual: 4, subscription: 0 },
		});
		expect(Object.keys(result.type)).toEqual([...TXN_TYPES]);
		expect(Object.keys(result.category)).toEqual([...CATEGORY_KEYS]);
		expect(Object.keys(result.source)).toEqual([...SOURCES]);
	});

	test("sends one statement", async () => {
		const { statements } = await facets({ ...OCTOBER, cat: ["food"] });
		expect(statements).toBe(1);
	});
});

describe("each field ignores only its own filter", () => {
	// golden #18 is the one refund: Croma, shopping, 9 October, entered by hand.
	test("a type filter narrows every other field but not the type counts", async () => {
		const { result } = await facets({ type: ["refund"] });
		expect(result.type).toEqual(
			zeros(TXN_TYPES, { income: 3, expense: 18, refund: 1 }),
		);
		expect(result.category).toEqual(zeros(CATEGORY_KEYS, { shopping: 1 }));
		expect(result.source).toEqual({ manual: 1, subscription: 0 });
		expect(result.date).toEqual({
			all: 1,
			this_month: 0,
			last_month: 1,
			last_3_months: 1,
			year_to_date: 1,
			last_12_months: 1,
		});
	});

	// golden check A at M1: 11 rows, 3 of them charges (#12, #16, #20).
	test("a date range narrows every other field but not the date counts", async () => {
		const { result } = await facets(OCTOBER);
		expect(result.source).toEqual({ manual: 8, subscription: 3 });
		expect(result.type).toEqual(
			zeros(TXN_TYPES, { income: 1, expense: 9, refund: 1 }),
		);
		// All time: September 9, October 11, November 2 (#26, #27).
		expect(result.date).toEqual({
			all: 22,
			this_month: 2,
			last_month: 11,
			last_3_months: 22,
			year_to_date: 22,
			last_12_months: 22,
		});
	});

	// golden: the charges are #1, #5, #7, #12, #16, #20 and #27.
	test("a source filter narrows every other field but not the source counts", async () => {
		const { result } = await facets({ src: "subscription" });
		expect(result.source).toEqual({ manual: 15, subscription: 7 });
		expect(result.category).toEqual(
			zeros(CATEGORY_KEYS, { housing: 3, entertainment: 3, health: 1 }),
		);
		expect(result.type).toEqual(zeros(TXN_TYPES, { expense: 7 }));
	});

	test("fields outside the four, such as q, apply to every count", async () => {
		// golden check D: #4 (September), #24 and #25 (October), #26 (November).
		const { result } = await facets({ q: "swiggy" });
		expect(result.type).toEqual(zeros(TXN_TYPES, { expense: 4 }));
		expect(result.category).toEqual(zeros(CATEGORY_KEYS, { food: 4 }));
		expect(result.source).toEqual({ manual: 4, subscription: 0 });
		expect(result.date).toEqual({
			all: 4,
			this_month: 1,
			last_month: 2,
			last_3_months: 4,
			year_to_date: 4,
			last_12_months: 4,
		});
	});
});

describe("dates", () => {
	test("count each preset from today in the profile's zone (TIME-5)", async () => {
		// On 15 October, this month is October (11 rows) and last month September (9). Year to
		// date ends on the 15th, before #24 (19 October) and #25 (31 October).
		const { result } = await facets({}, "2026-10-15");
		expect(result.date).toEqual({
			all: 22,
			this_month: 11,
			last_month: 9,
			last_3_months: 20,
			year_to_date: 18,
			last_12_months: 20,
		});
	});

	// golden #1, #12, #26 and #27 fall in another month in UTC; the local date decides.
	test("count by occurredOn, never the UTC date", async () => {
		const { result } = await facets({ src: "subscription", cat: ["housing"] });
		// #27 is on 1 November locally, so this month counts it; by UTC it would be October.
		expect(result.date).toMatchObject({ this_month: 1, last_month: 1, all: 3 });
	});
});

test("an empty filter counts every row once per field", async () => {
	const { result } = await facets({});
	const sum = (counts: Record<string, number>) =>
		Object.values(counts).reduce((total, count) => total + count, 0);
	expect(sum(result.type)).toBe(22);
	expect(sum(result.category)).toBe(22);
	expect(sum(result.source)).toBe(22);
	expect(result.date.all).toBe(22);
});

test("a filter that selects nothing gives every option at zero", async () => {
	const { result } = await facets({ q: "zzz" });
	expect(result.type).toEqual(zeros(TXN_TYPES, {}));
	expect(result.category).toEqual(zeros(CATEGORY_KEYS, {}));
	expect(result.source).toEqual({ manual: 0, subscription: 0 });
	expect(Object.values(result.date).every((count) => count === 0)).toBe(true);
});

// T2: what each count honors (BR-F03-59). Expected counts are tallied from the golden rows in
// code, so they share nothing with the SQL.
describe("counts tallied from the golden rows", () => {
	type Row = (typeof golden.rows)[number];
	const tally = <K extends string>(
		options: readonly K[],
		rows: readonly Row[],
		pick: (row: Row) => string | null,
	) => {
		const counts: Partial<Record<K, number>> = {};
		for (const row of rows) {
			const key = pick(row) as K | null;
			if (key !== null) counts[key] = (counts[key] ?? 0) + 1;
		}
		return zeros(options, counts);
	};

	test("amount bounds apply to every count, inclusive at both ends", async () => {
		// 1,000.00 to 10,000.00: golden's amounts that fall between, edges included.
		const filter: TransactionFilter = { minMinor: 100000, maxMinor: 1000000 };
		const inside = golden.rows.filter(
			(row) => row.amountMinor >= 100000 && row.amountMinor <= 1000000,
		);
		expect(inside.length).toBeGreaterThan(0);
		expect(inside.length).toBeLessThan(golden.rows.length);
		const { result } = await facets(filter);
		expect(result.type).toEqual(tally(TXN_TYPES, inside, (row) => row.type));
		expect(result.category).toEqual(
			tally(CATEGORY_KEYS, inside, (row) => row.category),
		);
		expect(result.source).toEqual(tally(SOURCES, inside, (row) => row.source));
		expect(result.date["all"]).toBe(inside.length);
	});

	test("a bound exactly on an amount keeps that row, one minor unit past it drops it", async () => {
		const amounts = [...new Set(golden.rows.map((row) => row.amountMinor))].sort(
			(a, b) => a - b,
		);
		const middle = amounts[Math.floor(amounts.length / 2)]!;
		const equal = golden.rows.filter((row) => row.amountMinor === middle).length;
		expect(
			(await facets({ minMinor: middle, maxMinor: middle })).result.date[
				"all"
			],
		).toBe(equal);
		expect(
			(await facets({ minMinor: middle + 1, maxMinor: middle })).result.date[
				"all"
			],
		).toBe(0);
		const atLeast = golden.rows.filter(
			(row) => row.amountMinor >= middle,
		).length;
		expect((await facets({ minMinor: middle })).result.date["all"]).toBe(
			atLeast,
		);
		expect((await facets({ minMinor: middle + 1 })).result.date["all"]).toBe(
			atLeast - equal,
		);
	});

	test("a type and a category together: each count honors the other and ignores its own", async () => {
		const { result } = await facets({ type: ["expense"], cat: ["food"] });
		const food = golden.rows.filter((row) => row.category === "food");
		const expenses = golden.rows.filter((row) => row.type === "expense");
		const both = food.filter((row) => row.type === "expense");
		expect(result.type).toEqual(tally(TXN_TYPES, food, (row) => row.type));
		expect(result.category).toEqual(
			tally(CATEGORY_KEYS, expenses, (row) => row.category),
		);
		expect(result.source).toEqual(tally(SOURCES, both, (row) => row.source));
		expect(result.date["all"]).toBe(both.length);
		// Food holds more than expenses, or the type count would show nothing.
		expect(food.length).toBeGreaterThanOrEqual(both.length);
	});

	test("two types and two categories give each count the other pair's rows", async () => {
		const { result } = await facets({
			type: ["expense", "refund"],
			cat: ["food", "shopping"],
		});
		const cats = golden.rows.filter(
			(row) => row.category === "food" || row.category === "shopping",
		);
		const types = golden.rows.filter(
			(row) => row.type === "expense" || row.type === "refund",
		);
		expect(result.type).toEqual(tally(TXN_TYPES, cats, (row) => row.type));
		expect(result.category).toEqual(
			tally(CATEGORY_KEYS, types, (row) => row.category),
		);
	});
});

describe("Kuwaiti dinars, three decimals (BR-F03-04, BR-F03-35)", () => {
	const MAX = 999_999_999_999;
	const kuwaitFacets = (
		tx: Tx,
		filter: TransactionFilter,
		currency: "KWD" | "INR" = "KWD",
	) => {
		const ctx = goldenContext(golden.userId, { currency });
		return facetCounts(tx, ctx, filter);
	};
	async function seed(tx: Tx) {
		for (const [payee, amountMinor] of [
			["Kuwait Low", 1],
			["Kuwait Mid", 1250],
			["Kuwait High", MAX],
		] as const) {
			await addExpense(tx, golden.userId, {
				payee,
				amountMinor,
				occurredOn: "2026-11-02",
			});
		}
	}

	test("the smallest and the largest amount are both inside the bounds that name them", async () => {
		const { result } = await asUser(golden.userId, async (tx) => {
			await seed(tx);
			return {
				all: await kuwaitFacets(tx, {
					q: "kuwait",
					minMinor: 1,
					maxMinor: MAX,
				}),
				low: await kuwaitFacets(tx, { q: "kuwait", maxMinor: 1 }),
				high: await kuwaitFacets(tx, { q: "kuwait", minMinor: MAX }),
				none: await kuwaitFacets(tx, {
					q: "kuwait",
					minMinor: 2,
					maxMinor: 1249,
				}),
				middle: await kuwaitFacets(tx, {
					q: "kuwait",
					minMinor: 2,
					maxMinor: MAX - 1,
				}),
			};
		});
		expect(result.all.date["all"]).toBe(3);
		expect(result.low.date["all"]).toBe(1);
		expect(result.high.date["all"]).toBe(1);
		expect(result.none.date["all"]).toBe(0);
		expect(result.middle.date["all"]).toBe(1);
	});

	test("a search for 1.250 is the amount 1,250 fils in a Kuwaiti profile, and text in an Indian one", async () => {
		const { result } = await asUser(golden.userId, async (tx) => {
			await seed(tx);
			return {
				kwd: await kuwaitFacets(tx, { q: "1.250" }),
				inr: await kuwaitFacets(tx, { q: "1.250" }, "INR"),
			};
		});
		expect(result.kwd.date["all"]).toBe(1);
		expect(result.kwd.category["food"]).toBe(1);
		// Rupees have two decimals, so "1.250" is not an amount there and matches no text.
		expect(result.inr.date["all"]).toBe(0);
	});

	test("the largest amount is counted under every field that holds it", async () => {
		const { result } = await asUser(
			golden.userId,
			async (tx) => (await seed(tx), kuwaitFacets(tx, { q: "kuwait high" })),
		);
		expect(result.type["expense"]).toBe(1);
		expect(result.category["food"]).toBe(1);
		expect(result.source["manual"]).toBe(1);
		expect(result.date["all"]).toBe(1);
	});
});

describe("another user's rows add nothing", () => {
	test("rows of another user change no count of this one, and add to their own", async () => {
		const before = (await facets({})).result;
		const ids: string[] = [];
		try {
			for (const [payee, amountMinor] of [
				["Other A", 100],
				["Other B", 99_999_999_999],
			] as const) {
				const { rows } = await owner.query<{ id: string }>(
					`INSERT INTO app.transactions (id, user_id, created_at, updated_at, type, amount_minor,
					   occurred_at, occurred_on, category, payee, source, version)
					 VALUES (gen_random_uuid(), $1, $2, $2, 'income', $3, $2, '2026-11-02', 'salary', $4,
					   'subscription', 1)
					 RETURNING id`,
					[other.userId, "2026-11-02T06:30:00Z", amountMinor, payee],
				);
				ids.push(rows[0]!.id);
			}
			expect((await facets({})).result).toEqual(before);
			expect((await facets({ q: "other" })).result.date["all"]).toBe(0);
			const mine = await asUser(other.userId, (tx) =>
				facetCounts(tx, goldenContext(other.userId), {}),
			);
			expect(mine.result.date["all"]).toBe(before.date["all"] + 2);
			expect(mine.result.type["income"]).toBe(before.type["income"] + 2);
		} finally {
			await owner.query(
				"DELETE FROM app.transactions WHERE id = ANY($1::uuid[])",
				[ids],
			);
		}
	});
});
