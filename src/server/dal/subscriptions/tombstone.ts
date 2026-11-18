import "server-only";
import { sql } from "drizzle-orm";
import { uuidV7 } from "@/lib/ids";
import type { ProfiledContext } from "../context";
import type { Tx } from "../with-user";

/**
 * Writes the tombstone of `dueOn` for a Subscription the caller has locked (BR-F05-07,
 * BR-F05-26, D-93), and raises the Subscription's version and `updated_at`, not
 * `lastChangeOn`, since the tombstone is part of the item the client holds (D-596, D-607).
 * A date that already has its tombstone writes nothing and raises nothing. Returns whether a
 * tombstone was written.
 */
export async function writeTombstone(
	tx: Tx,
	ctx: ProfiledContext,
	subscriptionId: string,
	dueOn: string,
): Promise<boolean> {
	const now = ctx.now.toISOString();
	const { rows } = await tx.execute<{ id: string }>(
		sql`INSERT INTO app.subscription_skips (id, user_id, created_at, updated_at,
			subscription_id, due_on)
		VALUES (${uuidV7(ctx.now.getTime())}, ${ctx.user.id}, ${now}, ${now},
			${subscriptionId}::uuid, ${dueOn}::date)
		ON CONFLICT DO NOTHING
		RETURNING id`,
	);
	if (rows.length === 0) return false;
	await tx.execute(
		sql`UPDATE app.subscriptions SET version = version + 1, updated_at = ${now}
		WHERE id = ${subscriptionId}::uuid`,
	);
	return true;
}
