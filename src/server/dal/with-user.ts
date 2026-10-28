import "server-only";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { type Timing, timeQueries } from "../api/timing";
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
 * 4. limits every statement to 15 seconds, in the same statement as step 3 (D-439);
 * 5. calls `fn` with the transaction;
 * 6. commits;
 * 7. rolls back on any error, and rethrows it;
 * 8. always releases the connection.
 *
 * Every private read and write goes through here (SRV-1). Only `server/dal` and the route
 * wrapper may import it (BR-P2-11). With a `timing`, every query, `BEGIN` and `COMMIT`
 * included, adds to its `db;dur` (D-436). */
export async function withUser<T>(
	ctx: Pick<RequestContext, "user">,
	mode: Mode,
	fn: (tx: Tx) => Promise<T>,
	{ timing }: { timing?: Timing } = {},
): Promise<T> {
	const client = await runtimePool().connect();
	const restore = timing ? timeQueries(client, timing) : () => {};
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
			// Steps 3 and 4 in one round trip (D-439). `set_config(..., true)` is `SET LOCAL`, so
			// both end with the transaction; the user id stays a bound parameter.
			await client.query(
				"SELECT set_config('app.user_id', $1, true), set_config('statement_timeout', '15s', true)",
				[ctx.user.id],
			);
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
		restore();
		client.release(broken);
	}
}
