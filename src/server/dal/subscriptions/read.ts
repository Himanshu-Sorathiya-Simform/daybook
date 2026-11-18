import "server-only";
import { type SQL, sql } from "drizzle-orm";
import { firstDayOf, lastDayOf, monthOf } from "@/lib/budgets/months";
import type {
	SubscriptionItem,
	SubscriptionList,
} from "@/lib/subscriptions/answers";
import {
	compareByName,
	type CostTotals,
	costTotals,
	type DatedSubscription,
	expectedMinor,
	upcomingCharges,
	type UpcomingEntry,
	upcomingTotal,
} from "@/lib/subscriptions/model";
import { compareCodeUnits } from "@/lib/compare";
import { safeInt } from "../../db/safe-int";
import type { ProfiledContext } from "../context";
import { SPENDING } from "../transactions/totals";
import type { Tx } from "../with-user";
import {
	byId,
	ITEM_JOINS,
	ITEM_JSON,
	ITEM_ORDER,
	type ItemJson,
	type ReadItem,
	readItem,
} from "./row";

/** The upcoming list's reach: today through today + 30 days (BR-F05-20). */
export const UPCOMING_DAYS = 30;

/** The user's Subscriptions with their tombstones and charges, as one JSON array, in listing
 * order; `where` narrows it to one. */
function itemsSql(where: SQL = sql``): SQL {
	return sql`(SELECT coalesce(json_agg(${ITEM_JSON} ORDER BY ${ITEM_ORDER}), '[]'::json)
		FROM app.subscriptions s ${ITEM_JOINS} ${where})`;
}

/** Out for `source = subscription` over `first` to `last`: BR-F05-18's charged figure. It
 * counts the charges of deleted Subscriptions too, so it matches Transactions exactly. */
function chargedSql(first: string, last: string): SQL {
	return sql`(SELECT ${SPENDING}::text FROM app.transactions
		WHERE source = 'subscription'
			AND occurred_on BETWEEN ${first}::date AND ${last}::date)`;
}

/** The user's Subscriptions, in one statement, read through the shared rules. */
export async function readItems(
	tx: Tx,
	ctx: ProfiledContext,
	where: SQL = sql``,
): Promise<ReadItem[]> {
	const { rows } = await tx.execute<{ items: ItemJson[] }>(
		sql`SELECT ${itemsSql(where)} AS items`,
	);
	// A SELECT without FROM always answers one row.
	const [row] = rows as [{ items: ItemJson[] }];
	return row.items.map((json) => readItem(json, ctx.today));
}

/** One of the user's Subscriptions as the API's item (BR-F05-35), or `null`. RLS hides other
 * users' Subscriptions. `id` is a UUID its caller has checked. */
export async function getSubscriptionItem(
	tx: Tx,
	ctx: ProfiledContext,
	id: string,
): Promise<SubscriptionItem | null> {
	const [read] = await readItems(tx, ctx, byId(id));
	return read?.item ?? null;
}

/**
 * `GET /api/subscriptions` (F05 section 11), in one statement (D-293): every Subscription as an
 * item; the page totals over those with a next due date, paused ones included (BR-F05-17); the
 * upcoming 30 days and their total (BR-F05-20); and this month, charged from Transactions and
 * still to come from the schedules (BR-F05-18).
 */
export async function listSubscriptions(
	tx: Tx,
	ctx: ProfiledContext,
): Promise<SubscriptionList> {
	const month = monthOf(ctx.today);
	const { rows } = await tx.execute<{ items: ItemJson[]; charged: string }>(
		sql`SELECT ${itemsSql()} AS items,
			${chargedSql(firstDayOf(month), lastDayOf(month))} AS charged`,
	);
	const [row] = rows as [{ items: ItemJson[]; charged: string }];
	const reads = row.items.map((json) => readItem(json, ctx.today));
	const dated = reads.map((read) => read.dated);
	const upcoming = upcomingCharges(dated, ctx.today, UPCOMING_DAYS);
	return {
		items: reads.map((read) => read.item),
		totals: costTotals(counted(reads)),
		upcoming,
		upcomingTotalMinor: upcomingTotal(upcoming),
		thisMonth: {
			chargedMinor: safeInt(row.charged),
			toComeMinor: expectedMinor(dated, month, ctx.today),
		},
		currency: ctx.profile.currency,
	};
}

/** The Subscriptions the page totals count: those with a next due date (BR-F05-17). */
function counted(reads: readonly ReadItem[]): DatedSubscription[] {
	return reads
		.filter((read) => read.item.nextDueOn !== null)
		.map((read) => read.dated);
}

/** Every chargeable date from today through today + `days`, with no charge or tombstone, and
 * their total, in one statement (F05 section 11, BR-F05-20). The page reads 30 days; F10's
 * renewals insight reads 7. */
export async function upcomingDue(
	tx: Tx,
	ctx: ProfiledContext,
	days: number,
): Promise<{ entries: UpcomingEntry[]; totalMinor: number }> {
	const reads = await readItems(tx, ctx);
	const entries = upcomingCharges(
		reads.map((read) => read.dated),
		ctx.today,
		days,
	);
	return { entries, totalMinor: upcomingTotal(entries) };
}

/** The monthly and yearly cost of the Subscriptions with a next due date, in one statement
 * (BR-F05-17): F08's widget and F11's "Current monthly cost". */
export async function subscriptionCosts(
	tx: Tx,
	ctx: ProfiledContext,
): Promise<CostTotals> {
	return costTotals(counted(await readItems(tx, ctx)));
}

export type NextRenewal = {
	subscriptionId: string;
	name: string;
	dueOn: string;
	amountMinor: number;
};

/** `subscriptionCosts` and the next renewal, in one statement (F05 section 11): the earliest next
 * due date across the Subscriptions, ties by name then id, with its name and amount, or `null`.
 * F08's widget. */
export async function subscriptionSummary(
	tx: Tx,
	ctx: ProfiledContext,
): Promise<CostTotals & { nextRenewal: NextRenewal | null }> {
	const reads = await readItems(tx, ctx);
	const next = reads
		.filter(
			(read): read is ReadItem & { item: { nextDueOn: string } } =>
				read.item.nextDueOn !== null,
		)
		.sort(
			(a, b) =>
				compareCodeUnits(a.item.nextDueOn, b.item.nextDueOn)
				|| compareByName(a.item, b.item),
		)[0];
	return {
		...costTotals(counted(reads)),
		nextRenewal:
			next ?
				{
					subscriptionId: next.item.id,
					name: next.item.name,
					dueOn: next.item.nextDueOn,
					amountMinor: next.item.amountMinor,
				}
			:	null,
	};
}
