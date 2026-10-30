import { sql } from "drizzle-orm";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

import { GOLDEN_NOW } from "../../../../../seed/golden";
import { loadGolden, type LoadedGolden } from "../../../../../seed/load-golden";
import { payeeMatches } from "@/lib/transactions/payees";
import { runtimePool } from "../../../db/pools";
import { createUser } from "../../../db/tests/private-rows";
import { parseOwnerEnv } from "../../../env";
import { listPayees, payeeHistory } from "../payees";
import { addExpense, asUser, goldenContext } from "./helpers";

/** `listPayees` and `payeeHistory` (BR-F03-44, BR-F03-61, BR-F03-62) on golden's M1 rows,
 * through the runtime role and RLS. Rows a test adds roll back. */

let owner: Client;
let golden: LoadedGolden;
let empty: string;

beforeAll(async () => {
	owner = new Client({
		connectionString: parseOwnerEnv(process.env).DATABASE_URL_OWNER,
	});
	await owner.connect();
	golden = await loadGolden(owner, await createUser(owner, "payees"));
	// A user with no rows of their own, for the matching mirror.
	empty = await createUser(owner, "payees-empty");
});

afterAll(async () => {
	await owner?.query(`DELETE FROM auth."user" WHERE id = ANY($1)`, [
		[golden?.userId, empty].filter(Boolean),
	]);
	await owner?.end();
	await runtimePool().end();
});

const ctx = () => goldenContext(golden.userId);

describe("the list (BR-F03-44)", () => {
	// golden: the Transactions table, all 22 M1 rows within 365 days of 2 November. Order: count,
	// then last use, then key.
	test("groups by payee, ordered by count then last use, with the newest row's details", async () => {
		const { result, statements } = await asUser(golden.userId, (tx) =>
			listPayees(tx, ctx()),
		);
		expect(statements).toBe(1);
		expect(result.items).toEqual([
			{
				payee: "Swiggy",
				count: 4,
				lastUsedOn: "2026-11-01",
				lastType: "expense",
				lastCategory: "food",
			},
			{
				payee: "Sunrise Apartments",
				count: 3,
				lastUsedOn: "2026-11-01",
				lastType: "expense",
				lastCategory: "housing",
			},
			{
				payee: "BigBasket",
				count: 2,
				lastUsedOn: "2026-10-14",
				lastType: "expense",
				lastCategory: "food",
			},
			// golden #18, Croma's refund, is newer than its expense #17.
			{
				payee: "Croma",
				count: 2,
				lastUsedOn: "2026-10-09",
				lastType: "refund",
				lastCategory: "shopping",
			},
			{
				payee: "Netflix",
				count: 2,
				lastUsedOn: "2026-10-05",
				lastType: "expense",
				lastCategory: "entertainment",
			},
			{
				payee: "Acme Corp",
				count: 2,
				lastUsedOn: "2026-10-01",
				lastType: "income",
				lastCategory: "salary",
			},
			{
				payee: "Amazon Prime",
				count: 1,
				lastUsedOn: "2026-10-12",
				lastType: "expense",
				lastCategory: "entertainment",
			},
			{
				payee: "Indian Oil",
				count: 1,
				lastUsedOn: "2026-10-11",
				lastType: "expense",
				lastCategory: "transportation",
			},
			{
				payee: "Zomato",
				count: 1,
				lastUsedOn: "2026-10-04",
				lastType: "expense",
				lastCategory: "food",
			},
			{
				payee: "Studio Nine",
				count: 1,
				lastUsedOn: "2026-09-25",
				lastType: "income",
				lastCategory: "freelance",
			},
			{
				payee: "Uber",
				count: 1,
				lastUsedOn: "2026-09-20",
				lastType: "expense",
				lastCategory: "transportation",
			},
			{
				payee: "Cult Gym",
				count: 1,
				lastUsedOn: "2026-09-10",
				lastType: "expense",
				lastCategory: "health",
			},
			{
				payee: "Myntra",
				count: 1,
				lastUsedOn: "2026-09-08",
				lastType: "expense",
				lastCategory: "shopping",
			},
		]);
	});

	// AC-F03-44; golden: section 5's category counts.
	test("carries categories: section 5's counts, by count then key", async () => {
		const { result } = await asUser(golden.userId, (tx) =>
			listPayees(tx, ctx()),
		);
		expect(result.categories).toEqual([
			{ key: "food", count: 7 },
			{ key: "entertainment", count: 3 },
			{ key: "housing", count: 3 },
			{ key: "shopping", count: 3 },
			{ key: "salary", count: 2 },
			{ key: "transportation", count: 2 },
			{ key: "freelance", count: 1 },
			{ key: "health", count: 1 },
		]);
	});

	// AC-F03-21
	test("groups swiggy and Swiggy into one, shown in the newest spelling", async () => {
		const { result } = await asUser(golden.userId, async (tx) => {
			await addExpense(tx, golden.userId, {
				payee: "swiggy",
				amountMinor: 100,
				occurredOn: "2026-11-02",
			});
			return listPayees(tx, ctx());
		});
		expect(result.items[0]).toMatchObject({
			payee: "swiggy",
			count: 5,
			lastUsedOn: "2026-11-02",
		});
		expect(
			result.items.filter(({ payee }) => payee.toLowerCase() === "swiggy"),
		).toHaveLength(1);
	});

	// AC-F03-21: the window runs from 3 November 2025 to 2 November 2026.
	test("ignores rows older than 365 days, and keeps the first day of the window", async () => {
		const { result } = await asUser(golden.userId, async (tx) => {
			await addExpense(tx, golden.userId, {
				payee: "Too Old",
				amountMinor: 100,
				occurredOn: "2025-11-02",
			});
			await addExpense(tx, golden.userId, {
				payee: "Just In",
				amountMinor: 100,
				occurredOn: "2025-11-03",
			});
			return listPayees(tx, ctx());
		});
		const names = result.items.map(({ payee }) => payee);
		expect(names).toContain("Just In");
		expect(names).not.toContain("Too Old");
		expect(result.categories?.find(({ key }) => key === "food")?.count).toBe(8);
	});

	// AC-F03-21
	test("returns at most 200 payees", async () => {
		const { result } = await asUser(golden.userId, async (tx) => {
			// One statement for all 201: a round trip each would take too long.
			await tx.execute(
				sql`INSERT INTO app.transactions (id, user_id, created_at, updated_at, type, amount_minor,
				   occurred_at, occurred_on, category, payee, source, version)
				 SELECT gen_random_uuid(), ${golden.userId}, ${GOLDEN_NOW}, ${GOLDEN_NOW}, 'expense', 100,
				        '2026-06-01T06:30:00Z', '2026-06-01', 'food', 'Payee ' || n, 'manual', 1
				 FROM generate_series(1, 201) AS n`,
			);
			return listPayees(tx, ctx());
		});
		expect(result.items).toHaveLength(200);
		// The golden payees, with the most rows or the latest use, stay.
		expect(result.items[0]?.payee).toBe("Swiggy");
	});

	test("breaks a tie in count and last use by key", async () => {
		const { result } = await asUser(golden.userId, async (tx) => {
			for (const payee of ["Zeta", "Alpha", "Ümit"]) {
				await addExpense(tx, golden.userId, {
					payee,
					amountMinor: 100,
					occurredOn: "2026-11-02",
				});
			}
			return listPayees(tx, ctx());
		});
		// One row each, used today: the newest of the single-row payees, after the six with more.
		expect(result.items.slice(6, 9).map(({ payee }) => payee)).toEqual([
			"Alpha",
			"Zeta",
			"Ümit",
		]);
	});
});

describe("the search (BR-F03-61)", () => {
	const search = (q: string) =>
		asUser(golden.userId, (tx) => listPayees(tx, ctx(), { q }));

	// AC-F03-44
	test.each([
		["apart", ["Sunrise Apartments"]],
		["o", ["Indian Oil"]],
		["rise", []],
		["SWIG", ["Swiggy"]],
		["c", ["Croma", "Acme Corp", "Cult Gym"]],
	])("q=%s finds %j", async (q, payees) => {
		const { result } = await search(q);
		expect(result.items.map(({ payee }) => payee)).toEqual(payees);
	});

	// AC-F03-44
	test("answers in the list's item shape, without categories", async () => {
		const { result } = await search("apart");
		expect(result).toEqual({
			items: [
				{
					payee: "Sunrise Apartments",
					count: 3,
					lastUsedOn: "2026-11-01",
					lastType: "expense",
					lastCategory: "housing",
				},
			],
		});
	});

	// AC-F03-44
	test("answers at most 8 payees", async () => {
		const { result } = await asUser(golden.userId, async (tx) => {
			for (let n = 0; n < 10; n += 1) {
				await addExpense(tx, golden.userId, {
					payee: `Test ${n}`,
					amountMinor: 100,
					occurredOn: "2026-11-02",
				});
			}
			return listPayees(tx, ctx(), { q: "test" });
		});
		expect(result.items).toHaveLength(8);
	});

	// AC-F03-44
	test("q=% matches only a payee with a literal %", async () => {
		const { result } = await asUser(golden.userId, async (tx) => {
			await addExpense(tx, golden.userId, {
				payee: "% Club",
				amountMinor: 100,
				occurredOn: "2026-11-02",
			});
			return listPayees(tx, ctx(), { q: "%" });
		});
		expect(result.items.map(({ payee }) => payee)).toEqual(["% Club"]);
	});

	test("keeps to the 365-day window", async () => {
		const { result } = await asUser(golden.userId, async (tx) => {
			await addExpense(tx, golden.userId, {
				payee: "Ancient",
				amountMinor: 100,
				occurredOn: "2024-01-01",
			});
			return listPayees(tx, ctx(), { q: "anc" });
		});
		expect(result.items).toEqual([]);
	});

	// BR-F03-61: the server's match mirrors payeeMatches, which the device uses.
	test("agrees with payeeMatches on every payee and query", async () => {
		const payees = [
			"Sunrise Apartments",
			"Indian Oil",
			"CAFÉ Ümit",
			"café",
			"Big  Basket",
			"Big-Basket",
			"a_b c",
			"axb",
			"100% Pure",
			"% Club",
			"back\\slash",
			"Zeta",
			// B9, D-497: where JavaScript's `toLowerCase` and Postgres's `lower()` differ.
			"İstanbul Kebab",
			"Big İstanbul",
			"ΟΔΟΣ",
			"οδος",
		];
		const queries = [
			"s",
			"su",
			"apart",
			"o",
			"caf",
			"ümit",
			"ÜMIT",
			"b",
			"bas",
			"basket",
			"_",
			"a_",
			"%",
			"pure",
			"100",
			"c",
			"\\",
			"k\\s",
			"zeta",
			"zetas",
			"big b",
			"x",
			"ist",
			"İST",
			"οδοσ",
			"ΟΔΟΣ",
			"οδος",
		];
		const { result } = await asUser(empty, async (tx) => {
			for (const payee of payees) {
				await addExpense(tx, empty, {
					payee,
					amountMinor: 100,
					occurredOn: "2026-11-02",
				});
			}
			const found: Record<string, string[]> = {};
			for (const q of queries) {
				const { items } = await listPayees(tx, goldenContext(empty), { q });
				found[q] = items.map(({ payee }) => payee).sort();
			}
			return found;
		});
		const expected = Object.fromEntries(
			queries.map((q) => [
				q,
				payees.filter((payee) => payeeMatches(payee, q)).sort(),
			]),
		);
		expect(result).toEqual(expected);
		// No query matches more than the 8 a search returns, so the comparison is complete.
		expect(
			Math.max(...Object.values(expected).map((list) => list.length)),
		).toBeLessThanOrEqual(8);
	});
});

describe("history (BR-F03-62)", () => {
	const history = (payee: string, months: number) =>
		asUser(golden.userId, (tx) => payeeHistory(tx, ctx(), payee, months));

	// AC-F03-43; golden: section 5's payee history table. Three months before 2 November is
	// 2 August; one month before is 2 October.
	test.each([
		["Swiggy", 3, { count: 4, inMinor: 0, outMinor: 329000, usualDay: 3 }],
		["Swiggy", 1, { count: 3, inMinor: 0, outMinor: 144000, usualDay: 19 }],
		["Acme Corp", 3, { count: 2, inMinor: 17000000, outMinor: 0, usualDay: 1 }],
	])("%s over %i months matches section 5", async (payee, months, expected) => {
		const { result, statements } = await history(payee, months);
		expect(result).toEqual(expected);
		expect(statements).toBe(1);
	});

	// AC-F03-43
	test("swiggy answers the same as Swiggy", async () => {
		expect((await history("swiggy", 3)).result).toEqual(
			(await history("Swiggy", 3)).result,
		);
	});

	// AC-F03-43
	test("a payee with no rows answers zeros and a null usualDay", async () => {
		expect((await history("Nobody", 3)).result).toEqual({
			count: 0,
			inMinor: 0,
			outMinor: 0,
			usualDay: null,
		});
	});

	// golden #19: Indian Oil's one row, on 11 October.
	test("one row has a count but no usual day", async () => {
		expect((await history("Indian Oil", 3)).result).toEqual({
			count: 1,
			inMinor: 0,
			outMinor: 180000,
			usualDay: null,
		});
	});

	// golden #17 and #18: Croma's expense of 4,500.00 on 7 October and refund of 1,500.00 on
	// 9 October. Out nets them; the lower middle of days 7 and 9 is 7.
	test("Out is expenses minus refunds, and an even count takes the lower middle day", async () => {
		expect((await history("Croma", 3)).result).toEqual({
			count: 2,
			inMinor: 0,
			outMinor: 300000,
			usualDay: 7,
		});
	});

	test("includes the window's first day and leaves out the day before it", async () => {
		const { result } = await asUser(golden.userId, async (tx) => {
			await addExpense(tx, golden.userId, {
				payee: "Edgecase",
				amountMinor: 100,
				occurredOn: "2026-10-02",
			});
			await addExpense(tx, golden.userId, {
				payee: "Edgecase",
				amountMinor: 100,
				occurredOn: "2026-10-01",
			});
			return payeeHistory(tx, ctx(), "Edgecase", 1);
		});
		expect(result.count).toBe(1);
	});
});
