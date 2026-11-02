import { Client, DatabaseError, Pool, type PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { parseOwnerEnv, parseServerEnv } from "../../env";
import {
	createUser,
	insertRow,
	PRIVATE_ROWS,
	PRIVATE_TABLES,
	type PrivateTable,
} from "./private-rows";

/** The isolation suite (TST-1, AC-P2-01 to AC-P2-04, AC-P2-06). Users A, B and C are created
 * as the owner; A and B get a row in every private table. Every check runs as the role the
 * check is about, with the user context set the way the data access layer sets it: inside a
 * transaction, with `set_config(..., true)` (BR-P2-08). */

const AUTH_TABLES = ["user", "session", "account", "verification"];
const INSUFFICIENT_PRIVILEGE = "42501";

let owner: Client;
let runtime: Pool;
let system: Pool;
let auth: Pool;
let a: string;
let b: string;
let c: string;

beforeAll(async () => {
	const server = parseServerEnv(process.env);
	owner = new Client({
		connectionString: parseOwnerEnv(process.env).DATABASE_URL_OWNER,
	});
	await owner.connect();
	// One connection per pool, so a test can prove what a reused connection remembers.
	runtime = new Pool({ connectionString: server.DATABASE_URL_RUNTIME, max: 1 });
	system = new Pool({ connectionString: server.DATABASE_URL_SYSTEM, max: 1 });
	auth = new Pool({ connectionString: server.DATABASE_URL_AUTH, max: 1 });
	a = await createUser(owner, "isolation-a");
	b = await createUser(owner, "isolation-b");
	c = await createUser(owner, "isolation-c");
	for (const table of PRIVATE_TABLES) {
		await insertRow(owner, table, PRIVATE_ROWS[table](a));
		await insertRow(owner, table, PRIVATE_ROWS[table](b));
	}
});

afterAll(async () => {
	// Deleting the users removes their rows in every private table (P2, 7.6).
	await owner?.query(`DELETE FROM auth."user" WHERE id = ANY($1)`, [[a, b, c]]);
	await Promise.all([owner?.end(), runtime?.end(), system?.end(), auth?.end()]);
});

/** Runs `fn` in one transaction on `pool`, as `userId` when given, then rolls back, so no
 * test changes the fixtures. Errors from `fn` propagate after the rollback. */
async function as<T>(
	pool: Pool,
	userId: string | null,
	fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
	const client = await pool.connect();
	try {
		await client.query("BEGIN");
		if (userId !== null) {
			await client.query("SELECT set_config('app.user_id', $1, true)", [
				userId,
			]);
		}
		return await fn(client);
	} finally {
		await client.query("ROLLBACK").catch(() => {});
		client.release();
	}
}

/** The SQLSTATE `promise` fails with, or null if it succeeds. */
async function sqlState(promise: Promise<unknown>): Promise<string | null> {
	try {
		await promise;
		return null;
	} catch (error) {
		if (error instanceof DatabaseError) return error.code ?? null;
		throw error;
	}
}

const ownerCount = async (table: PrivateTable, userId: string) =>
	(
		await owner.query<{ n: number }>(
			`SELECT count(*)::int AS n FROM app.${table} WHERE user_id = $1`,
			[userId],
		)
	).rows[0]!.n;

describe.each(PRIVATE_TABLES)("app.%s, as the runtime role", (table) => {
	// AC-P2-01
	test("user A reads only A's rows", async () => {
		const rows = await as(runtime, a, (client) =>
			client.query<{ user_id: string }>(`SELECT user_id FROM app.${table}`),
		);
		expect(rows.rows.map((r) => r.user_id)).toEqual([a]);
	});

	// AC-P2-01
	test("user A cannot find B's rows even by asking for them", async () => {
		const rows = await as(runtime, a, (client) =>
			client.query(`SELECT 1 FROM app.${table} WHERE user_id = $1`, [b]),
		);
		expect(rows.rowCount).toBe(0);
	});

	// AC-P2-01
	test("user A's update of B's rows changes nothing", async () => {
		const result = await as(runtime, a, (client) =>
			client.query(
				`UPDATE app.${table} SET updated_at = updated_at WHERE user_id = $1`,
				[b],
			),
		);
		expect(result.rowCount).toBe(0);
	});

	// AC-P2-01
	test("user A's delete of B's rows removes nothing", async () => {
		const result = await as(runtime, a, (client) =>
			client.query(`DELETE FROM app.${table} WHERE user_id = $1`, [b]),
		);
		expect(result.rowCount).toBe(0);
		expect(await ownerCount(table, b)).toBe(1);
	});

	test("user A cannot insert a row that belongs to another user", async () => {
		const state = await sqlState(
			as(runtime, a, (client) =>
				insertRow(client, table, PRIVATE_ROWS[table](c)),
			),
		);
		expect(state).toBe(INSUFFICIENT_PRIVILEGE);
	});

	// BR-P2-20, T2: a create with an id that is another user's never reaches the row. With
	// ON CONFLICT (id) DO NOTHING it inserts nothing and raises nothing, so the route can read
	// the id under RLS, find nothing and answer 409 id_conflict, without learning that it exists.
	test("user A's insert with B's id and ON CONFLICT DO NOTHING returns nothing and leaves B's row alone", async () => {
		const {
			rows: [theirs],
		} = await owner.query(`SELECT * FROM app.${table} WHERE user_id = $1`, [b]);
		const mine = { ...PRIVATE_ROWS[table](a), id: theirs.id };
		const columns = Object.keys(mine);
		const result = await as(runtime, a, (client) =>
			client.query(
				`INSERT INTO app.${table} (${columns.join(", ")})
				 VALUES (${columns.map((_, i) => `$${i + 1}`).join(", ")})
				 ON CONFLICT (id) DO NOTHING RETURNING id`,
				Object.values(mine),
			),
		);
		expect(result.rowCount).toBe(0);
		const {
			rows: [after],
		} = await owner.query(`SELECT * FROM app.${table} WHERE id = $1`, [
			theirs.id,
		]);
		expect(after).toEqual(theirs);
		expect(await ownerCount(table, a)).toBe(1);
		expect(await ownerCount(table, b)).toBe(1);
	});

	test("the same insert with ON CONFLICT DO UPDATE changes nothing of B's, whatever it sets", async () => {
		const {
			rows: [theirs],
		} = await owner.query(`SELECT * FROM app.${table} WHERE user_id = $1`, [b]);
		const mine = { ...PRIVATE_ROWS[table](a), id: theirs.id };
		const columns = Object.keys(mine);
		const state = await sqlState(
			as(runtime, a, (client) =>
				client.query(
					`INSERT INTO app.${table} (${columns.join(", ")})
					 VALUES (${columns.map((_, i) => `$${i + 1}`).join(", ")})
					 ON CONFLICT (id) DO UPDATE SET updated_at = now() RETURNING id`,
					Object.values(mine),
				),
			),
		);
		// RLS refuses the update of a row A cannot see: an error, never a quiet change.
		expect(state).toBe(INSUFFICIENT_PRIVILEGE);
		const {
			rows: [after],
		} = await owner.query(`SELECT * FROM app.${table} WHERE id = $1`, [
			theirs.id,
		]);
		expect(after).toEqual(theirs);
	});

	test("user A cannot hand its own row to another user", async () => {
		const state = await sqlState(
			as(runtime, a, (client) =>
				client.query(
					`UPDATE app.${table} SET user_id = $1 WHERE user_id = $2`,
					[c, a],
				),
			),
		);
		expect(state).toBe(INSUFFICIENT_PRIVILEGE);
	});

	test("user A can still read, change and remove its own rows", async () => {
		const [updated, deleted] = await as(runtime, a, async (client) => [
			await client.query(`UPDATE app.${table} SET updated_at = updated_at`),
			await client.query(`DELETE FROM app.${table}`),
		]);
		expect(updated.rowCount).toBe(1);
		expect(deleted.rowCount).toBe(1);
	});

	// AC-P2-02
	test("with no user context, the table looks empty", async () => {
		const rows = await as(runtime, null, (client) =>
			client.query(`SELECT 1 FROM app.${table}`),
		);
		expect(rows.rowCount).toBe(0);
	});

	// AC-P2-02
	test("with an empty user context, the table looks empty", async () => {
		const rows = await as(runtime, "", (client) =>
			client.query(`SELECT 1 FROM app.${table}`),
		);
		expect(rows.rowCount).toBe(0);
	});

	test("with no user context, nothing can be written", async () => {
		const state = await sqlState(
			as(runtime, null, (client) =>
				insertRow(client, table, PRIVATE_ROWS[table](a)),
			),
		);
		expect(state).toBe(INSUFFICIENT_PRIVILEGE);
	});
});

describe.each(PRIVATE_TABLES)("app.%s, as the system role", (table) => {
	// AC-P2-03
	test("reads and writes both users' rows through system_access", async () => {
		const [read, updated] = await as(system, null, async (client) => [
			await client.query(
				`SELECT 1 FROM app.${table} WHERE user_id = ANY($1)`,
				[[a, b]],
			),
			await client.query(
				`UPDATE app.${table} SET updated_at = updated_at WHERE user_id = ANY($1)`,
				[[a, b]],
			),
		]);
		expect(read.rowCount).toBe(2);
		expect(updated.rowCount).toBe(2);
	});
});

describe("the user context belongs to one transaction (BR-P2-08)", () => {
	// AC-P2-04
	test("a connection whose transaction set A's context and failed serves the next query with no context", async () => {
		const state = await sqlState(
			as(runtime, a, (client) => client.query("SELECT 1 / 0")),
		);
		expect(state).toBe("22012");
		const rows = await as(runtime, null, (client) =>
			client.query("SELECT 1 FROM app.profile"),
		);
		expect(rows.rowCount).toBe(0);
	});

	test("a committed transaction's context does not reach the next transaction", async () => {
		const client = await runtime.connect();
		try {
			await client.query("BEGIN");
			await client.query("SELECT set_config('app.user_id', $1, true)", [a]);
			await client.query("COMMIT");
			const rows = await client.query("SELECT 1 FROM app.profile");
			expect(rows.rowCount).toBe(0);
		} finally {
			client.release();
		}
	});
});

describe("schemas and reference data (AC-P2-03, TST-1)", () => {
	test.each(AUTH_TABLES)("the runtime role is denied auth.%s", async (table) => {
		expect(
			await sqlState(
				as(runtime, a, (client) =>
					client.query(`SELECT 1 FROM auth."${table}"`),
				),
			),
		).toBe(INSUFFICIENT_PRIVILEGE);
	});

	test.each(AUTH_TABLES)("the system role is denied auth.%s", async (table) => {
		expect(
			await sqlState(
				as(system, null, (client) =>
					client.query(`SELECT 1 FROM auth."${table}"`),
				),
			),
		).toBe(INSUFFICIENT_PRIVILEGE);
	});

	test.each(PRIVATE_TABLES)("the auth role is denied app.%s", async (table) => {
		expect(
			await sqlState(
				as(auth, null, (client) =>
					client.query(`SELECT 1 FROM app.${table}`),
				),
			),
		).toBe(INSUFFICIENT_PRIVILEGE);
	});

	test("the auth role reads its own tables", async () => {
		const rows = await as(auth, null, (client) =>
			client.query(`SELECT 1 FROM auth."user" WHERE id = $1`, [a]),
		);
		expect(rows.rowCount).toBe(1);
	});

	// SEC-3
	test("the runtime role reads the reference data", async () => {
		const counts = await as(runtime, a, (client) =>
			client.query<{ currencies: number; categories: number }>(
				`SELECT (SELECT count(*)::int FROM app.currencies) AS currencies,
				        (SELECT count(*)::int FROM app.categories) AS categories`,
			),
		);
		expect(counts.rows[0]).toEqual({ currencies: 6, categories: 20 });
	});

	// SEC-3
	test.each([
		[
			"insert into",
			"INSERT INTO app.currencies (code, exponent) VALUES ('AAA', 2)",
		],
		["update", "UPDATE app.currencies SET exponent = 3 WHERE code = 'INR'"],
		["delete from", "DELETE FROM app.categories WHERE key = 'food'"],
	])("the runtime role cannot %s reference data", async (_label, statement) => {
		expect(
			await sqlState(as(runtime, a, (client) => client.query(statement))),
		).toBe(INSUFFICIENT_PRIVILEGE);
	});

	test("the runtime role cannot see Drizzle's migration log", async () => {
		expect(
			await sqlState(
				as(runtime, a, (client) =>
					client.query("SELECT 1 FROM drizzle.__drizzle_migrations"),
				),
			),
		).toBe(INSUFFICIENT_PRIVILEGE);
	});
});

describe("deleting a user (P2, 7.6)", () => {
	// AC-P2-06
	test("removes the user's rows in every private table, with no foreign-key error", async () => {
		const d = await createUser(owner, "isolation-d");
		for (const table of PRIVATE_TABLES)
			await insertRow(owner, table, PRIVATE_ROWS[table](d));
		await owner.query(`DELETE FROM auth."user" WHERE id = $1`, [d]);
		for (const table of PRIVATE_TABLES)
			expect(await ownerCount(table, d)).toBe(0);
	});
});
