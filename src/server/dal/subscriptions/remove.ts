import "server-only";
import { sql } from "drizzle-orm";
import type { Month } from "@/lib/budgets/months";
import { compareCodeUnits } from "@/lib/compare";
import { isUuid } from "@/lib/ids";
import type { SubscriptionDeleted } from "@/lib/subscriptions/answers";
import { changeDateOf } from "@/lib/subscriptions/rules";
import {
	changedAtIssues,
	subscriptionDeleteSchema,
} from "@/lib/subscriptions/schemas";
import { ApiError, fromZodError } from "../../api/errors";
import { safeInt } from "../../db/safe-int";
import type { ProfiledContext } from "../context";
import { lockCurrency } from "../currency";
import type { Tx } from "../with-user";
import { catchUpSubscription, chargeContext } from "./catch-up";
import { lockSubscription } from "./lock";

/**
 * Deletes a Subscription at `If-Match` `version` (F05 section 11, BR-F05-14, BR-F05-34), in this
 * order:
 * 1. An id that is not a UUID is 404 before any statement.
 * 2. The body (`subscriptionDeleteSchema`): `changedAt`, and `undo: "create"` for the undo of an
 *    Add: 422 otherwise.
 * 3. The profile lock (D-213), then `changedAt` inside its window (D-267).
 * 4. The Subscription, locked: 404 without it, 409 at another version. The undo of an Add also
 *    needs version 1, and is 409 with the Subscription as it is when it has been changed since.
 * 5. A delete closes the old period (catch-up through the change date C with the Subscription's
 *    values), then deletes the unedited charges due after C. The undo of an Add makes no charge
 *    and deletes every unedited charge, whatever its date (D-589).
 * 6. The tombstones, then the Subscription. The charges that remain, edited ones included, stay
 *    as ordinary expenses with no link (BR-F05-14).
 * The answer counts the charges created, kept as unlinked expenses, and deleted, with their
 * months. A delete has no Undo (D-590).
 */
export async function deleteSubscription(
	tx: Tx,
	ctx: ProfiledContext,
	id: string,
	version: number,
	input: unknown,
): Promise<SubscriptionDeleted> {
	if (!isUuid(id)) throw new ApiError("not_found");
	const parsed = subscriptionDeleteSchema.safeParse(input);
	if (!parsed.success) throw fromZodError(parsed.error);
	const body = parsed.data;

	const currency = await lockCurrency(tx);
	const issues = changedAtIssues(body.changedAt, ctx.now);
	if (issues.length > 0) {
		throw new ApiError("validation_failed", {
			fields: { changedAt: (issues[0] as { message: string }).message },
		});
	}
	const { dated: stored, item } = await lockSubscription(
		tx,
		ctx,
		id,
		version,
		currency,
	);
	const undoCreate = body.undo === "create";
	if (undoCreate && stored.version !== 1) {
		throw new ApiError("version_conflict", {
			details: { current: { ...item, currency } },
		});
	}

	const changeDate = changeDateOf({
		changedAt: body.changedAt,
		lastChangeOn: stored.lastChangeOn,
		timezone: ctx.profile.timezone,
		now: ctx.now,
	});
	const months = new Set<Month>();
	let chargesCreated = 0;
	if (!undoCreate) {
		const closed = await catchUpSubscription(tx, chargeContext(ctx), stored, {
			through: changeDate,
			skipped: stored.skipped,
		});
		chargesCreated = closed.created;
		for (const month of closed.months) months.add(month);
	}

	const { rows: deleted } = await tx.execute<{ month: Month }>(
		undoCreate ?
			sql`DELETE FROM app.transactions
			WHERE subscription_id = ${id}::uuid AND NOT edited
			RETURNING to_char(occurred_on, 'YYYY-MM') AS month`
		:	sql`DELETE FROM app.transactions
			WHERE subscription_id = ${id}::uuid AND due_on > ${changeDate}::date AND NOT edited
			RETURNING to_char(occurred_on, 'YYYY-MM') AS month`,
	);
	for (const row of deleted) months.add(row.month);

	const {
		rows: [kept],
	} = await tx.execute<{ kept: string }>(
		sql`SELECT count(*)::text AS kept FROM app.transactions
		WHERE subscription_id = ${id}::uuid`,
	);
	await tx.execute(
		sql`DELETE FROM app.subscription_skips WHERE subscription_id = ${id}::uuid`,
	);
	// The remaining charges unlink through the composite key (ON DELETE SET NULL).
	await tx.execute(sql`DELETE FROM app.subscriptions WHERE id = ${id}::uuid`);

	return {
		changeDate,
		chargesCreated,
		chargesKept: safeInt((kept as { kept: string }).kept),
		chargesDeleted: deleted.length,
		months: [...months].sort(compareCodeUnits),
	};
}
