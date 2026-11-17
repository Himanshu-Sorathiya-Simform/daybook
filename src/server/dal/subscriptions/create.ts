import "server-only";
import { sql } from "drizzle-orm";
import type { SubscriptionCreated } from "@/lib/subscriptions/answers";
import { chargesFromOnCreate, recordingDateOf } from "@/lib/subscriptions/rules";
import {
	createWindowIssues,
	subscriptionCreateSchema,
} from "@/lib/subscriptions/schemas";
import { ApiError, fromZodError } from "../../api/errors";
import type { ProfiledContext } from "../context";
import { lockCurrency } from "../currency";
import type { Tx } from "../with-user";
import { catchUpSubscription, chargeContext } from "./catch-up";
import { getSubscriptionItem } from "./read";

/** Reads the Subscription just written, with its charges and derived values. */
async function answer(
	tx: Tx,
	ctx: ProfiledContext,
	id: string,
	chargesCreated: number,
): Promise<SubscriptionCreated> {
	const item = await getSubscriptionItem(tx, ctx, id);
	// The row was just inserted, or read a moment ago under the profile lock.
	if (!item) throw new ApiError("id_conflict");
	return { ...item, chargesCreated };
}

/**
 * Creates a Subscription with the client's id (F05 section 11, BR-F05-03, BR-F05-04,
 * BR-P2-20), in this order:
 * 1. The body (`subscriptionCreateSchema`): 422 with field paths.
 * 2. The profile lock (D-213), then the id: one the user already has answers that Subscription
 *    unchanged, whatever the body now says, with 0 charges created (API-5, D-603).
 * 3. The currency: 422 `currency_mismatch`.
 * 4. The windows (`createWindowIssues`): the id at most 5 minutes ahead, `createdAt` from 90
 *    days back to 5 minutes ahead, `startDate` within 10 years back and 1 year ahead of the
 *    recording date: 422 on each field.
 * 5. `INSERT ... ON CONFLICT DO NOTHING` with no target, with `chargesFrom` from the past-charges
 *    choice and `lastChangeOn` the recording date (BR-F05-03). With no row inserted, the re-read:
 *    the same id is this create, done by a request that won the race (200); otherwise the id is
 *    another user's, 409 `id_conflict`.
 * 6. Catch-up for the new Subscription through today, in this transaction (BR-F05-05), so its
 *    past charges, when chosen, commit with it.
 * The answer is the Subscription as the list shows it, with `chargesCreated`, and carries the
 * currency read under the lock (D-493) in the context's profile.
 */
export async function createSubscription(
	tx: Tx,
	ctx: ProfiledContext,
	input: unknown,
): Promise<{ subscription: SubscriptionCreated; created: boolean }> {
	const parsed = subscriptionCreateSchema.safeParse(input);
	if (!parsed.success) throw fromZodError(parsed.error);
	const body = parsed.data;

	const currency = await lockCurrency(tx);
	const existing = await getSubscriptionItem(tx, ctx, body.id);
	if (existing)
		return { subscription: { ...existing, chargesCreated: 0 }, created: false };
	if (body.currency !== currency) throw new ApiError("currency_mismatch");

	const issues = createWindowIssues(body, {
		now: ctx.now,
		timezone: ctx.profile.timezone,
	});
	if (issues.length > 0) {
		const fields: Record<string, string> = {};
		for (const issue of issues) fields[issue.path.join(".")] ??= issue.message;
		throw new ApiError("validation_failed", { fields });
	}

	const recordingDate = recordingDateOf({
		createdAt: body.createdAt,
		timezone: ctx.profile.timezone,
		now: ctx.now,
	});
	const chargesFrom = chargesFromOnCreate({
		startDate: body.startDate,
		recordingDate,
		backfill: body.backfill,
	});
	const { rows } = await tx.execute<{ id: string }>(
		sql`INSERT INTO app.subscriptions (id, user_id, created_at, updated_at, name, amount_minor,
			cadence_unit, cadence_every, start_date, category, note, charges_from, last_change_on,
			demo, version)
		VALUES (${body.id}, ${ctx.user.id}, ${body.createdAt}, ${ctx.now.toISOString()}, ${body.name},
			${body.amountMinor}, ${body.cadence.unit}, ${body.cadence.every}, ${body.startDate},
			${body.category}, ${body.note}, ${chargesFrom}, ${recordingDate}, false, 1)
		ON CONFLICT DO NOTHING
		RETURNING id`,
	);
	if (rows.length === 0) {
		// The id exists: the user's own row is this create, committed by another request since the
		// lookup (API-5); anyone else's stays hidden by RLS.
		const raced = await getSubscriptionItem(tx, ctx, body.id);
		if (!raced) throw new ApiError("id_conflict");
		return { subscription: { ...raced, chargesCreated: 0 }, created: false };
	}

	const { created } = await catchUpSubscription(
		tx,
		chargeContext(ctx),
		{
			id: body.id,
			name: body.name,
			amountMinor: body.amountMinor,
			cadence: body.cadence,
			startDate: body.startDate,
			category: body.category,
			note: body.note,
			endDate: null,
			pause: null,
			chargesFrom,
			lastChangeOn: recordingDate,
			demo: false,
			version: 1,
		},
		{ through: ctx.today, skipped: [] },
	);
	return { subscription: await answer(tx, ctx, body.id, created), created: true };
}
