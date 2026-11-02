import { randomUUID } from "node:crypto";
import { Client, DatabaseError, Pool, type PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

import { GOLDEN_NOW } from "../../../../seed/golden";
import { parseOwnerEnv, parseServerEnv } from "../../env";
import { createUser } from "./private-rows";

/** The `app.transaction_views` table (F03 section 3, D-469): saved views, written through the
 * runtime role with the user context set. Each test rolls back. */

type Row = Record<string, string | number | null>;

let owner: Client;
let runtime: Pool;
let user: string;
let other: string;

beforeAll(async () => {
	owner = new Client({
		connectionString: parseOwnerEnv(process.env).DATABASE_URL_OWNER,
	});
	await owner.connect();
	runtime = new Pool({
		connectionString: parseServerEnv(process.env).DATABASE_URL_RUNTIME,
		max: 2,
	});
	user = await createUser(owner, "views");
	other = await createUser(owner, "views-other");
});

afterAll(async () => {
	await owner?.query(`DELETE FROM auth."user" WHERE id = ANY($1)`, [
		[user, other],
	]);
	await Promise.all([owner?.end(), runtime?.end()]);
});

// F03 section 15's illustrated view. The filter goes in as JSON text: `pg` would send a
// JavaScript array as a Postgres array, not as JSON.
const view = (changes: Row = {}, userId = user): Row => ({
	id: randomUUID(),
	user_id: userId,
	name: "Food last month",
	filter: JSON.stringify({ range: "last_month", cat: ["food"] }),
	sort: "date",
	dir: "desc",
	group_by: "day",
	version: 1,
	created_at: GOLDEN_NOW,
	updated_at: GOLDEN_NOW,
	...changes,
});

function insert(client: Client | PoolClient, row: Row) {
	const columns = Object.keys(row);
	return client.query(
		`INSERT INTO app.transaction_views (${columns.join(", ")})
		 VALUES (${columns.map((_, index) => `$${index + 1}`).join(", ")})`,
		Object.values(row),
	);
}

async function asUser<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
	const client = await runtime.connect();
	try {
		await client.query("BEGIN");
		await client.query("SELECT set_config('app.user_id', $1, true)", [user]);
		return await fn(client);
	} finally {
		await client.query("ROLLBACK").catch(() => {});
		client.release();
	}
}

type Refusal = { code: string; constraint: string | null } | null;

async function failure(promise: Promise<unknown>): Promise<Refusal> {
	try {
		await promise;
		return null;
	} catch (error) {
		if (!(error instanceof DatabaseError)) throw error;
		return { code: error.code ?? "", constraint: error.constraint ?? null };
	}
}

/** The SQLSTATE and constraint an insert of `rows`, in order, ends with, or null. */
const refusal = (...rows: Row[]) =>
	asUser(async (client) => {
		for (const row of rows.slice(0, -1)) await insert(client, row);
		return failure(insert(client, rows[rows.length - 1] as Row));
	});

const CHECK = "23514";
const UNIQUE = "23505";

test("F03 section 15's view inserts and reads back with its filter as JSON", async () => {
	const stored = await asUser(async (client) => {
		await insert(client, view());
		const result = await client.query<{ filter: unknown; group_by: string }>(
			"SELECT filter, group_by FROM app.transaction_views",
		);
		return result.rows;
	});
	expect(stored).toEqual([
		{ filter: { range: "last_month", cat: ["food"] }, group_by: "day" },
	]);
});

describe("names (BR-F03-63)", () => {
	test("take 1 to 40 code points", async () => {
		expect(await refusal(view({ name: "👍".repeat(40) }))).toBeNull();
		for (const name of ["", "👍".repeat(41)]) {
			expect(await refusal(view({ name }))).toEqual({
				code: CHECK,
				constraint: "transaction_views_name_text",
			});
		}
	});

	test.each([
		["a tab", "Food\tview"],
		["a line feed", "Food\nview"],
		["a C1 control", "Food\u0085view"],
		["text not in NFC", "Café"],
	])("refuse %s", async (_name, name) => {
		expect(await refusal(view({ name }))).toEqual({
			code: CHECK,
			constraint: "transaction_views_name_text",
		});
	});

	test("are unique per user without regard to case", async () => {
		expect(
			await refusal(view({ name: "Food" }), view({ name: "FOOD" })),
		).toEqual({
			code: UNIQUE,
			constraint: "transaction_views_user_id_name_key",
		});
		expect(
			await refusal(view({ name: "Food" }), view({ name: "Food 2" })),
		).toBeNull();
	});

	test("may repeat across users", async () => {
		await owner.query("BEGIN");
		try {
			await insert(owner, view({ name: "Food" }));
			expect(
				await failure(insert(owner, view({ name: "Food" }, other))),
			).toBeNull();
		} finally {
			await owner.query("ROLLBACK");
		}
	});
});

describe("the filter (BR-F03-64)", () => {
	test("is a JSON object, the empty one included", async () => {
		expect(await refusal(view({ filter: "{}" }))).toBeNull();
		for (const filter of ["[]", '"last_month"', "3", "null", "true"]) {
			expect(await refusal(view({ filter }))).toEqual({
				code: CHECK,
				constraint: "transaction_views_filter_object",
			});
		}
	});

	test("may not be missing", async () => {
		expect(await refusal(view({ filter: null }))).toEqual({
			code: "23502",
			constraint: null,
		});
	});
});

describe("the list parameters (BR-F03-40, BR-F03-55)", () => {
	test.each([
		["sort", "price", "transaction_views_sort_values"],
		["dir", "up", "transaction_views_dir_values"],
		["group_by", "week", "transaction_views_group_by_values"],
		["version", 0, "transaction_views_version_positive"],
	])("refuses %s %j", async (column, value, constraint) => {
		expect(await refusal(view({ [column]: value }))).toEqual({
			code: CHECK,
			constraint,
		});
	});

	test("refuse day grouping with the amount sort", async () => {
		expect(await refusal(view({ sort: "amount", group_by: "day" }))).toEqual({
			code: CHECK,
			constraint: "transaction_views_day_needs_date_sort",
		});
		for (const group_by of ["category", "payee", "none"]) {
			expect(await refusal(view({ sort: "amount", group_by }))).toBeNull();
		}
	});

	test("accept every other combination", async () => {
		for (const sort of ["date", "amount"]) {
			for (const dir of ["desc", "asc"]) {
				for (const group_by of ["day", "category", "payee", "none"]) {
					if (sort === "amount" && group_by === "day") continue;
					expect(await refusal(view({ sort, dir, group_by }))).toBeNull();
				}
			}
		}
	});
});

test("the name and order indexes exist", async () => {
	const result = await owner.query<{ indexname: string; indexdef: string }>(
		`SELECT indexname, indexdef FROM pg_indexes
		 WHERE schemaname = 'app' AND tablename = 'transaction_views' ORDER BY indexname`,
	);
	const indexes = Object.fromEntries(
		result.rows.map((row) => [row.indexname, row.indexdef]),
	);
	expect(Object.keys(indexes)).toEqual([
		"transaction_views_order_idx",
		"transaction_views_pkey",
		"transaction_views_user_id_name_key",
	]);
	expect(indexes["transaction_views_user_id_name_key"]).toContain("UNIQUE INDEX");
	expect(indexes["transaction_views_user_id_name_key"]).toContain(
		"(user_id, lower(name))",
	);
	expect(indexes["transaction_views_order_idx"]).toContain(
		"(user_id, created_at, id)",
	);
});

test("deleting the user removes their views without a foreign-key error", async () => {
	const doomed = await createUser(owner, "views-delete");
	await owner.query("BEGIN");
	try {
		await insert(owner, view({}, doomed));
		await owner.query(`DELETE FROM auth."user" WHERE id = $1`, [doomed]);
		const left = await owner.query<{ count: string }>(
			"SELECT count(*) FROM app.transaction_views WHERE user_id = $1",
			[doomed],
		);
		expect(Number(left.rows[0]?.count)).toBe(0);
	} finally {
		await owner.query("ROLLBACK");
		await owner.query(`DELETE FROM auth."user" WHERE id = $1`, [doomed]);
	}
});
