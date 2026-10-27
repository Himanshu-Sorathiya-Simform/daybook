import "server-only";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { runtimePool } from "../db/pools";
import * as schema from "../db/schema";
import type { RequestContext } from "./context";

export type Mode = "read" | "write";

/** The transaction a handler or query function receives. It is bound to one connection
 * and one user; it is never kept after `withUser` returns. */
export type Tx = NodePgDatabase<typeof schema>;

/** Reads see one snapshot for the whole response and cannot write; writes use read
 * committed, so a count taken after a lock sees every committed row (BR-P2-09). */
const BEGIN: Record<Mode, string> = {
	read: "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY",
	write: "BEGIN",
};

/** Runs `fn` in one transaction on the runtime pool as `ctx.user` (BR-P2-08):
 *
 * 1. takes a connection from the runtime pool;
 * 2. begins a read or write transaction;
 * 3. sets `app.user_id` for this transaction only, which RLS reads (SEC-2, D-15);
 * 4. limits every statement to 15 seconds;
 * 5. calls `fn` with the transaction;
 * 6. commits;
 * 7. rolls back on any error, and rethrows it;
 * 8. always releases the connection.
 *
 * Every private read and write goes through here (SRV-1). Only `server/dal` and the route
 * wrapper may import it (BR-P2-11). */
export async function withUser<T>(
	ctx: Pick<RequestContext, "user">,
	mode: Mode,
	fn: (tx: Tx) => Promise<T>,
): Promise<T> {
	const client = await runtimePool().connect();
	let broken = false;
	try {
		try {
			await client.query(BEGIN[mode]);
		} catch (error) {
			// A connection that cannot begin is not returned to the pool.
			broken = true;
			throw error;
		}
		try {
			await client.query("SELECT set_config('app.user_id', $1, true)", [
				ctx.user.id,
			]);
			await client.query("SET LOCAL statement_timeout = '15s'");
			const result = await fn(drizzle({ client, schema }));
			await client.query("COMMIT");
			return result;
		} catch (error) {
			// A connection that cannot even roll back is not returned to the pool.
			await client.query("ROLLBACK").catch(() => {
				broken = true;
			});
			throw error;
		}
	} finally {
		client.release(broken);
	}
}
