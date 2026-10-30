import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

import { loadGolden, type LoadedGolden } from "../../../../../seed/load-golden";
import type { TransactionFilter } from "@/lib/transactions/url";
import { runtimePool } from "../../../db/pools";
import { createUser } from "../../../db/tests/private-rows";
import { parseOwnerEnv } from "../../../env";
import type { Tx } from "../../with-user";
import { amountHistogram } from "../histogram";
import { addExpense, asUser, goldenContext } from "./helpers";

/** `amountHistogram` (BR-F03-60, D-476) on golden's 22 M1 rows, through the runtime role and
 * RLS. The edge rules themselves are unit-tested in histogram.test.ts. */

let owner: Client;
let golden: LoadedGolden;
let other: LoadedGolden;

beforeAll(async () => {
	owner = new Client({
		connectionString: parseOwnerEnv(process.env).DATABASE_URL_OWNER,
	});
	await owner.connect();
	golden = await loadGolden(owner, await createUser(owner, "histogram"));
	other = await loadGolden(owner, await createUser(owner, "histogram-other"));
});

afterAll(async () => {
	await owner?.query(`DELETE FROM auth."user" WHERE id = ANY($1)`, [
		[golden?.userId, other?.userId].filter(Boolean),
	]);
	await owner?.end();
	await runtimePool().end();
});

const histogram = (filter: TransactionFilter) =>
	asUser(golden.userId, (tx) =>
		amountHistogram(tx, goldenContext(golden.userId), filter),
	);

const CHECK_B: TransactionFilter = {
	from: "2026-10-01",
	to: "2026-10-31",
	cat: ["food"],
};

// AC-F03-41; golden: section 5, the histogram for check B.
const CHECK_B_HISTOGRAM = {
	edges: [
		31500, 40000, 50000, 63000, 80000, 100000, 125000, 160000, 200000, 250000,
		315000,
	],
	counts: [1, 0, 0, 1, 0, 0, 0, 0, 1, 1],
};

// AC-F03-41
test("check B matches section 5, in one statement", async () => {
	const { result, statements } = await histogram(CHECK_B);
	expect(result).toEqual(CHECK_B_HISTOGRAM);
	expect(statements).toBe(1);
});

// AC-F03-41
test.each([
	["min=1000.00", { minMinor: 100000 }],
	["max=500.00", { maxMinor: 50000 }],
	["both", { minMinor: 100000, maxMinor: 200000 }],
])("adding %s to check B changes nothing", async (_label, bounds) => {
	const { result } = await histogram({ ...CHECK_B, ...bounds });
	expect(result).toEqual(CHECK_B_HISTOGRAM);
});

// AC-F03-41
test("a filter with no rows gives two empty arrays", async () => {
	const { result } = await histogram({ q: "zzz" });
	expect(result).toEqual({ edges: [], counts: [] });
});

// AC-F03-41: golden #24 is Swiggy's 640.00, the only row a search for 640 finds.
test("a filter selecting only #24 gives edges 630.00 and 800.00 with counts 1", async () => {
	const { result } = await histogram({ q: "640" });
	expect(result).toEqual({ edges: [63000, 80000], counts: [1] });
});

// golden: the amounts run from 380.00 (#25) to 85,000.00 (#2 and #13).
test("all 22 rows fit the full series: 315.00 to 1,00,000.00, every row counted", async () => {
	const { result } = await histogram({});
	expect(result.edges[0]).toBe(31500);
	expect(result.edges.at(-1)).toBe(10000000);
	expect(result.counts).toHaveLength(25);
	expect(result.counts.reduce((sum, count) => sum + count, 0)).toBe(22);
	// The last bucket, 80,000.00 to 1,00,000.00, holds the two salaries.
	expect(result.counts.at(-1)).toBe(2);
});

// AC-F03-42, through the database: the smallest and largest amounts thin the series twice.
test("amounts of 1 and 99,999,999,999 give 34 edges in steps 1, 2, 5", async () => {
	const { result } = await asUser(golden.userId, async (tx) => {
		for (const amountMinor of [1, 99999999999]) {
			await addExpense(tx, golden.userId, {
				payee: "Extreme",
				amountMinor,
				occurredOn: "2026-11-02",
			});
		}
		return amountHistogram(tx, goldenContext(golden.userId), { q: "extreme" });
	});
	expect(result.edges).toHaveLength(34);
	expect(result.edges.slice(0, 3)).toEqual([1, 2, 5]);
	expect(result.edges.at(-1)).toBe(100000000000);
	expect(result.counts[0]).toBe(1);
	expect(result.counts.at(-1)).toBe(1);
	expect(result.counts.reduce((sum, count) => sum + count, 0)).toBe(2);
});

test("an amount equal to an edge counts in the bucket it starts", async () => {
	const { result } = await asUser(golden.userId, async (tx) => {
		await addExpense(tx, golden.userId, {
			payee: "Edge",
			amountMinor: 80000,
			occurredOn: "2026-11-02",
		});
		return amountHistogram(tx, goldenContext(golden.userId), { q: "edge" });
	});
	expect(result).toEqual({ edges: [80000, 100000], counts: [1] });
});

test("the largest amount any currency allows still has a bucket", async () => {
	const { result } = await asUser(golden.userId, async (tx) => {
		await addExpense(tx, golden.userId, {
			payee: "Dinar",
			amountMinor: 999999999999,
			occurredOn: "2026-11-02",
		});
		return amountHistogram(tx, goldenContext(golden.userId), { q: "dinar" });
	});
	expect(result).toEqual({ edges: [800000000000, 1000000000000], counts: [1] });
});

// T2: the filters the histogram honors, in other currencies, and under other users.
describe("a type and a category together (BR-F03-60)", () => {
	const total = (counts: number[]) =>
		counts.reduce((sum, count) => sum + count, 0);

	test("count exactly the rows that are both, with edges around their amounts", async () => {
		const both = golden.rows.filter(
			(row) => row.type === "expense" && row.category === "food",
		);
		expect(both.length).toBeGreaterThan(0);
		const { result } = await histogram({ type: ["expense"], cat: ["food"] });
		expect(total(result.counts)).toBe(both.length);
		const amounts = both.map((row) => row.amountMinor);
		expect(result.edges[0]!).toBeLessThanOrEqual(Math.min(...amounts));
		expect(result.edges.at(-1)!).toBeGreaterThan(Math.max(...amounts));
	});

	test("differ from the category alone when another type holds rows in it", async () => {
		const { result } = await asUser(golden.userId, async (tx) => {
			await addExpense(tx, golden.userId, {
				payee: "Food refund",
				type: "refund",
				amountMinor: 250000,
				occurredOn: "2026-11-02",
			});
			const ctx = goldenContext(golden.userId);
			return {
				food: await amountHistogram(tx, ctx, { cat: ["food"] }),
				expenses: await amountHistogram(tx, ctx, {
					type: ["expense"],
					cat: ["food"],
				}),
				refunds: await amountHistogram(tx, ctx, {
					type: ["refund"],
					cat: ["food"],
				}),
			};
		});
		expect(total(result.food.counts)).toBe(
			total(result.expenses.counts) + total(result.refunds.counts),
		);
		expect(total(result.refunds.counts)).toBe(1);
		expect(result.refunds.edges).toEqual([250000, 315000]);
	});

	test("an empty type list or category list selects no row, so no bucket", async () => {
		expect((await histogram({ type: [] })).result).toEqual({
			edges: [],
			counts: [],
		});
		expect((await histogram({ cat: [] })).result).toEqual({
			edges: [],
			counts: [],
		});
	});
});

describe("Kuwaiti dinars, three decimals", () => {
	// The edges are in minor units of any currency, so 1.250 dinars is 1,250 fils, which is on
	// the series; 0.001 is 1.
	const kuwait = (
		tx: Tx,
		filter: TransactionFilter,
		currency: "KWD" | "INR" = "KWD",
	) => amountHistogram(tx, goldenContext(golden.userId, { currency }), filter);

	test("a search for 1.250 finds the 1,250 fils row, and none in an Indian profile", async () => {
		const { result } = await asUser(golden.userId, async (tx) => {
			await addExpense(tx, golden.userId, {
				payee: "Kuwait Mid",
				amountMinor: 1250,
				occurredOn: "2026-11-02",
			});
			return {
				kwd: await kuwait(tx, { q: "1.250" }),
				inr: await kuwait(tx, { q: "1.250" }, "INR"),
			};
		});
		expect(result.kwd).toEqual({ edges: [1250, 1600], counts: [1] });
		expect(result.inr).toEqual({ edges: [], counts: [] });
	});

	test("the smallest dinar amount, 0.001, has the bucket 1 to 2", async () => {
		const { result } = await asUser(golden.userId, async (tx) => {
			await addExpense(tx, golden.userId, {
				payee: "Kuwait Low",
				amountMinor: 1,
				occurredOn: "2026-11-02",
			});
			return kuwait(tx, { q: "0.001" });
		});
		expect(result).toEqual({ edges: [1, 2], counts: [1] });
	});

	test("the amount bounds are still ignored when they name fils", async () => {
		const { result } = await asUser(golden.userId, async (tx) => {
			await addExpense(tx, golden.userId, {
				payee: "Kuwait Mid",
				amountMinor: 1250,
				occurredOn: "2026-11-02",
			});
			return kuwait(tx, { q: "kuwait", minMinor: 5000, maxMinor: 9999 });
		});
		expect(result).toEqual({ edges: [1250, 1600], counts: [1] });
	});
});

describe("another user's rows add nothing", () => {
	test("an extreme amount of another user widens no bucket of this one", async () => {
		const before = (await histogram({})).result;
		const ids: string[] = [];
		try {
			for (const amountMinor of [1, 99_999_999_999]) {
				const { rows } = await owner.query<{ id: string }>(
					`INSERT INTO app.transactions (id, user_id, created_at, updated_at, type, amount_minor,
					   occurred_at, occurred_on, category, payee, source, version)
					 VALUES (gen_random_uuid(), $1, $2, $2, 'expense', $3, $2, '2026-11-02', 'food', 'Other', 'manual', 1)
					 RETURNING id`,
					[other.userId, "2026-11-02T06:30:00Z", amountMinor],
				);
				ids.push(rows[0]!.id);
			}
			expect((await histogram({})).result).toEqual(before);
			expect((await histogram({ q: "other" })).result).toEqual({
				edges: [],
				counts: [],
			});
			const mine = await asUser(other.userId, (tx) =>
				amountHistogram(tx, goldenContext(other.userId), {}),
			);
			expect(mine.result.edges[0]).toBe(1);
			expect(mine.result.edges.at(-1)).toBe(100_000_000_000);
		} finally {
			await owner.query(
				"DELETE FROM app.transactions WHERE id = ANY($1::uuid[])",
				[ids],
			);
		}
	});
});
