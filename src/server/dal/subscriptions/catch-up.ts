import "server-only";
import { sql } from "drizzle-orm";
import type { Month } from "@/lib/budgets/months";
import { uuidV7 } from "@/lib/ids";
import { toOccurred } from "@/lib/transactions/occurred";
import type { SubscriptionRecord } from "@/lib/subscriptions/model";
import { catchUpDates } from "@/lib/subscriptions/schedule";
import type { ProfiledContext } from "../context";
import type { CatchUpStep } from "../catch-up";
import type { Tx } from "../with-user";
import { type ItemJson, ITEM_JOINS, ITEM_JSON, readSubscription } from "./row";

/** What creating charges needs of the request: the user, the clock, today and the zone, all of
 * which both a request's context and a catch-up run have. */
export type ChargeContext = {
	userId: string;
	now: Date;
	today: string;
	timezone: string;
};

/** The context of a request, as a charge context. */
export function chargeContext(ctx: ProfiledContext): ChargeContext {
	return {
		userId: ctx.user.id,
		now: ctx.now,
		today: ctx.today,
		timezone: ctx.profile.timezone,
	};
}

/** A Subscription and the dates to charge it on. */
export type ChargeBatch = {
	subscription: Pick<
		SubscriptionRecord,
		"id" | "name" | "amountMinor" | "category" | "demo"
	>;
	dates: readonly string[];
};

export type Created = {
	/** The charges inserted: the dates that already had one are not counted. */
	created: number;
	/** The months those charges fall in, in order, once each. */
	months: Month[];
};

/**
 * Inserts the charges of `batches` in one statement (BR-F05-02), whatever their number: a weekly
 * Subscription started 10 years ago needs about 520. Each is an unedited expense of the
 * Subscription's current amount, category and name as payee, dated `dueOn` and `occurredOn`, at
 * 00:00 in the profile zone, moved forward by the gap where midnight does not exist (TIME-6,
 * BR-F03-06). Source `subscription`, the Subscription's `demo` flag, `createdAt` and `updatedAt`
 * the request clock, version 1, and a new UUIDv7 id (ID-1).
 *
 * `ON CONFLICT DO NOTHING` makes it idempotent: a date that has a charge already inserts
 * nothing, so every run of catch-up, however they overlap, creates each charge once. Dates with a
 * tombstone must not be passed (`catchUpDates` leaves them out).
 */
export async function insertCharges(
	tx: Tx,
	ctx: ChargeContext,
	batches: readonly ChargeBatch[],
): Promise<Created> {
	const now = ctx.now.toISOString();
	const rows = batches.flatMap(({ subscription, dates }) =>
		dates.map((dueOn) => ({
			id: uuidV7(ctx.now.getTime()),
			subscriptionId: subscription.id,
			dueOn,
			occurredAt: toOccurred(dueOn, "00:00", ctx.timezone).occurredAt,
			amountMinor: String(subscription.amountMinor),
			category: subscription.category,
			payee: subscription.name,
			demo: subscription.demo,
		})),
	);
	if (rows.length === 0) return { created: 0, months: [] };
	const { rows: inserted } = await tx.execute<{ month: Month }>(
		sql`INSERT INTO app.transactions (id, user_id, created_at, updated_at, type, amount_minor,
			occurred_at, occurred_on, category, payee, source, subscription_id, due_on, edited,
			demo, version)
		SELECT r.id, ${ctx.userId}, ${now}, ${now}, 'expense', r."amountMinor"::bigint,
			r."occurredAt", r."dueOn", r.category, r.payee, 'subscription', r."subscriptionId",
			r."dueOn", false, r.demo, 1
		FROM jsonb_to_recordset(${JSON.stringify(rows)}::jsonb) AS r(
			id uuid, "subscriptionId" uuid, "dueOn" date, "occurredAt" timestamptz,
			"amountMinor" text, category text, payee text, demo boolean)
		ON CONFLICT DO NOTHING
		RETURNING to_char(occurred_on, 'YYYY-MM') AS month`,
	);
	const months = [...new Set(inserted.map((row) => row.month))].sort();
	return { created: inserted.length, months };
}

/**
 * Catches `subscription` up through `through` (BR-F05-02, BR-F05-08 steps 2 and 4): a charge on
 * each chargeable date on or before `through` and today that has no tombstone in `skipped`, and
 * none yet. The caller holds the Subscription's lock.
 */
export async function catchUpSubscription(
	tx: Tx,
	ctx: ChargeContext,
	subscription: SubscriptionRecord,
	{ through, skipped }: { through: string; skipped: readonly string[] },
): Promise<Created> {
	const dates = catchUpDates(subscription, {
		through,
		today: ctx.today,
		skipped,
	});
	return insertCharges(tx, ctx, [{ subscription, dates }]);
}

/**
 * Locks every Subscription of the user `FOR UPDATE`, in id order, and reads each with its
 * tombstones (SRV-7, JOB-2). Two catch-ups, a change and a charge delete therefore take their
 * locks in one order and cannot deadlock; the second waits, then finds the charges the first
 * made.
 */
export async function lockSubscriptions(
	tx: Tx,
): Promise<{ subscription: SubscriptionRecord; skipped: readonly string[] }[]> {
	const { rows } = await tx.execute<{ item: ItemJson }>(
		sql`SELECT ${ITEM_JSON} AS item
		FROM app.subscriptions s ${ITEM_JOINS}
		ORDER BY s.id
		FOR UPDATE OF s`,
	);
	return rows.map(({ item }) => ({
		subscription: readSubscription(item.subscription),
		skipped: item.skips,
	}));
}

/**
 * Catches every Subscription of the user up through today, in one statement of inserts after one
 * locking read (BR-F05-05): what the lazy check and the boot endpoint run. Returns how many
 * charges it created, and their months.
 */
export async function catchUpAll(tx: Tx, ctx: ChargeContext): Promise<Created> {
	const locked = await lockSubscriptions(tx);
	const batches = locked.map(({ subscription, skipped }) => ({
		subscription,
		dates: catchUpDates(subscription, {
			through: ctx.today,
			today: ctx.today,
			skipped,
		}),
	}));
	return insertCharges(tx, ctx, batches);
}

/** The lazy check's Subscription step (BR-F05-05, JOB-1): runs in the check's transaction, which
 * has already taken the profile lock by raising `last_catch_up_on`, so its charges commit with
 * it or not at all. It is skipped while the device's queue holds Subscription items, because the
 * check itself is (D-244). */
export const subscriptionCatchUpStep: CatchUpStep = async (tx, run) => {
	await catchUpAll(tx, {
		userId: run.user.id,
		now: run.now,
		today: run.today,
		timezone: run.timezone,
	});
};

/**
 * The boot endpoint's work (BR-F05-06), in one write transaction:
 * 1. raise `last_catch_up_on` to today, which takes the profile lock (SRV-7);
 * 2. lock every Subscription in id order;
 * 3. catch each up through today.
 * It never lowers `last_catch_up_on`, whatever the zone did. Returns the charges created. The
 * route wrapper decides whether to skip it for a pending queue (BR-F05-06).
 */
export async function bootCatchUp(
	tx: Tx,
	ctx: ProfiledContext,
): Promise<{ chargesCreated: number }> {
	await tx.execute(
		sql`UPDATE app.profile SET last_catch_up_on = greatest(last_catch_up_on, ${ctx.today}::date)`,
	);
	const { created } = await catchUpAll(tx, chargeContext(ctx));
	return { chargesCreated: created };
}
