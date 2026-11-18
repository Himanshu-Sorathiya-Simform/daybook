import "server-only";
import { type SQL, sql } from "drizzle-orm";
import type { Subscription, SubscriptionItem } from "@/lib/subscriptions/answers";
import {
	type DatedSubscription,
	monthlyMinor,
	nextDueOf,
	statusOf,
	yearlyMinor,
} from "@/lib/subscriptions/model";
import { safeInt } from "../../db/safe-int";
import { iso } from "../transactions/row";

/** A row of `app.subscriptions`, aliased `alias`, as the API's Subscription (F05 section 3),
 * built in SQL as JSON. The amount is text, read through `safeInt` (MON-6); the cadence and the
 * pause are rebuilt as objects from their two columns each (D-598). */
function subscriptionJson(alias: string): string {
	const a = alias;
	const createdAt = iso(`${a}.created_at`);
	const updatedAt = iso(`${a}.updated_at`);
	return `json_build_object(
		'id', ${a}.id, 'name', ${a}.name, 'amountMinor', ${a}.amount_minor::text,
		'cadence', json_build_object('unit', ${a}.cadence_unit, 'every', ${a}.cadence_every),
		'startDate', ${a}.start_date::text, 'category', ${a}.category, 'note', ${a}.note,
		'endDate', ${a}.end_date::text,
		'pause', CASE WHEN ${a}.pause_from IS NULL THEN NULL ELSE
			json_build_object('from', ${a}.pause_from::text, 'until', ${a}.pause_until::text) END,
		'chargesFrom', ${a}.charges_from::text, 'lastChangeOn', ${a}.last_change_on::text,
		'demo', ${a}.demo, 'version', ${a}.version,
		'createdAt', ${createdAt}, 'updatedAt', ${updatedAt})`;
}

/** What a read of Subscriptions needs of each: its stored fields, its tombstones, the due dates
 * of its linked charges, and the count and sum of those charges (BR-F05-35). Counted in one
 * lateral scan of the charges, which the unique index on user, Subscription and due date serves
 * under RLS (D-598). */
export const ITEM_JSON = sql.raw(`json_build_object(
	'subscription', ${subscriptionJson("s")},
	'skips', k.skips, 'charged', c.charged, 'chargeCount', c.charge_count, 'paidMinor', c.paid)`);

/** The tables `ITEM_JSON` reads, to follow `FROM app.subscriptions s`. */
export const ITEM_JOINS = sql.raw(`
	LEFT JOIN LATERAL (
		SELECT coalesce(json_agg(due_on::text ORDER BY due_on), '[]'::json) AS skips
		FROM app.subscription_skips WHERE subscription_id = s.id) k ON true
	LEFT JOIN LATERAL (
		SELECT coalesce(json_agg(due_on::text ORDER BY due_on), '[]'::json) AS charged,
			count(*)::text AS charge_count, coalesce(sum(amount_minor), 0)::text AS paid
		FROM app.transactions WHERE subscription_id = s.id) c ON true`);

/** The order Subscriptions are listed in: oldest first, then by id. */
export const ITEM_ORDER = sql.raw("s.created_at, s.id");

export type SubscriptionJson = Omit<Subscription, "amountMinor"> & {
	amountMinor: string;
};

export type ItemJson = {
	subscription: SubscriptionJson;
	skips: string[];
	charged: string[];
	chargeCount: string;
	paidMinor: string;
};

/** `ITEM_JSON`'s Subscription as the API's Subscription. */
export function readSubscription(json: SubscriptionJson): Subscription {
	return { ...json, amountMinor: safeInt(json.amountMinor) };
}

/** What a read builds from one Subscription: the API's item and the dated Subscription the
 * shared rules read. */
export type ReadItem = { item: SubscriptionItem; dated: DatedSubscription };

/** `ITEM_JSON` as the API's item (BR-F05-35), with its status, next due date and costs from the
 * shared rules, so server and browser agree, and the dated Subscription those rules read. */
export function readItem(json: ItemJson, today: string): ReadItem {
	const subscription = readSubscription(json.subscription);
	const dated: DatedSubscription = {
		...subscription,
		charged: json.charged,
		skipped: json.skips,
	};
	return {
		dated,
		item: {
			...subscription,
			skips: json.skips,
			status: statusOf(subscription, today),
			nextDueOn: nextDueOf(dated, today),
			yearlyMinor: yearlyMinor(subscription),
			monthlyMinor: monthlyMinor(subscription),
			chargeCount: safeInt(json.chargeCount),
			paidMinor: safeInt(json.paidMinor),
		},
	};
}

/** A `WHERE` for one Subscription by id, a UUID its caller has checked. */
export const byId = (id: string): SQL => sql`WHERE s.id = ${id}::uuid`;
