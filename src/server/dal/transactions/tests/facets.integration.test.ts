import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

import { loadGolden, type LoadedGolden } from "../../../../../seed/load-golden";
import { CATEGORY_KEYS, SOURCES, TXN_TYPES } from "@/lib/transactions/model";
import type { TransactionFilter } from "@/lib/transactions/url";
import { runtimePool } from "../../../db/pools";
import { createUser } from "../../../db/tests/private-rows";
import { parseOwnerEnv } from "../../../env";
import { facetCounts } from "../facets";
import { asUser, goldenContext } from "./helpers";

/** `facetCounts` (BR-F03-59) on golden's 22 M1 rows, through the runtime role and RLS. */

let owner: Client;
let golden: LoadedGolden;

beforeAll(async () => {
	owner = new Client({
		connectionString: parseOwnerEnv(process.env).DATABASE_URL_OWNER,
	});
	await owner.connect();
	golden = await loadGolden(owner, await createUser(owner, "facets"));
});

afterAll(async () => {
	await owner?.query(`DELETE FROM auth."user" WHERE id = $1`, [golden?.userId]);
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
