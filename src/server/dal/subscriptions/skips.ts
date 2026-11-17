import "server-only";
import { sql } from "drizzle-orm";
import { isUuid, uuidV7 } from "@/lib/ids";
import { isIsoDate } from "@/lib/time";
import { SUBSCRIPTION_MESSAGES as M } from "@/lib/subscriptions/messages";
import type { SubscriptionItem } from "@/lib/subscriptions/answers";
import { changeDateOf, skipIssue, unskipIssue } from "@/lib/subscriptions/rules";
import {
	changedAtIssues,
	subscriptionSkipSchema,
	subscriptionUnskipSchema,
} from "@/lib/subscriptions/schemas";
import { ApiError, fromZodError } from "../../api/errors";
import type { ProfiledContext } from "../context";
import { lockCurrency } from "../currency";
import type { Tx } from "../with-user";
import { catchUpSubscription, chargeContext } from "./catch-up";
import { lockSubscription } from "./lock";
import { getSubscriptionItem } from "./read";

/** Raises 422 on `field` when `changedAt` is outside its window (D-267). */
function checkChangedAt(changedAt: string, now: Date): void {
	const [issue] = changedAtIssues(changedAt, now);
	if (issue) {
		throw new ApiError("validation_failed", {
			fields: { changedAt: issue.message },
		});
	}
}

/** Raises the version and `updated_at` of a Subscription, leaving `lastChangeOn` alone (D-596). */
async function bump(tx: Tx, ctx: ProfiledContext, id: string): Promise<void> {
	await tx.execute(
		sql`UPDATE app.subscriptions SET version = version + 1, updated_at = ${ctx.now.toISOString()}
		WHERE id = ${id}::uuid`,
	);
}

async function answer(
	tx: Tx,
	ctx: ProfiledContext,
	id: string,
): Promise<SubscriptionItem> {
	const item = await getSubscriptionItem(tx, ctx, id);
	// The row is locked by this transaction.
	if (!item) throw new ApiError("not_found");
	return item;
}

/**
 * Skips one upcoming charge (`POST /api/subscriptions/[id]/skips`, BR-F05-26, D-596) at
 * `If-Match` `version`, in this order:
 * 1. A malformed id is 404 before any statement; the body (`subscriptionSkipSchema`) is 422.
 * 2. The profile lock, then `changedAt` inside its window.
 * 3. The Subscription, locked: 404, or 409 at another version.
 * 4. A date that is already skipped answers the Subscription unchanged: no version, no write.
 * 5. `dueOn` must be a chargeable due date after the change date C: 422 "Only an upcoming charge
 *    can be skipped." An edited charge on it makes it 422 "This charge was edited, so it stays."
 * 6. An unedited charge on it, made by another device before this synced, is deleted; the
 *    tombstone is written; the version rises and `lastChangeOn` stays.
 */
export async function skipCharge(
	tx: Tx,
	ctx: ProfiledContext,
	id: string,
	version: number,
	input: unknown,
): Promise<SubscriptionItem> {
	if (!isUuid(id)) throw new ApiError("not_found");
	const parsed = subscriptionSkipSchema.safeParse(input);
	if (!parsed.success) throw fromZodError(parsed.error);
	const body = parsed.data;

	const currency = await lockCurrency(tx);
	checkChangedAt(body.changedAt, ctx.now);
	const { dated: stored, item } = await lockSubscription(
		tx,
		ctx,
		id,
		version,
		currency,
	);
	if (stored.skipped.includes(body.dueOn)) return item;

	const changeDate = changeDateOf({
		changedAt: body.changedAt,
		lastChangeOn: stored.lastChangeOn,
		timezone: ctx.profile.timezone,
		now: ctx.now,
	});
	const refused = skipIssue(stored, body.dueOn, changeDate);
	if (refused) {
		throw new ApiError("validation_failed", { fields: { dueOn: refused } });
	}
	const { rows: there } = await tx.execute<{ id: string; edited: boolean }>(
		sql`SELECT id, edited FROM app.transactions
		WHERE subscription_id = ${id}::uuid AND due_on = ${body.dueOn}::date`,
	);
	const [charge] = there;
	if (charge?.edited) {
		throw new ApiError("validation_failed", {
			fields: { dueOn: M.skipEdited },
		});
	}
	if (charge) {
		await tx.execute(
			sql`DELETE FROM app.transactions WHERE id = ${charge.id}::uuid`,
		);
	}
	const now = ctx.now.toISOString();
	await tx.execute(
		sql`INSERT INTO app.subscription_skips (id, user_id, created_at, updated_at,
			subscription_id, due_on)
		VALUES (${uuidV7(ctx.now.getTime())}, ${ctx.user.id}, ${now}, ${now}, ${id}::uuid,
			${body.dueOn}::date)`,
	);
	await bump(tx, ctx, id);
	return answer(tx, ctx, id);
}

/**
 * Brings a skipped charge back (`DELETE /api/subscriptions/[id]/skips/[dueOn]`, BR-F05-27,
 * D-596) at `If-Match` `version`, in this order:
 * 1. A malformed id or date is 404 before any statement; the body (`subscriptionUnskipSchema`)
 *    is 422.
 * 2. The profile lock, `changedAt` inside its window, the Subscription locked (404, 409).
 * 3. A date with no tombstone answers the Subscription unchanged.
 * 4. A date on or before the change date C is 422 "This charge date has passed, so it can't be
 *    brought back."
 * 5. The tombstone is deleted and the version rises, `lastChangeOn` stays. Catch-up then runs
 *    through today, so a date that passed before a late sync is charged.
 */
export async function unskipCharge(
	tx: Tx,
	ctx: ProfiledContext,
	id: string,
	dueOn: string,
	version: number,
	input: unknown,
): Promise<SubscriptionItem> {
	if (!isUuid(id) || !isIsoDate(dueOn)) throw new ApiError("not_found");
	const parsed = subscriptionUnskipSchema.safeParse(input);
	if (!parsed.success) throw fromZodError(parsed.error);
	const body = parsed.data;

	const currency = await lockCurrency(tx);
	checkChangedAt(body.changedAt, ctx.now);
	const { dated: stored, item } = await lockSubscription(
		tx,
		ctx,
		id,
		version,
		currency,
	);
	if (!stored.skipped.includes(dueOn)) return item;

	const changeDate = changeDateOf({
		changedAt: body.changedAt,
		lastChangeOn: stored.lastChangeOn,
		timezone: ctx.profile.timezone,
		now: ctx.now,
	});
	const refused = unskipIssue(dueOn, changeDate);
	if (refused) {
		throw new ApiError("validation_failed", { fields: { dueOn: refused } });
	}
	await tx.execute(
		sql`DELETE FROM app.subscription_skips
		WHERE subscription_id = ${id}::uuid AND due_on = ${dueOn}::date`,
	);
	await bump(tx, ctx, id);
	await catchUpSubscription(tx, chargeContext(ctx), stored, {
		through: ctx.today,
		skipped: stored.skipped.filter((date) => date !== dueOn),
	});
	return answer(tx, ctx, id);
}
