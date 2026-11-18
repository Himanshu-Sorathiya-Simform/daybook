import { type Client, DatabaseError, Pool, type PoolClient } from "pg";

import { parseServerEnv } from "../../env";

/** The pieces the table tests share: the runtime role's pool, a transaction as one user that
 * always rolls back, and what a refused statement answers. */

/** A row as a test writes it: column names and their values. */
export type Row = Record<string, string | number | boolean | null>;

/** A pool of the runtime role, which RLS binds, for the statements a test makes as a user. */
export function openRuntime(): Pool {
	return new Pool({
		connectionString: parseServerEnv(process.env).DATABASE_URL_RUNTIME,
		max: 2,
	});
}

/** Runs `fn` in a transaction with the user context set to `userId`, as the data access layer
 * sets it, and rolls back whatever it did. */
export async function rolledBack<T>(
	runtime: Pool,
	userId: string,
	fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
	const client = await runtime.connect();
	try {
		await client.query("BEGIN");
		await client.query("SELECT set_config('app.user_id', $1, true)", [userId]);
		return await fn(client);
	} finally {
		await client.query("ROLLBACK").catch(() => {});
		client.release();
	}
}

/** The SQLSTATE and the constraint of a refusal, or `null` for a statement that went through. */
export type Refusal = { code: string; constraint: string | null } | null;

/** What `promise` ends with: `null`, or the code and constraint of the database error that
 * refused it. Any other error is the test's own and is thrown. */
export async function failure(promise: Promise<unknown>): Promise<Refusal> {
	try {
		await promise;
		return null;
	} catch (error) {
		if (!(error instanceof DatabaseError)) throw error;
		return { code: error.code ?? "", constraint: error.constraint ?? null };
	}
}

/** The definition of each index of `app.<table>`, by name. */
export async function indexesOf(
	owner: Client,
	table: string,
): Promise<Record<string, string>> {
	const result = await owner.query<{ indexname: string; indexdef: string }>(
		`SELECT indexname, indexdef FROM pg_indexes
		 WHERE schemaname = 'app' AND tablename = $1 ORDER BY indexname`,
		[table],
	);
	return Object.fromEntries(
		result.rows.map((row) => [row.indexname, row.indexdef]),
	);
}
