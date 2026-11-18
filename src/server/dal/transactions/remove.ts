import "server-only";
import { sql } from "drizzle-orm";
import { isUuid } from "@/lib/ids";
import { isDueDate } from "@/lib/subscriptions/schedule";
import type { TransactionDeleteBody } from "@/lib/transactions/schemas";
import { ApiError } from "../../api/errors";
import type { ProfiledContext } from "../context";
import { lockCurrency } from "../currency";
import { lockAndRead, lockSubscriptionRow } from "../subscriptions/lock";
import { writeTombstone } from "../subscriptions/tombstone";
import type { Tx } from "../with-user";
import { versionMismatch } from "./conflict";
import { getTransaction } from "./get";

/** The versioned delete (step 7): whether a row went. */
async function deleteRow(tx: Tx, id: string, version: number): Promise<boolean> {
	const { rows } = await tx.execute(
		sql`DELETE FROM app.transactions WHERE id = ${id}::uuid AND version = ${version}
		RETURNING id`,
	);
	return rows.length > 0;
}

/**
 * The delete of a charge that is already gone (404 otherwise, BR-F03-17, D-239, D-608): the
 * client's cached hint writes the tombstone, so a skip is never lost when an end date removed
 * the charge first and was later moved back. The Subscription is locked, then read (D-605).
 * The tombstone is written, and the delete counts as done, when the Subscription still exists
 * and the date is one of its due dates with no charge on it. A date that already has its
 * tombstone counts as done and writes nothing, whether or not it is still a due date (a schedule
 * change keeps the tombstones on or before its change date). Anything else is 404, which counts
 * as done too.
 */
async function tombstoneForGoneCharge(
	tx: Tx,
	ctx: ProfiledContext,
	hint: { subscriptionId: string; dueOn: string },
): Promise<void> {
	const found = await lockAndRead(tx, ctx, hint.subscriptionId);
	if (!found) throw new ApiError("not_found");
	const { dated } = found;
	if (dated.charged.includes(hint.dueOn)) throw new ApiError("not_found");
	// A tombstone a schedule change kept is still done, whether or not the date is on the schedule.
	if (dated.skipped.includes(hint.dueOn)) return;
	if (!isDueDate(dated, hint.dueOn)) throw new ApiError("not_found");
	await writeTombstone(tx, ctx, hint.subscriptionId, hint.dueOn);
}

/**
 * Deletes one of the user's Transactions at `If-Match` `version`, in section 11's check order
 * (D-487, D-607, D-608):
 * 1. An id that is not a UUID is 404 before any statement (D-479).
 * 2. The profile lock (step 3, BR-F03-05), then an unlocked read of the row, to learn its
 *    Subscription (the handler's first read).
 * 3. A row with no link, or with a link its Subscription no longer holds, is deleted at its
 *    version with no tombstone (BR-F03-17). A linked charge first locks its Subscription
 *    `FOR UPDATE` (step 6), so catch-up and a Subscription change cannot interleave; it is
 *    deleted (7), and its due date is tombstoned (8) in the same transaction.
 * 4. A Subscription deleted meanwhile is found when step 6 locks it: the charge is read again.
 *    Now unlinked, it is deleted without a tombstone; gone too, the delete counts as done.
 * 5. A delete that matches nothing gets 409 with the current row and the locked currency
 *    (D-493), or 404 (BR-F03-25). A row that is missing at the first read gets 404, unless the
 *    body's hint writes its tombstone (see `tombstoneForGoneCharge`).
 */
export async function deleteTransaction(
	tx: Tx,
	ctx: ProfiledContext,
	id: string,
	version: number,
	hint?: TransactionDeleteBody,
): Promise<void> {
	if (!isUuid(id)) throw new ApiError("not_found");
	const currency = await lockCurrency(tx);
	const stored = await getTransaction(tx, id);
	if (!stored) {
		if (hint?.subscriptionId !== undefined && hint.dueOn !== undefined) {
			await tombstoneForGoneCharge(tx, ctx, {
				subscriptionId: hint.subscriptionId,
				dueOn: hint.dueOn,
			});
			return;
		}
		throw new ApiError("not_found");
	}

	const subscriptionId = stored.subscriptionId;
	if (subscriptionId === null || stored.dueOn === null) {
		if (!(await deleteRow(tx, id, version))) {
			throw await versionMismatch(tx, currency, id);
		}
		return;
	}

	if (!(await lockSubscriptionRow(tx, subscriptionId))) {
		// The Subscription went since the read, and took the link with it.
		const again = await getTransaction(tx, id);
		if (!again) return;
		if (!(await deleteRow(tx, id, version))) {
			throw await versionMismatch(tx, currency, id);
		}
		return;
	}
	if (!(await deleteRow(tx, id, version))) {
		throw await versionMismatch(tx, currency, id);
	}
	await writeTombstone(tx, ctx, subscriptionId, stored.dueOn);
}
