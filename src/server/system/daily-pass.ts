import "server-only";
import type { PoolClient } from "pg";
import { utcDate } from "@/lib/time";
import { describeError } from "../api/errors";
import { type Timing, timeQueries } from "../api/timing";
import { systemPool } from "../db/pools";

/** One task of the daily pass. It runs inside the pass's system transaction, so its writes
 * commit with the day's marker or not at all. */
export type DailyPassStep = (
	client: PoolClient,
	now: Date,
) => Promise<{ pricesUpdated?: boolean } | void>;

const DAY_MS = 24 * 60 * 60 * 1000;

/** Deletes idempotency records older than 90 days, for every user (BR-P2-27, D-180). It acts
 * across users because the records of a user who never returns must still expire; the system
 * role reaches them through `system_access`. */
export const purgeIdempotencyRecords: DailyPassStep = async (client, now) => {
	await client.query("DELETE FROM app.idempotency_records WHERE created_at < $1", [
		new Date(now.getTime() - 90 * DAY_MS),
	]);
};

/** The pass's tasks, in order. Price catch-up (JOB-3, F07) and the processed Stripe event
 * purge (F12) join this list when those features are built (D-437). */
export const DAILY_PASS_STEPS: DailyPassStep[] = [purgeIdempotencyRecords];

/** After a failure, the process waits this long before trying again (BR-P2-27). */
const RETRY_AFTER_MS = 60 * 1000;

// Per process: the UTC day the pass is known to be done, and when it last failed.
const note: { doneOn: string | null; failedAt: number | null } = {
	doneOn: null,
	failedAt: null,
};

/** Forgets the process's note, so the next request checks again. Tests call it through
 * `resetCatchUpNote()` (BR-P2-14). */
export function resetDailyPassNote(): void {
	note.doneOn = null;
	note.failedAt = null;
}

/** The global daily pass (BR-P2-27, D-292), once per UTC day of `now`, from the route wrapper
 * and `readAsUser` on any request. It acts across users, so it runs on the system pool.
 *
 * - **Skipped:** while the note says today's pass is done, and for a minute after a failure.
 * - **The pass:** one transaction inserts the day's marker. A row back means this process
 *   won the day, and the same transaction runs every step. No row means another process has
 *   done it; a concurrent insert waits for that transaction and sees its outcome.
 * - **A failure:** rolls everything back, marker included, is logged, and never fails the
 *   request.
 *
 * Returns whether this run wrote prices, for `ctx.pricesUpdated` (F05, BR-F05-06). */
export async function runDailyPassIfDue(
	now: Date,
	{ timing }: { timing?: Timing } = {},
): Promise<{ pricesUpdated: boolean }> {
	const day = utcDate(now);
	if (note.doneOn === day) return { pricesUpdated: false };
	if (note.failedAt !== null && now.getTime() - note.failedAt < RETRY_AFTER_MS) {
		return { pricesUpdated: false };
	}
	try {
		const result = await runDailyPass(day, now, timing);
		note.doneOn = day;
		note.failedAt = null;
		return result;
	} catch (error) {
		note.failedAt = now.getTime();
		console.error("[daily-pass] Failed", describeError(error));
		return { pricesUpdated: false };
	}
}

async function runDailyPass(
	day: string,
	now: Date,
	timing: Timing | undefined,
): Promise<{ pricesUpdated: boolean }> {
	const client = await systemPool().connect();
	const restore = timing ? timeQueries(client, timing) : () => {};
	let broken = false;
	try {
		try {
			// One round trip: a statement list with no parameters may hold both (D-439).
			await client.query("BEGIN; SET LOCAL statement_timeout = '15s'");
		} catch (error) {
			// A connection that cannot begin is not returned to the pool.
			broken = true;
			throw error;
		}
		try {
			const marker = await client.query(
				`INSERT INTO app.daily_pass_markers (day, created_at) VALUES ($1, $2)
				ON CONFLICT (day) DO NOTHING RETURNING day`,
				[day, now],
			);
			let pricesUpdated = false;
			if (marker.rowCount === 1) {
				for (const step of DAILY_PASS_STEPS) {
					const outcome = await step(client, now);
					if (outcome?.pricesUpdated) pricesUpdated = true;
				}
			}
			await client.query("COMMIT");
			return { pricesUpdated };
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
