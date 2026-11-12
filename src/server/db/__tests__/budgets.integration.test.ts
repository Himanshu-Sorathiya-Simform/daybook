import { randomUUID } from "node:crypto";
import { Client, DatabaseError, Pool, type PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

import { GOLDEN_NOW } from "../../../../seed/golden";
import { parseOwnerEnv, parseServerEnv } from "../../env";
import { createUser } from "./private-rows";

/** The `app.budgets` table (F04 section 3, D-563): one Budget per expense category, its
 * schedule and one-month limits as JSON arrays, written through the runtime role with the user
 * context set. Each test rolls back. */

type Row = Record<string, string | number | boolean | null>;

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
	user = await createUser(owner, "budgets");
	other = await createUser(owner, "budgets-other");
});

afterAll(async () => {
	await owner?.query(`DELETE FROM auth."user" WHERE id = ANY($1)`, [
		[user, other],
	]);
	await Promise.all([owner?.end(), runtime?.end()]);
});

// The golden food Budget (F04 section 15). The arrays go in as JSON text: `pg` would send a
// JavaScript array as a Postgres array, not as JSON.
const FOOD_SCHEDULE = [
	{ from: "2026-09", limitMinor: 600000 },
	{ from: "2026-10", limitMinor: 500000 },
];

const budget = (changes: Row = {}, userId = user): Row => ({
	id: randomUUID(),
	user_id: userId,
	category: "food",
	schedule: JSON.stringify(FOOD_SCHEDULE),
	overrides: "[]",
	version: 2,
	created_at: GOLDEN_NOW,
	updated_at: GOLDEN_NOW,
	...changes,
});

function insert(client: Client | PoolClient, row: Row) {
	const columns = Object.keys(row);
	return client.query(
		`INSERT INTO app.budgets (${columns.join(", ")})
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
const FOREIGN_KEY = "23503";
const NOT_NULL = "23502";
const GENERATED_ALWAYS = "428C9";

test("the golden food Budget inserts and reads back with its arrays as JSON", async () => {
	const stored = await asUser(async (client) => {
		await insert(client, budget());
		const result = await client.query(
			"SELECT category, category_kind, schedule, overrides, demo, version FROM app.budgets",
		);
		return result.rows;
	});
	expect(stored).toEqual([
		{
			category: "food",
			category_kind: "expense",
			schedule: FOOD_SCHEDULE,
			overrides: [],
			demo: false,
			version: 2,
		},
	]);
});

test("a new row starts at version 1 and is not demo data", async () => {
	const row = budget();
	delete row.version;
	const stored = await asUser(async (client) => {
		await insert(client, row);
		const result = await client.query<{ demo: boolean; version: number }>(
			"SELECT demo, version FROM app.budgets",
		);
		return result.rows;
	});
	expect(stored).toEqual([{ demo: false, version: 1 }]);
});

describe("one Budget per expense category (BR-F04-01)", () => {
	test("a second Budget for the same category is refused", async () => {
		expect(await refusal(budget(), budget())).toEqual({
			code: UNIQUE,
			constraint: "budgets_user_id_category_key",
		});
	});

	test("Budgets for different categories sit side by side", async () => {
		expect(await refusal(budget(), budget({ category: "shopping" }))).toBeNull();
	});

	test("another user may budget the same category", async () => {
		await owner.query("BEGIN");
		try {
			await insert(owner, budget());
			expect(await failure(insert(owner, budget({}, other)))).toBeNull();
		} finally {
			await owner.query("ROLLBACK");
		}
	});

	// BR-F04-01: a create inserts with ON CONFLICT DO NOTHING and no target, so neither a
	// repeated id nor a taken category aborts the transaction.
	test("ON CONFLICT DO NOTHING with no target inserts nothing on either conflict", async () => {
		const counts = await asUser(async (client) => {
			const first = budget();
			await insert(client, first);
			const conflict = (row: Row) => {
				const columns = Object.keys(row);
				return client.query(
					`INSERT INTO app.budgets (${columns.join(", ")})
					 VALUES (${columns.map((_, index) => `$${index + 1}`).join(", ")})
					 ON CONFLICT DO NOTHING`,
					Object.values(row),
				);
			};
			const sameCategory = await conflict(budget());
			const sameId = await conflict(
				budget({ id: first.id, category: "shopping" }),
			);
			const total = await client.query<{ n: number }>(
				"SELECT count(*)::int AS n FROM app.budgets",
			);
			return [sameCategory.rowCount, sameId.rowCount, total.rows[0]?.n];
		});
		expect(counts).toEqual([0, 0, 1]);
	});
});

describe("the category (CAT-2)", () => {
	test("may be any expense category", async () => {
		for (const category of ["food", "housing", "fees_taxes", "other"]) {
			expect(await refusal(budget({ category }))).toBeNull();
		}
	});

	test.each(["salary", "freelance", "gifts"])(
		"refuses the income category %s",
		async (category) => {
			expect(await refusal(budget({ category }))).toEqual({
				code: FOREIGN_KEY,
				constraint: "budgets_category_kind_fk",
			});
		},
	);

	test("refuses a key that is no category", async () => {
		expect(await refusal(budget({ category: "groceries" }))).toEqual({
			code: FOREIGN_KEY,
			constraint: "budgets_category_kind_fk",
		});
	});

	test("may not be missing", async () => {
		expect(await refusal(budget({ category: null }))).toEqual({
			code: NOT_NULL,
			constraint: null,
		});
	});

	test("its kind is computed and can't be written", async () => {
		expect(await refusal(budget({ category_kind: "income" }))).toEqual({
			code: GENERATED_ALWAYS,
			constraint: null,
		});
	});
});

describe("the schedule (F04 section 3)", () => {
	test("is a JSON array with at least one entry", async () => {
		expect(
			await refusal(budget({ schedule: JSON.stringify([FOOD_SCHEDULE[0]]) })),
		).toBeNull();
		for (const schedule of ["[]", "{}", '"2026-09"', "600000", "null", "true"]) {
			expect(await refusal(budget({ schedule }))).toEqual({
				code: CHECK,
				constraint: "budgets_schedule_array",
			});
		}
	});

	test("may not be missing", async () => {
		expect(await refusal(budget({ schedule: null }))).toEqual({
			code: NOT_NULL,
			constraint: null,
		});
	});
});

describe("the one-month limits (BR-F04-24)", () => {
	test("are a JSON array, the empty one included", async () => {
		for (const overrides of [
			"[]",
			JSON.stringify([{ month: "2026-10", limitMinor: 800000 }]),
			JSON.stringify([{ month: "2026-10", limitMinor: null }]),
		]) {
			expect(await refusal(budget({ overrides }))).toBeNull();
		}
		for (const overrides of ["{}", '"2026-10"', "800000", "null", "false"]) {
			expect(await refusal(budget({ overrides }))).toEqual({
				code: CHECK,
				constraint: "budgets_overrides_array",
			});
		}
	});

	test("may not be missing", async () => {
		expect(await refusal(budget({ overrides: null }))).toEqual({
			code: NOT_NULL,
			constraint: null,
		});
	});
});

test("refuses a version below 1", async () => {
	for (const version of [0, -1]) {
		expect(await refusal(budget({ version }))).toEqual({
			code: CHECK,
			constraint: "budgets_version_positive",
		});
	}
});

test("the primary key and the category key are the only indexes", async () => {
	const result = await owner.query<{ indexname: string; indexdef: string }>(
		`SELECT indexname, indexdef FROM pg_indexes
		 WHERE schemaname = 'app' AND tablename = 'budgets' ORDER BY indexname`,
	);
	const indexes = Object.fromEntries(
		result.rows.map((row) => [row.indexname, row.indexdef]),
	);
	expect(Object.keys(indexes)).toEqual([
		"budgets_pkey",
		"budgets_user_id_category_key",
	]);
	expect(indexes["budgets_user_id_category_key"]).toContain(
		"UNIQUE INDEX budgets_user_id_category_key ON app.budgets USING btree (user_id, category)",
	);
});

test("deleting the user removes their Budgets without a foreign-key error", async () => {
	const doomed = await createUser(owner, "budgets-delete");
	await owner.query("BEGIN");
	try {
		await insert(owner, budget({}, doomed));
		await insert(owner, budget({ category: "shopping" }, doomed));
		await owner.query(`DELETE FROM auth."user" WHERE id = $1`, [doomed]);
		const left = await owner.query<{ count: string }>(
			"SELECT count(*) FROM app.budgets WHERE user_id = $1",
			[doomed],
		);
		expect(Number(left.rows[0]?.count)).toBe(0);
	} finally {
		await owner.query("ROLLBACK");
		await owner.query(`DELETE FROM auth."user" WHERE id = $1`, [doomed]);
	}
});
