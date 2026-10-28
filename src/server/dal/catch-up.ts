import "server-only";
import { sql } from "drizzle-orm";
import { todayIn } from "@/lib/time";
import { describeError } from "../api/errors";
import type { Timing } from "../api/timing";
import { resetDailyPassNote } from "../system/daily-pass";
import type { RequestContext } from "./context";
import { type Tx, withUser } from "./with-user";

/** What a catch-up step knows: the user, the request clock, and today in the profile's zone,
 * which the check has just recorded as `last_catch_up_on`. */
export type CatchUpRun = {
	user: RequestContext["user"];
	now: Date;
	today: string;
	timezone: string;
};

/** One catch-up task. It runs in the check's transaction, so its writes commit with the new
 * `last_catch_up_on` or not at all. */
export type CatchUpStep = (tx: Tx, run: CatchUpRun) => Promise<void>;

/** The catch-up tasks, in order. Subscription catch-up (JOB-2, F05) joins this list when F05
 * is built. */
export const CATCH_UP_STEPS: CatchUpStep[] = [];

type Note = { timezone: string; lastCatchUpOn: string };

// Per process: each user's timezone and `last_catch_up_on`, as last read from the database.
const notes = new Map<string, Note>();

/** Records what the database says, so later requests today skip the check (BR-P2-14). The
 * wrapper calls it with the profile it read in step 11. */
export function noteCatchUp(userId: string, note: Note): void {
	notes.set(userId, {
		timezone: note.timezone,
		lastCatchUpOn: note.lastCatchUpOn,
	});
}

/** Forgets one user's note. A profile `PATCH` (a new timezone) and Reset my data call it. */
export function clearCatchUpNote(userId: string): void {
	notes.delete(userId);
}

/** Forgets every note, and the daily pass's note. For tests (BR-P2-14). */
export function resetCatchUpNote(): void {
	notes.clear();
	resetDailyPassNote();
}

/** Whether the note says today's catch-up is done: today in the note's zone, from `now`, is
 * on or before its `lastCatchUpOn`. With no note, the check must run. */
export function catchUpDone(userId: string, now: Date): boolean {
	const note = notes.get(userId);
	return note !== undefined && todayIn(note.timezone, now) <= note.lastCatchUpOn;
}

/** The lazy catch-up check (BR-P2-14, JOB-1, D-207). Unless the note says it is done, one
 * short write transaction as the user raises `last_catch_up_on` to today in the profile's
 * zone, computed inside the statement from `now`, so nothing is read first.
 *
 * - **A row back:** catch-up was due; every step runs in the same transaction. Two requests
 *   at once both try; the second waits on the row, then matches nothing.
 * - **No row:** done already today, or no profile yet. The wrapper notes the profile it reads.
 * - **`version` and `updated_at`:** never touched; this is bookkeeping, not an edit.
 * - **A failure:** rolls back and is logged; the request goes on, and the next one retries.
 *
 * It commits before the request's own transaction opens, so the response sees its writes. */
export async function runCatchUpIfDue(
	user: RequestContext["user"],
	now: Date,
	{ timing }: { timing?: Timing } = {},
): Promise<void> {
	if (catchUpDone(user.id, now)) return;
	try {
		const row = await withUser(
			{ user },
			"write",
			async (tx) => {
				const result = await tx.execute<{
					timezone: string;
					last_catch_up_on: string;
				}>(
					sql`UPDATE app.profile
						SET last_catch_up_on = (${now.toISOString()}::timestamptz AT TIME ZONE timezone)::date
						WHERE user_id = ${user.id}
							AND last_catch_up_on < (${now.toISOString()}::timestamptz AT TIME ZONE timezone)::date
						RETURNING timezone, last_catch_up_on::text AS last_catch_up_on`,
				);
				const updated = result.rows[0];
				if (!updated) return null;
				const run: CatchUpRun = {
					user,
					now,
					today: updated.last_catch_up_on,
					timezone: updated.timezone,
				};
				for (const step of CATCH_UP_STEPS) await step(tx, run);
				return updated;
			},
			timing ? { timing } : {},
		);
		if (row)
			noteCatchUp(user.id, {
				timezone: row.timezone,
				lastCatchUpOn: row.last_catch_up_on,
			});
	} catch (error) {
		console.error("[catch-up] Failed", describeError(error));
	}
}
