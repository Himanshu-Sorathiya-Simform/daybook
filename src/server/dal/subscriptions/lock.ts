import "server-only";
import { sql } from "drizzle-orm";
import type { CurrencyCode } from "@/lib/currency";
import { ApiError } from "../../api/errors";
import type { ProfiledContext } from "../context";
import type { Tx } from "../with-user";
import { readItems } from "./read";
import { byId, type ReadItem } from "./row";

/**
 * Locks one Subscription for a change, a delete or a skip (BR-F05-08 step 1, SRV-7) and reads
 * it: 404 when the user has none (RLS hides other users'), 409 `version_conflict` with the
 * Subscription and the currency in `details.current` when it is at another version (BR-P2-21).
 * The caller has taken the profile lock first.
 *
 * The lock and the read are two statements on purpose. A read that locks as it goes would show
 * the charges and tombstones as they were when it started, and miss those a writer committed
 * while this one waited for the lock. Read after the lock, the Subscription is seen as the
 * writers before it left it.
 */
export async function lockSubscription(
	tx: Tx,
	ctx: ProfiledContext,
	id: string,
	version: number,
	currency: CurrencyCode,
): Promise<ReadItem> {
	const { rows } = await tx.execute<{ id: string }>(
		sql`SELECT id FROM app.subscriptions WHERE id = ${id}::uuid FOR UPDATE`,
	);
	if (rows.length === 0) throw new ApiError("not_found");
	const [read] = await readItems(tx, ctx, byId(id));
	// The row is locked, so it cannot have gone.
	if (!read) throw new ApiError("not_found");
	if (read.item.version !== version) {
		throw new ApiError("version_conflict", {
			details: { current: { ...read.item, currency } },
		});
	}
	return read;
}

/**
 * Locks one Subscription by id for a charge delete (BR-F03-17 step 1, SRV-7) and answers
 * whether the user has it. The profile lock is the caller's. Nothing is read: the delete needs
 * only to know that the Subscription cannot change or go until it commits.
 */
export async function lockSubscriptionRow(tx: Tx, id: string): Promise<boolean> {
	const { rows } = await tx.execute<{ id: string }>(
		sql`SELECT id FROM app.subscriptions WHERE id = ${id}::uuid FOR UPDATE`,
	);
	return rows.length > 0;
}

/** `lockSubscriptionRow`, then the Subscription with its charges and tombstones in a second
 * statement (D-605); `null` when the user has none. */
export async function lockAndRead(
	tx: Tx,
	ctx: ProfiledContext,
	id: string,
): Promise<ReadItem | null> {
	if (!(await lockSubscriptionRow(tx, id))) return null;
	const [read] = await readItems(tx, ctx, byId(id));
	return read ?? null;
}
