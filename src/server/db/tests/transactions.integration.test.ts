import { randomUUID } from "node:crypto";
import { Client, DatabaseError, Pool, type PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

import {
	GOLDEN_ALL,
	goldenRow,
	type GoldenTransaction,
} from "../../../../seed/golden";
import { parseOwnerEnv, parseServerEnv } from "../../env";
import { createUser } from "./private-rows";

/** The `app.transactions` table (F03 section 3, D-465 to D-468): every row a user writes goes
 * through the runtime role with the user context set, as the data access layer sets it. Each
 * test runs in a transaction that rolls back, so the golden ids never collide. */

type Row = Record<string, string | number | boolean | null>;

let owner: Client;
let runtime: Pool;
let user: string;

beforeAll(async () => {
	owner = new Client({
		connectionString: parseOwnerEnv(process.env).DATABASE_URL_OWNER,
	});
	await owner.connect();
	runtime = new Pool({
		connectionString: parseServerEnv(process.env).DATABASE_URL_RUNTIME,
		max: 2,
	});
	user = await createUser(owner, "transactions");
});

afterAll(async () => {
	await owner?.query(`DELETE FROM auth."user" WHERE id = $1`, [user]);
	await Promise.all([owner?.end(), runtime?.end()]);
});

/** A golden Transaction as a database row of `userId`. */
function rowOf(
	transaction: GoldenTransaction,
	userId: string,
	id = transaction.id,
): Row {
	return {
		id,
		user_id: userId,
		type: transaction.type,
		amount_minor: transaction.amountMinor,
		occurred_at: transaction.occurredAt,
		occurred_on: transaction.occurredOn,
		category: transaction.category,
		payee: transaction.payee,
		description: transaction.description,
		note: transaction.note,
		source: transaction.source,
		demo: transaction.demo,
		version: transaction.version,
		created_at: transaction.createdAt,
		updated_at: transaction.updatedAt,
	};
}

// golden #24: Swiggy, 640.00 food, 22:15 on 19 October.
const valid = (changes: Row = {}): Row => ({
	...rowOf(goldenRow(24), user, randomUUID()),
	...changes,
});

function insert(client: PoolClient, row: Row) {
	const columns = Object.keys(row);
	return client.query(
		`INSERT INTO app.transactions (${columns.join(", ")})
		 VALUES (${columns.map((_, index) => `$${index + 1}`).join(", ")})`,
		Object.values(row),
	);
}

/** Runs `fn` as the user, in a transaction that rolls back. */
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

/** The SQLSTATE and constraint an insert of `row` fails with, or null when it succeeds. */
async function refusal(
	row: Row,
): Promise<{ code: string; constraint: string | null } | null> {
	return asUser(async (client) => {
		try {
			await insert(client, row);
			return null;
		} catch (error) {
			if (!(error instanceof DatabaseError)) throw error;
			return { code: error.code ?? "", constraint: error.constraint ?? null };
		}
	});
}

const CHECK = "23514";
const FOREIGN_KEY = "23503";
const NOT_NULL = "23502";

// D-465: at M1 the table holds income, expense and refund; Goal rows arrive with F06.
const M1_ROWS = GOLDEN_ALL.filter((row) => row.goalId === null);

describe("the golden rows", () => {
	// AC-F03-27: at M1, the charges load as unlinked rows with source subscription.
	test("every golden income, expense and refund row inserts as its owner", async () => {
		expect(M1_ROWS.map((row) => row.golden)).toEqual([
			1, 2, 4, 5, 6, 7, 8, 10, 11, 12, 13, 15, 16, 17, 18, 19, 20, 21, 24, 25,
			26, 27,
		]);
		const count = await asUser(async (client) => {
			for (const row of M1_ROWS) await insert(client, rowOf(row, user));
			const result = await client.query<{ count: string }>(
				"SELECT count(*) FROM app.transactions",
			);
			return Number(result.rows[0]?.count);
		});
		expect(count).toBe(22);
	});

	test("a Goal row is refused until Goals exist (D-465)", async () => {
		expect(await refusal(rowOf(goldenRow(3), user))).toEqual({
			code: NOT_NULL,
			constraint: null,
		});
		expect(await refusal(valid({ type: "goal_contribution" }))).toEqual({
			code: CHECK,
			constraint: "transactions_type_values",
		});
	});
});

describe("the category suits the type (TXN-3, D-466)", () => {
	test("category_kind is income for income and expense for expenses and refunds", async () => {
		const kinds = await asUser(async (client) => {
			await insert(client, rowOf(goldenRow(2), user));
			await insert(client, rowOf(goldenRow(17), user));
			await insert(client, rowOf(goldenRow(18), user));
			const result = await client.query<{
				type: string;
				category_kind: string;
			}>(
				"SELECT type, category_kind FROM app.transactions ORDER BY occurred_on",
			);
			return result.rows;
		});
		expect(kinds).toEqual([
			{ type: "income", category_kind: "income" },
			{ type: "expense", category_kind: "expense" },
			{ type: "refund", category_kind: "expense" },
		]);
	});

	test.each([
		["an income with food", { type: "income", category: "food" }],
		["an expense with salary", { type: "expense", category: "salary" }],
		["a refund with salary", { type: "refund", category: "salary" }],
		["an unknown category", { category: "pizza" }],
	])("refuses %s", async (_name, changes) => {
		expect(await refusal(valid(changes))).toEqual({
			code: FOREIGN_KEY,
			constraint: "transactions_category_kind_fk",
		});
	});

	test("a client cannot write category_kind", async () => {
		expect(await refusal(valid({ category_kind: "income" }))).toMatchObject({
			code: "428C9",
		});
	});
});

describe("backstop constraints (D-467)", () => {
	test.each([
		["0", { amount_minor: 0 }, "transactions_amount_range"],
		["−1", { amount_minor: -1 }, "transactions_amount_range"],
		[
			"1,000,000,000,000",
			{ amount_minor: 1_000_000_000_000 },
			"transactions_amount_range",
		],
		[
			"a time with seconds",
			{ occurred_at: "2026-10-19T16:45:30Z" },
			"transactions_occurred_at_minute",
		],
		["an unknown source", { source: "bank" }, "transactions_source_values"],
		["version 0", { version: 0 }, "transactions_version_positive"],
	])("refuses %s", async (_name, changes, constraint) => {
		expect(await refusal(valid(changes))).toEqual({ code: CHECK, constraint });
	});

	test("accepts the largest amount of any currency, KWD's 999,999,999.999", async () => {
		expect(await refusal(valid({ amount_minor: 999_999_999_999 }))).toBeNull();
		expect(await refusal(valid({ amount_minor: 1 }))).toBeNull();
	});

	// AC-F03-07's database half. Row 26: 2026-10-31T19:00:00Z.
	test("occurred_on must be a date occurred_at has at some offset from −12:00 to +14:00", async () => {
		const at = { occurred_at: "2026-10-31T19:00:00Z" };
		expect(
			await refusal(valid({ ...at, occurred_on: "2026-10-31" })),
		).toBeNull();
		expect(
			await refusal(valid({ ...at, occurred_on: "2026-11-01" })),
		).toBeNull();
		for (const occurred_on of ["2026-11-02", "2026-10-30"]) {
			expect(await refusal(valid({ ...at, occurred_on }))).toEqual({
				code: CHECK,
				constraint: "transactions_occurred_on_fits",
			});
		}
	});

	test("the offset bounds hold at the minute", async () => {
		expect(
			await refusal(
				valid({
					occurred_at: "2026-11-01T11:59:00Z",
					occurred_on: "2026-10-31",
				}),
			),
		).toBeNull();
		expect(
			await refusal(
				valid({
					occurred_at: "2026-11-01T12:00:00Z",
					occurred_on: "2026-10-31",
				}),
			),
		).toMatchObject({
			constraint: "transactions_occurred_on_fits",
		});
		expect(
			await refusal(
				valid({
					occurred_at: "2026-11-01T10:00:00Z",
					occurred_on: "2026-11-02",
				}),
			),
		).toBeNull();
		expect(
			await refusal(
				valid({
					occurred_at: "2026-11-01T09:59:00Z",
					occurred_on: "2026-11-02",
				}),
			),
		).toMatchObject({
			constraint: "transactions_occurred_on_fits",
		});
	});

	describe("text (BR-F03-12)", () => {
		test.each([
			["payee", 80],
			["description", 120],
			["note", 500],
		])("%s accepts %i code points and refuses one more", async (field, max) => {
			expect(await refusal(valid({ [field]: "👍".repeat(max) }))).toBeNull();
			expect(await refusal(valid({ [field]: "👍".repeat(max + 1) }))).toEqual({
				code: CHECK,
				constraint: `transactions_${field}_text`,
			});
		});

		test.each(["payee", "description", "note"])(
			"%s refuses an empty string",
			async (field) => {
				expect(await refusal(valid({ [field]: "" }))).toEqual({
					code: CHECK,
					constraint: `transactions_${field}_text`,
				});
			},
		);

		test.each([
			["a tab", "Swi\tggy"],
			["an escape", "Swi\u001bggy"],
			["delete", "Swi\u007fggy"],
			["a C1 control", "Swi\u0085ggy"],
			["text not in NFC", "Café"],
		])("refuses %s in every text field", async (_name, text) => {
			for (const field of ["payee", "description", "note"]) {
				expect(await refusal(valid({ [field]: text }))).toEqual({
					code: CHECK,
					constraint: `transactions_${field}_text`,
				});
			}
		});

		test("a note keeps line feeds, and nothing else may", async () => {
			expect(await refusal(valid({ note: "Line 1\nLine 2" }))).toBeNull();
			expect(await refusal(valid({ payee: "Line 1\nLine 2" }))).toMatchObject({
				constraint: "transactions_payee_text",
			});
			expect(
				await refusal(valid({ description: "Line 1\nLine 2" })),
			).toMatchObject({
				constraint: "transactions_description_text",
			});
		});

		test("accepts no-break spaces, emoji and text outside the Latin script", async () => {
			expect(await refusal(valid({ payee: "Café 👍 चाय" }))).toBeNull();
		});

		test("description and note may be null; the payee may not", async () => {
			expect(
				await refusal(valid({ description: null, note: null })),
			).toBeNull();
			expect(await refusal(valid({ payee: null }))).toEqual({
				code: NOT_NULL,
				constraint: null,
			});
		});
	});
});

describe("indexes (D-468)", () => {
	test("only the two order indexes exist, besides the primary key", async () => {
		const result = await owner.query<{ indexname: string; indexdef: string }>(
			`SELECT indexname, indexdef FROM pg_indexes
			 WHERE schemaname = 'app' AND tablename = 'transactions' ORDER BY indexname`,
		);
		const indexes = Object.fromEntries(
			result.rows.map((row) => [row.indexname, row.indexdef]),
		);
		expect(Object.keys(indexes)).toEqual([
			"transactions_amount_order_idx",
			"transactions_date_order_idx",
			"transactions_pkey",
		]);
		expect(indexes["transactions_date_order_idx"]).toContain(
			"(user_id, occurred_on, occurred_at, id)",
		);
		expect(indexes["transactions_amount_order_idx"]).toContain(
			"(user_id, amount_minor, occurred_on, occurred_at, id)",
		);
	});

	// D-48: under RLS a trigram index could never serve the runtime role, so 0004 dropped it.
	test("pg_trgm is not installed", async () => {
		const result = await owner.query(
			"SELECT 1 FROM pg_extension WHERE extname = 'pg_trgm'",
		);
		expect(result.rowCount).toBe(0);
	});

	// golden check D: q=swiggy selects #4, #24, #25 and #26 (BR-F03-35).
	test("ILIKE through the search expression finds golden check D", async () => {
		const found = await asUser(async (client) => {
			for (const row of M1_ROWS) await insert(client, rowOf(row, user));
			const result = await client.query<{ id: string }>(
				`SELECT id FROM app.transactions
				 WHERE (coalesce(payee, '') || E'\\x1f' || coalesce(description, '') || E'\\x1f' || coalesce(note, ''))
				 ILIKE '%swiggy%' ORDER BY occurred_on, occurred_at`,
			);
			return result.rows.map((row) => row.id);
		});
		expect(found).toEqual([4, 24, 25, 26].map((n) => goldenRow(n).id));
	});

	test("categories has the (key, kind) key the composite foreign key needs", async () => {
		const result = await owner.query<{ conname: string }>(
			`SELECT conname FROM pg_constraint
			 WHERE conrelid = 'app.categories'::regclass AND contype = 'u' ORDER BY conname`,
		);
		expect(result.rows.map((row) => row.conname)).toContain(
			"categories_key_kind_key",
		);
	});
});

test("deleting the user removes their Transactions without a foreign-key error", async () => {
	const doomed = await createUser(owner, "transactions-delete");
	await owner.query("BEGIN");
	try {
		const row = { ...rowOf(goldenRow(24), doomed, randomUUID()) };
		const columns = Object.keys(row);
		await owner.query(
			`INSERT INTO app.transactions (${columns.join(", ")})
			 VALUES (${columns.map((_, index) => `$${index + 1}`).join(", ")})`,
			Object.values(row),
		);
		await owner.query(`DELETE FROM auth."user" WHERE id = $1`, [doomed]);
		const left = await owner.query<{ count: string }>(
			"SELECT count(*) FROM app.transactions WHERE user_id = $1",
			[doomed],
		);
		expect(Number(left.rows[0]?.count)).toBe(0);
	} finally {
		await owner.query("ROLLBACK");
		await owner.query(`DELETE FROM auth."user" WHERE id = $1`, [doomed]);
	}
});
