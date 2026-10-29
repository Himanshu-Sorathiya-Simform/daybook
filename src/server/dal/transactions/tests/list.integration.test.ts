import { createHash } from "node:crypto";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

import { goldenRow } from "../../../../../seed/golden";
import { loadGolden, type LoadedGolden } from "../../../../../seed/load-golden";
import type { Dir, Group, Sort } from "@/lib/transactions/model";
import type { TransactionFilter } from "@/lib/transactions/url";
import { ApiError } from "../../../api/errors";
import { runtimePool } from "../../../db/pools";
import { createUser } from "../../../db/tests/private-rows";
import { parseOwnerEnv } from "../../../env";
import type { Tx } from "../../with-user";
import { encodeCursor } from "../cursor";
import { type ListOptions, listTransactions, type TransactionPage } from "../list";
import { addExpense, asUser, goldenContext } from "./helpers";

/** `listTransactions` (F03 section 11) on golden's M1 rows, through the runtime role and
 * RLS. Every call runs in `asUser`, which rolls back, so tests may add rows first. */

let owner: Client;
let golden: LoadedGolden;

beforeAll(async () => {
	owner = new Client({
		connectionString: parseOwnerEnv(process.env).DATABASE_URL_OWNER,
	});
	await owner.connect();
	golden = await loadGolden(owner, await createUser(owner, "list"));
});

afterAll(async () => {
	await owner?.query(`DELETE FROM auth."user" WHERE id = $1`, [golden?.userId]);
	await owner?.end();
	await runtimePool().end();
});

const OCTOBER: TransactionFilter = { from: "2026-10-01", to: "2026-10-31" };
const DEFAULTS: ListOptions = { sort: "date", dir: "desc", group: "day", limit: 50 };

const list = (
	tx: Tx,
	filter: TransactionFilter,
	options: Partial<ListOptions> = {},
) =>
	listTransactions(tx, goldenContext(golden.userId), filter, {
		...DEFAULTS,
		...options,
	});

/** One page, alone in its own transaction. */
async function page(filter: TransactionFilter, options: Partial<ListOptions> = {}) {
	return (await asUser(golden.userId, (tx) => list(tx, filter, options))).result;
}

/** Golden row numbers, or `new` for a row a test added. */
const numbers = (result: TransactionPage) =>
	result.items.map((item) => {
		try {
			return golden.golden(item.id);
		} catch {
			return "new";
		}
	});

/** Every page from the first, following `nextCursor`. */
async function forward(
	tx: Tx,
	filter: TransactionFilter,
	options: Partial<ListOptions>,
) {
	const pages = [await list(tx, filter, options)];
	while (pages.at(-1)!.nextCursor) {
		pages.push(
			await list(tx, filter, {
				...options,
				cursor: pages.at(-1)!.nextCursor!,
			}),
		);
	}
	return pages;
}

/** From the last forward page, every earlier page by `prevCursor`, back to the start. */
async function backward(
	tx: Tx,
	filter: TransactionFilter,
	options: Partial<ListOptions>,
	last: TransactionPage,
) {
	const pages = [last];
	while (pages[0]!.prevCursor) {
		pages.unshift(
			await list(tx, filter, { ...options, cursor: pages[0]!.prevCursor! }),
		);
	}
	return pages;
}

const fingerprint = (keys: string[]) =>
	createHash("sha256").update(keys.join("\u001f")).digest("hex").slice(0, 16);

// golden: Transactions list checks, order checks, read for golden's 22 M1 rows.
const NEWEST_FIRST = [
	26, 27, 25, 24, 21, 20, 19, 18, 17, 16, 15, 13, 12, 11, 10, 8, 7, 6, 5, 4, 2, 1,
];

describe("order (BR-F03-29)", () => {
	// AC-F03-03: same-day order follows occurredAt, so #13 (10:05) sorts above #12 (Auto, 00:00)
	// and #26 (00:30) above #27 (Auto, 00:00).
	test("newest first runs #26, #27, #25, #24 and on", async () => {
		expect(numbers(await page({}))).toEqual(NEWEST_FIRST);
	});

	test("oldest first is the exact reverse", async () => {
		expect(numbers(await page({}, { dir: "asc" }))).toEqual(
			[...NEWEST_FIRST].reverse(),
		);
	});

	// AC-F03-03: October by amount, largest first, without the Goal rows #14, #22 and #23.
	test("October by amount, largest first, starts with #13 and #12", async () => {
		expect(
			numbers(await page(OCTOBER, { sort: "amount", group: "none" })),
		).toEqual([13, 12, 17, 21, 15, 19, 18, 20, 16, 24, 25]);
	});

	// golden #5 and #16 are both Netflix at 649.00; the later date sorts first.
	test("an amount tie breaks by date, then time, then id", async () => {
		const { result } = await asUser(golden.userId, async (tx) => {
			// The load's own prefix, so the ids compare with #16's on their last digits.
			const prefix = golden.id(16).slice(0, 24);
			for (const id of [`${prefix}00000000f001`, `${prefix}00000000f002`]) {
				await addExpense(tx, golden.userId, {
					id,
					payee: "Twin",
					amountMinor: 64900,
					occurredOn: "2026-10-05",
					occurredAt: "2026-10-04T18:30:00Z",
				});
			}
			return list(tx, { q: "649" }, { sort: "amount", group: "none" });
		});
		expect(result.items.map((item) => item.id.slice(-4))).toEqual([
			"f002",
			"f001",
			golden.id(16).slice(-4),
			golden.id(5).slice(-4),
		]);
	});

	test("items take the API's Transaction shape, M1's fixed fields included (D-475)", async () => {
		const row = goldenRow(21);
		const result = await page({ q: "groceries", from: "2026-10-01" });
		expect(result.items).toEqual([
			{
				id: golden.id(21),
				type: "expense",
				amountMinor: 290000,
				occurredAt: "2026-10-14T13:30:00.000Z",
				occurredOn: "2026-10-14",
				category: "food",
				goalId: null,
				payee: "BigBasket",
				description: "Monthly groceries",
				note: null,
				source: "manual",
				demo: false,
				subscriptionId: null,
				dueOn: null,
				edited: false,
				version: 1,
				createdAt: new Date(row.createdAt).toISOString(),
				updatedAt: new Date(row.updatedAt).toISOString(),
			},
		]);
	});
});

describe("day grouping (BR-F03-55, BR-F03-56)", () => {
	// AC-F03-34
	test("check A, oldest first, limit 1: #12 alone, with 1 October's whole-day totals", async () => {
		const result = await page(OCTOBER, { dir: "asc", limit: 1 });
		expect(numbers(result)).toEqual([12]);
		expect(result.groups).toEqual([
			{
				key: "2026-10-01",
				label: null,
				count: 2,
				inMinor: 8500000,
				outMinor: 1800000,
				toGoalsMinor: 0,
			},
		]);
		expect(result.order).toBeNull();
		expect(result.prevCursor).toBeNull();
		expect(result.nextCursor).not.toBeNull();
	});

	// AC-F03-34
	test("with no grouping, groups is empty and order null", async () => {
		const result = await page(OCTOBER, { dir: "asc", limit: 1, group: "none" });
		expect(numbers(result)).toEqual([12]);
		expect(result.groups).toEqual([]);
		expect(result.order).toBeNull();
	});

	// golden: Calendar heat map, October, for the three newest days.
	test("gives one entry per day on the page, in page order", async () => {
		const result = await page(OCTOBER, { limit: 3 });
		expect(numbers(result)).toEqual([25, 24, 21]);
		expect(
			result.groups.map(({ key, count, outMinor }) => [key, count, outMinor]),
		).toEqual([
			["2026-10-31", 1, 38000],
			["2026-10-19", 1, 64000],
			["2026-10-14", 1, 290000],
		]);
	});

	// golden #26 and #27 share 1 November: 420.00 and 18,000.00.
	// golden #26 (food, 420.00) and #27 (housing, 18,000.00) share 1 November.
	test("day totals count only the filter's rows", async () => {
		const result = await page({ cat: ["food"] }, { limit: 1 });
		expect(numbers(result)).toEqual([26]);
		expect(result.groups).toEqual([
			{
				key: "2026-11-01",
				label: null,
				count: 1,
				inMinor: 0,
				outMinor: 42000,
				toGoalsMinor: 0,
			},
		]);
	});

	test("a day split across pages carries its whole-day totals on each", async () => {
		const { result } = await asUser(golden.userId, (tx) =>
			forward(tx, {}, { limit: 1 }),
		);
		expect(result[0]!.groups).toEqual(result[1]!.groups);
		expect(result[0]!.groups).toEqual([
			{
				key: "2026-11-01",
				label: null,
				count: 2,
				inMinor: 0,
				outMinor: 1842000,
				toGoalsMinor: 0,
			},
		]);
	});
});

describe("category grouping (BR-F03-55 to BR-F03-57)", () => {
	// golden: section 5's group order for check A, without the Goal groups at M1.
	const CHECK_A = [13, 12, 25, 24, 21, 15, 18, 17, 20, 16, 19];
	const KEYS = [
		"salary",
		"housing",
		"food",
		"shopping",
		"entertainment",
		"transportation",
	];

	// AC-F03-35
	test("check A runs by weight; food's rows run #25, #24, #21, #15", async () => {
		const result = await page(OCTOBER, { group: "category" });
		expect(numbers(result)).toEqual(CHECK_A);
		expect(result.groups.map(({ key }) => key)).toEqual(KEYS);
		expect(result.groups[2]).toEqual({
			key: "food",
			label: null,
			count: 4,
			inMinor: 0,
			outMinor: 622000,
			toGoalsMinor: 0,
		});
		expect(result.order).toBe(fingerprint(KEYS));
	});

	// AC-F03-35
	test("paging with limit 2 returns every row exactly once, in that order", async () => {
		const { result } = await asUser(golden.userId, (tx) =>
			forward(tx, OCTOBER, { group: "category", limit: 2 }),
		);
		expect(result.flatMap(numbers)).toEqual(CHECK_A);
		expect(result).toHaveLength(6);
		expect(new Set(result.map((entry) => entry.order))).toEqual(
			new Set([fingerprint(KEYS)]),
		);
		// Page 2 holds food's #25 and #24; its entry is food's whole-filter total.
		expect(result[1]!.groups.map(({ key, count }) => [key, count])).toEqual([
			["food", 4],
		]);
	});

	test("the direction reverses rows inside a group, never the group order", async () => {
		const result = await page(OCTOBER, { group: "category", dir: "asc" });
		expect(numbers(result)).toEqual([
			13, 12, 15, 21, 24, 25, 17, 18, 16, 20, 19,
		]);
	});

	// AC-F03-37
	test("a write that reorders the groups ends the cursor; the reload starts afresh", async () => {
		const { result } = await asUser(golden.userId, async (tx) => {
			const first = await list(tx, OCTOBER, { group: "category", limit: 2 });
			// 20,000.00 of food lifts food (26,220.00) above housing (18,000.00).
			await addExpense(tx, golden.userId, {
				payee: "Feast",
				amountMinor: 2000000,
				occurredOn: "2026-10-20",
			});
			const stale = await list(tx, OCTOBER, {
				group: "category",
				limit: 2,
				cursor: first.nextCursor!,
			});
			const reload = await list(tx, OCTOBER, { group: "category", limit: 2 });
			return { first, stale, reload };
		});
		expect(numbers(result.first)).toEqual([13, 12]);
		expect(result.stale).toEqual({
			items: [],
			nextCursor: null,
			prevCursor: null,
			groups: [],
			order: fingerprint([
				"salary",
				"food",
				"housing",
				"shopping",
				"entertainment",
				"transportation",
			]),
		});
		expect(result.stale.order).not.toBe(result.first.order);
		expect(numbers(result.reload)).toEqual([13, 25]);
		expect(result.reload.order).toBe(result.stale.order);
	});

	test("a write that keeps the order keeps the cursor working", async () => {
		const { result } = await asUser(golden.userId, async (tx) => {
			const first = await list(tx, OCTOBER, { group: "category", limit: 2 });
			await addExpense(tx, golden.userId, {
				payee: "Snack",
				amountMinor: 100,
				occurredOn: "2026-10-20",
			});
			return list(tx, OCTOBER, {
				group: "category",
				limit: 3,
				cursor: first.nextCursor!,
			});
		});
		expect(numbers(result)).toEqual([25, "new", 24]);
	});

	test("with no rows, the fingerprint is that of no keys", async () => {
		const result = await page({ q: "zzz" }, { group: "category" });
		expect(result).toEqual({
			items: [],
			nextCursor: null,
			prevCursor: null,
			groups: [],
			order: "e3b0c44298fc1c14",
		});
	});
});

describe("payee grouping", () => {
	// AC-F03-36
	test("Swiggy's group: key swiggy, label Swiggy, count 4, Out 3,290.00", async () => {
		const result = await page({}, { group: "payee" });
		expect(result.groups.find(({ key }) => key === "swiggy")).toEqual({
			key: "swiggy",
			label: "Swiggy",
			count: 4,
			inMinor: 0,
			outMinor: 329000,
			toGoalsMinor: 0,
		});
	});

	// AC-F03-36
	test("after a SWIGGY row today, the label reads SWIGGY and the count is 5", async () => {
		const { result } = await asUser(golden.userId, async (tx) => {
			await addExpense(tx, golden.userId, {
				payee: "SWIGGY",
				amountMinor: 30000,
				occurredOn: "2026-11-02",
			});
			return list(tx, {}, { group: "payee" });
		});
		expect(result.groups.find(({ key }) => key === "swiggy")).toMatchObject({
			label: "SWIGGY",
			count: 5,
			outMinor: 359000,
		});
	});

	test("the fingerprint hashes the lowercased payee keys in weight order", async () => {
		const result = await page(OCTOBER, { group: "payee" });
		expect(result.order).toBe(
			fingerprint([
				"acme corp",
				"sunrise apartments",
				"croma",
				"bigbasket",
				"zomato",
				"indian oil",
				"amazon prime",
				"swiggy",
				"netflix",
			]),
		);
	});
});

describe("cursors (API-7, D-474)", () => {
	const COMBINATIONS: [Sort, Dir, Group][] = (["date", "amount"] as const).flatMap(
		(sort) =>
			(["desc", "asc"] as const).flatMap((dir) =>
				(["day", "category", "payee", "none"] as const)
					.filter((group) => !(sort === "amount" && group === "day"))
					.map((group): [Sort, Dir, Group] => [sort, dir, group]),
			),
	);

	test.each(COMBINATIONS)(
		"%s %s by %s: pages of 5 forward, then back, match the whole list",
		async (sort, dir, group) => {
			const options = { sort, dir, group, limit: 5 };
			const { result } = await asUser(golden.userId, async (tx) => {
				const whole = await list(tx, {}, { ...options, limit: 50 });
				const ahead = await forward(tx, {}, options);
				const back = await backward(tx, {}, options, ahead.at(-1)!);
				return { whole, ahead, back };
			});
			expect(result.whole.items).toHaveLength(22);
			expect(result.ahead.flatMap(numbers)).toEqual(numbers(result.whole));
			expect(result.ahead.map((entry) => entry.items.length)).toEqual([
				5, 5, 5, 5, 2,
			]);
			// Paging back from the last page rebuilds the same earlier pages.
			expect(result.back.map(numbers)).toEqual(result.ahead.map(numbers));
		},
	);

	test("the first page has no previous cursor; a later page has both", async () => {
		const { result } = await asUser(golden.userId, async (tx) => {
			const first = await list(tx, {}, { limit: 5 });
			const second = await list(
				tx,
				{},
				{ limit: 5, cursor: first.nextCursor! },
			);
			const back = await list(
				tx,
				{},
				{ limit: 5, cursor: second.prevCursor! },
			);
			return { first, second, back };
		});
		expect(result.first.prevCursor).toBeNull();
		expect(result.second.prevCursor).not.toBeNull();
		expect(result.second.nextCursor).not.toBeNull();
		expect(numbers(result.back)).toEqual(numbers(result.first));
		expect(result.back.prevCursor).toBeNull();
		expect(result.back.nextCursor).not.toBeNull();
	});

	test("a page that holds the last row has no next cursor", async () => {
		const result = await page({}, { limit: 22 });
		expect(result.items).toHaveLength(22);
		expect(result.nextCursor).toBeNull();
	});

	test("rows written ahead of a cursor never repeat or shift the next page (API-7)", async () => {
		const { result } = await asUser(golden.userId, async (tx) => {
			const first = await list(tx, {}, { limit: 5 });
			// Ahead of the cursor: newer than every row on the first page. Behind it: on
			// 13 October, between #21 and #20, inside the next page's span.
			await addExpense(tx, golden.userId, {
				payee: "Ahead",
				amountMinor: 100,
				occurredOn: "2026-11-02",
			});
			const behind = await addExpense(tx, golden.userId, {
				payee: "Behind",
				amountMinor: 100,
				occurredOn: "2026-10-13",
			});
			const next = await list(tx, {}, { limit: 5, cursor: first.nextCursor! });
			return { first, behind, next };
		});
		expect(numbers(result.first)).toEqual([26, 27, 25, 24, 21]);
		expect(result.next.items.map((item) => item.id)).toEqual([
			result.behind,
			golden.id(20),
			golden.id(19),
			golden.id(18),
			golden.id(17),
		]);
	});

	// AC-F03-38
	test.each([
		[
			"made under day grouping, sent with no grouping",
			{ group: "day" },
			{ group: "none" },
		],
		[
			"made under the date sort, sent with the amount sort",
			{ group: "none" },
			{ sort: "amount", group: "none" },
		],
		["made newest first, sent oldest first", { group: "day" }, { dir: "asc" }],
	] as const)("a cursor %s gets 400 bad_request", async (_label, made, sent) => {
		const first = await page({}, { limit: 1, ...made });
		const run = page({}, { limit: 1, ...sent, cursor: first.nextCursor! });
		await expect(run).rejects.toThrow(ApiError);
		await expect(run).rejects.toMatchObject({
			code: "bad_request",
			details: { params: ["cursor"] },
		});
	});

	test("a forged cursor naming a group the filter lacks returns nothing", async () => {
		const forged = encodeCursor({
			v: 1,
			sort: "date",
			dir: "desc",
			group: "category",
			travel: "next",
			on: "2026-10-01",
			at: "2026-10-01T04:35:00.000Z",
			id: golden.id(13),
			groupKey: "pizza",
			order: fingerprint([
				"salary",
				"housing",
				"food",
				"shopping",
				"entertainment",
				"transportation",
			]),
		});
		const result = await page(OCTOBER, { group: "category", cursor: forged });
		expect(result.items).toEqual([]);
		expect(result.nextCursor).toBeNull();
	});
});

describe("the call", () => {
	test.each(["day", "category", "payee", "none"] as const)(
		"sends one statement under %s grouping",
		async (group) => {
			const { statements } = await asUser(golden.userId, (tx) =>
				list(tx, OCTOBER, {
					group,
					sort: group === "day" ? "date" : "amount",
				}),
			);
			expect(statements).toBe(1);
		},
	);

	test.each([0, 101, 1.5])("refuses a limit of %s", async (limit) => {
		await expect(page({}, { limit })).rejects.toThrow(RangeError);
	});

	test("refuses day grouping with the amount sort", async () => {
		await expect(page({}, { sort: "amount", group: "day" })).rejects.toThrow(
			"Day grouping needs the date sort",
		);
	});

	test("applies the filter: check B lists its four rows", async () => {
		expect(numbers(await page({ ...OCTOBER, cat: ["food"] }))).toEqual([
			25, 24, 21, 15,
		]);
	});

	test("never lists another user's rows (SEC-2)", async () => {
		const other = await loadGolden(owner, await createUser(owner, "list-other"));
		try {
			expect((await page({})).items).toHaveLength(22);
		} finally {
			await owner.query(`DELETE FROM auth."user" WHERE id = $1`, [
				other.userId,
			]);
		}
	});
});
