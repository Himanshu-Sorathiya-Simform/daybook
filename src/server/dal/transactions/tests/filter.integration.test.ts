import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

import { loadGolden, type LoadedGolden } from "../../../../../seed/load-golden";
import { CATEGORY_KEYS, SOURCES, TXN_TYPES } from "@/lib/transactions/model";
import {
	matchesFilter,
	searchText,
	type MatchableRow,
} from "@/lib/transactions/match";
import { readFilterParams, type TransactionFilter } from "@/lib/transactions/url";
import { runtimePool } from "../../../db/pools";
import { GOLDEN_NOW, createUser } from "../../../db/tests/private-rows";
import { parseOwnerEnv } from "../../../env";
import { withUser } from "../../with-user";
import { SEARCH_TEXT, filterSql } from "../filter";

/**
 * The filter's SQL (FIL-2) against a real database, through the runtime role and RLS:
 * - `golden` holds only golden's M1 rows, for the list checks;
 * - `mirror` holds them plus edge rows, where SQL and `matchesFilter` must agree on every
 *   filter (BR-F03-43, AC-F03-17).
 */

/** An extra row for the mirror user: an expense on 20 October unless it says otherwise. */
type EdgeRow = MatchableRow & { id: string; occurredAt: string; label: string };

function edge(label: string, fields: Partial<EdgeRow>): EdgeRow {
	return {
		label,
		id: randomUUID(),
		type: "expense",
		amountMinor: 99900,
		occurredOn: "2026-10-20",
		occurredAt: "2026-10-20T06:00:00Z",
		category: "shopping",
		goalId: null,
		subscriptionId: null,
		source: "manual",
		payee: "Edge",
		description: null,
		note: null,
		...fields,
	};
}

const EDGES: EdgeRow[] = [
	edge("50% off", {
		payee: "Deal shop",
		description: "50% off",
		amountMinor: 12345,
	}),
	edge("500 pack", {
		payee: "Deal shop",
		description: "500 pack",
		amountMinor: 50000,
	}),
	edge("a_b", { payee: "a_b", category: "food", amountMinor: 100 }),
	edge("axb", { payee: "axb", category: "food", amountMinor: 6400 }),
	edge("backslash", { payee: "back\\slash", amountMinor: 77700 }),
	edge("Route 64", { payee: "Route 64", category: "transportation" }),
	edge("CAFÉ Ümit", {
		type: "income",
		category: "freelance",
		payee: "CAFÉ Ümit",
		description: "Crème brûlée",
		amountMinor: 250000,
	}),
	edge("note", {
		type: "refund",
		payee: "Notes",
		note: "line one\nline two swiggy",
		amountMinor: 64900,
		occurredOn: "2026-11-01",
		occurredAt: "2026-10-31T20:00:00Z",
	}),
];

let owner: Client;
let golden: LoadedGolden;
let mirror: LoadedGolden;

beforeAll(async () => {
	owner = new Client({
		connectionString: parseOwnerEnv(process.env).DATABASE_URL_OWNER,
	});
	await owner.connect();
	golden = await loadGolden(owner, await createUser(owner, "filter-golden"));
	mirror = await loadGolden(owner, await createUser(owner, "filter-mirror"));
	for (const row of EDGES) {
		await owner.query(
			`INSERT INTO app.transactions (id, user_id, created_at, updated_at, type, amount_minor,
			   occurred_at, occurred_on, category, payee, description, note, source, version)
			 VALUES ($1, $2, $3, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 1)`,
			[
				row.id,
				mirror.userId,
				GOLDEN_NOW,
				row.type,
				row.amountMinor,
				row.occurredAt,
				row.occurredOn,
				row.category,
				row.payee,
				row.description,
				row.note,
				row.source,
			],
		);
	}
});

afterAll(async () => {
	await owner?.query(`DELETE FROM auth."user" WHERE id = ANY($1)`, [
		[golden?.userId, mirror?.userId].filter(Boolean),
	]);
	await owner?.end();
	await runtimePool().end();
});

const asUser = (userId: string) => ({
	user: { id: userId, email: "filter@isolation.test", name: "Filter" },
});

/** The ids each filter selects for `userId`, sorted, from one statement. */
async function idsFor(
	userId: string,
	filters: readonly TransactionFilter[],
): Promise<string[][]> {
	return withUser(asUser(userId), "read", async (tx) => {
		const lists = filters.map(
			(filter, index) =>
				sql`SELECT ${index}::int AS i, (SELECT coalesce(json_agg(id ORDER BY id), '[]'::json)
					FROM app.transactions WHERE ${filterSql(filter, "INR")}) AS ids`,
		);
		const result = await tx.execute<{ i: number; ids: string[] }>(
			sql.join(lists, sql` UNION ALL `),
		);
		const byIndex = new Map(result.rows.map((row) => [row.i, row.ids]));
		return filters.map((_, index) => [...(byIndex.get(index) ?? [])].sort());
	});
}

/** The golden row numbers one filter selects for the golden user, in number order. */
async function goldenRows(filter: TransactionFilter): Promise<number[]> {
	const [ids] = await idsFor(golden.userId, [filter]);
	return ids!.map((id) => golden.golden(id)).sort((a, b) => a - b);
}

/** The labels one filter selects for the mirror user: `#n` for golden rows, else the edge's. */
async function mirrorLabels(filter: TransactionFilter): Promise<string[]> {
	const [ids] = await idsFor(mirror.userId, [filter]);
	const edges = new Map(EDGES.map((row) => [row.id, row.label]));
	return ids!
		.map((id) => edges.get(id) ?? `#${mirror.golden(id)}`)
		.sort((a, b) => a.localeCompare(b, "en", { numeric: true }));
}

/** The filter a URL gives, as the golden checks write it. */
function filterOf(query: string): TransactionFilter {
	const { filter, invalid } = readFilterParams(new URLSearchParams(query), {
		currency: "INR",
	});
	expect(invalid).toEqual([]);
	return filter;
}

// golden: Transactions list checks. At M1 the Goal rows (#14, #22, #23 in A; all of F) are not
// loaded (D-465), so A keeps its 11 other rows and F selects nothing.
const CHECKS = [
	[
		"A",
		"from=2026-10-01&to=2026-10-31",
		[12, 13, 15, 16, 17, 18, 19, 20, 21, 24, 25],
	],
	["B", "from=2026-10-01&to=2026-10-31&cat=food", [15, 21, 24, 25]],
	["C", "from=2026-09-01&to=2026-10-31&cat=shopping", [6, 17, 18]],
	["D", "q=swiggy", [4, 24, 25, 26]],
	["E", "from=2026-10-01&to=2026-10-31&src=subscription", [12, 16, 20]],
	["F", "type=goal_contribution,goal_withdrawal", []],
	["G", "q=groceries", [8, 21]],
	["H", "q=649", [5, 16]],
	["I", "from=2026-11-01&to=2026-11-02", [26, 27]],
] as const;

// AC-F03-27
describe("the golden list checks at M1", () => {
	test.each(CHECKS)(
		"check %s (%s) selects its rows",
		async (_check, query, rows) => {
			expect(await goldenRows(filterOf(query))).toEqual(rows);
		},
	);

	test("the empty filter selects all 22 rows", async () => {
		expect(await goldenRows({})).toHaveLength(22);
	});
});

describe("each field", () => {
	test.each([
		[
			"from equal to to, both inclusive",
			{ from: "2026-10-01", to: "2026-10-01" },
			[12, 13],
		],
		["from alone", { from: "2026-11-01" }, [26, 27]],
		["to alone", { to: "2026-09-01" }, [1, 2]],
		// golden: #1, #12, #26 and #27 sit in another month in UTC; the local date decides.
		[
			"the local date, never the UTC one",
			{ from: "2026-09-01", to: "2026-09-30" },
			[1, 2, 4, 5, 6, 7, 8, 10, 11],
		],
		["one type", { type: ["refund"] }, [18]],
		["several types", { type: ["income", "refund"] }, [2, 11, 13, 18]],
		["an empty type list", { type: [] }, []],
		["a Goal type, which M1 never stores", { type: ["goal_contribution"] }, []],
		["one category", { cat: ["health"] }, [7]],
		["several categories", { cat: ["salary", "freelance"] }, [2, 11, 13]],
		["an empty category list", { cat: [] }, []],
		["charges", { src: "subscription" }, [1, 5, 7, 12, 16, 20, 27]],
		[
			"manual rows",
			{ src: "manual" },
			[2, 4, 6, 8, 10, 11, 13, 15, 17, 18, 19, 21, 24, 25, 26],
		],
		[
			"min equal to max, both inclusive",
			{ minMinor: 64900, maxMinor: 64900 },
			[5, 16],
		],
		["bounds between two amounts", { minMinor: 64901, maxMinor: 64999 }, []],
		["min alone", { minMinor: 1800000 }, [1, 2, 12, 13, 27]],
		["max alone", { maxMinor: 42000 }, [25, 26]],
		// D-470: no M1 row has a Goal or a Subscription.
		["a Goal", { goal: "0199a000-0000-7000-8001-000000000001" }, []],
		["a Subscription", { sub: "0199a000-0000-7000-8002-000000000001" }, []],
	] as const satisfies readonly (readonly [
		string,
		TransactionFilter,
		readonly number[],
	])[])("%s", async (_label, filter, rows) => {
		expect(await goldenRows(filter)).toEqual(rows);
	});

	test("every field must match (FIL-1)", async () => {
		// golden #21: BigBasket, an October food expense of 2,900.00, entered by hand.
		const all: TransactionFilter = {
			from: "2026-10-01",
			to: "2026-10-31",
			type: ["expense"],
			cat: ["food"],
			src: "manual",
			minMinor: 50000,
			maxMinor: 300000,
			q: "big",
		};
		expect(await goldenRows(all)).toEqual([21]);
		expect(await goldenRows({ ...all, q: "zomato" })).toEqual([15]);
		expect(await goldenRows({ ...all, src: "subscription" })).toEqual([]);
	});
});

describe("text search (BR-F03-35)", () => {
	test("reads the same text as matchesFilter: payee, description and note joined by U+001F", async () => {
		const stored = await withUser(asUser(mirror.userId), "read", async (tx) => {
			const result = await tx.execute<{ id: string; text: string }>(
				sql`SELECT id, ${SEARCH_TEXT} AS text FROM app.transactions`,
			);
			return result.rows;
		});
		const rows = new Map<string, MatchableRow>([
			...mirror.rows.map((row) => [row.id, row] as const),
			...EDGES.map((row) => [row.id, row] as const),
		]);
		expect(stored).toHaveLength(rows.size);
		for (const { id, text } of stored)
			expect(text).toBe(searchText(rows.get(id)!));
	});

	// AC-F03-16
	test("q=50% matches 50% literally, and not 500", async () => {
		expect(await mirrorLabels({ q: "50%" })).toEqual(["50% off"]);
	});

	test("_ and \\ match literally", async () => {
		expect(await mirrorLabels({ q: "a_b" })).toEqual(["a_b"]);
		expect(await mirrorLabels({ q: "_" })).toEqual(["a_b"]);
		expect(await mirrorLabels({ q: "\\" })).toEqual(["backslash"]);
		expect(await mirrorLabels({ q: "k\\s" })).toEqual(["backslash"]);
	});

	test("ignores case, letters outside ASCII included", async () => {
		expect(await mirrorLabels({ q: "café ümit" })).toEqual(["CAFÉ Ümit"]);
		expect(await mirrorLabels({ q: "CRÈME" })).toEqual(["CAFÉ Ümit"]);
	});

	test("finds the note, across its line feed", async () => {
		expect(await mirrorLabels({ q: "one\nline" })).toEqual(["note"]);
		expect(await mirrorLabels({ q: "swiggy" })).toEqual([
			"#4",
			"#24",
			"#25",
			"#26",
			"note",
		]);
	});

	test("never matches across two fields", async () => {
		expect(await mirrorLabels({ q: "Ümit Crème" })).toEqual([]);
		expect(await mirrorLabels({ q: "Ümitcrème" })).toEqual([]);
	});

	test("a numeric q also matches the exact amount (check H)", async () => {
		// The refund "note" is 649.00 too; neither text holds "649".
		expect(await mirrorLabels({ q: "649" })).toEqual(["#5", "#16", "note"]);
		expect(await mirrorLabels({ q: "6.49" })).toEqual([]);
		expect(await mirrorLabels({ q: "18,000.00" })).toEqual(["#1", "#12", "#27"]);
	});

	test("a numeric q under 3 characters matches amounts only", async () => {
		// "Route 64" holds the text 64 but not the amount 64.00, which "axb" has.
		expect(await mirrorLabels({ q: "64" })).toEqual(["axb"]);
		expect(await mirrorLabels({ q: "1" })).toEqual(["a_b"]);
		// 640 is 3 characters, so it also searches text; no text holds "640".
		expect(await mirrorLabels({ q: "640" })).toEqual(["#24"]);
	});
});

/** A small seeded generator (mulberry32), so the drawn filters are the same on every run. */
function generator(seed: number) {
	let state = seed;
	const next = () => {
		state = (state + 0x6d2b79f5) | 0;
		let t = Math.imul(state ^ (state >>> 15), 1 | state);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
	const pick = <T>(items: readonly T[]): T =>
		items[Math.floor(next() * items.length)] as T;
	const subset = <T>(items: readonly T[]): T[] => items.filter(() => next() < 0.3);
	return { chance: (p: number) => next() < p, pick, subset };
}

// Values on and beside the rows' own dates and amounts, so every bound is tested at its edge.
const DATES = [
	"2026-08-31",
	"2026-09-01",
	"2026-09-02",
	"2026-09-30",
	"2026-10-01",
	"2026-10-19",
	"2026-10-20",
	"2026-10-31",
	"2026-11-01",
	"2026-11-02",
];
const AMOUNTS = [
	100, 101, 6400, 12345, 38000, 42000, 45000, 64000, 64899, 64900, 64901, 150000,
	250000, 1800000, 8500000,
];
const QUERIES = [
	"swiggy",
	"SWIGGY",
	"Swig",
	"groceries",
	"monthly groceries",
	"649",
	"64",
	"6.49",
	"1",
	"640",
	"18,000.00",
	"1,800",
	"50%",
	"500",
	"%",
	"_",
	"a_b",
	"\\",
	"back\\",
	"café",
	"ÜMIT",
	"crème brûlée",
	"line two",
	"zzz",
	"a",
	"Deal shop",
];

function drawFilters(count: number): TransactionFilter[] {
	const g = generator(20261102);
	return Array.from({ length: count }, () => {
		const filter: TransactionFilter = {};
		if (g.chance(0.4)) {
			const [a, b] = [g.pick(DATES), g.pick(DATES)].sort();
			if (g.chance(0.8)) filter.from = a!;
			if (g.chance(0.8)) filter.to = b!;
		}
		if (g.chance(0.3)) filter.type = g.subset(TXN_TYPES);
		if (g.chance(0.3)) filter.cat = g.subset(CATEGORY_KEYS);
		if (g.chance(0.05)) filter.goal = randomUUID();
		if (g.chance(0.05)) filter.sub = randomUUID();
		if (g.chance(0.3)) filter.src = g.pick(SOURCES);
		if (g.chance(0.3)) filter.minMinor = g.pick(AMOUNTS);
		if (g.chance(0.3)) filter.maxMinor = g.pick(AMOUNTS);
		if (g.chance(0.5)) filter.q = g.pick(QUERIES);
		return filter;
	});
}

// AC-F03-17
describe("SQL and matchesFilter agree", () => {
	const filters = [
		...CHECKS.map(([, query]) => filterOf(query)),
		...drawFilters(400),
	];

	test("on every golden check and 400 drawn filters, row for row", async () => {
		const rows: { id: string; row: MatchableRow }[] = [
			...mirror.rows.map((row) => ({ id: row.id, row })),
			...EDGES.map((row) => ({ id: row.id, row })),
		];
		const fromSql = await idsFor(mirror.userId, filters);
		const mismatches = filters.flatMap((filter, index) => {
			const fromCode = rows
				.filter(({ row }) => matchesFilter(row, filter, "INR"))
				.map(({ id }) => id)
				.sort();
			const sqlIds = fromSql[index]!;
			return JSON.stringify(sqlIds) === JSON.stringify(fromCode) ?
					[]
				:	[{ filter, sqlIds, fromCode }];
		});
		expect(mismatches).toEqual([]);
	});

	test("the drawn filters reach every field and select none, some and many rows", async () => {
		const drawn = filters.slice(CHECKS.length);
		const fields = [
			"from",
			"to",
			"type",
			"cat",
			"goal",
			"sub",
			"src",
			"minMinor",
			"maxMinor",
			"q",
		];
		for (const field of fields) {
			expect(drawn.filter((filter) => field in filter).length).toBeGreaterThan(
				10,
			);
		}
		const sizes = (await idsFor(mirror.userId, drawn)).map((ids) => ids.length);
		expect(sizes.filter((size) => size === 0).length).toBeGreaterThan(20);
		expect(
			sizes.filter((size) => size >= 1 && size <= 5).length,
		).toBeGreaterThan(20);
		expect(sizes.filter((size) => size > 5).length).toBeGreaterThan(20);
	});
});

describe("plans", () => {
	async function plan(filter: TransactionFilter): Promise<string> {
		return withUser(asUser(golden.userId), "read", async (tx) => {
			// Golden's 22 rows are too few for the planner to prefer an index on its own.
			await tx.execute(sql`SET LOCAL enable_seqscan = off`);
			const result = await tx.execute<{ "QUERY PLAN": string }>(
				sql`EXPLAIN SELECT id FROM app.transactions WHERE ${filterSql(filter, "INR")}`,
			);
			return result.rows.map((row) => row["QUERY PLAN"]).join("\n");
		});
	}

	test("a date filter is an index condition on the date order index", async () => {
		const text = await plan({ from: "2026-10-01", to: "2026-10-31" });
		expect(text).toContain("transactions_date_order_idx");
		expect(text).toMatch(/Index Cond: .*occurred_on >= .*occurred_on <= /);
	});

	test("an amount filter is an index condition on the amount order index", async () => {
		const text = await plan({ minMinor: 50000, maxMinor: 300000 });
		expect(text).toContain("transactions_amount_order_idx");
		expect(text).toMatch(/Index Cond: .*amount_minor >= .*amount_minor <= /);
	});
});
