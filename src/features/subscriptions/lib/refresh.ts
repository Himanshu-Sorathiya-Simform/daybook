import type { QueryClient } from "@tanstack/react-query";

import { QUERY_ROOTS } from "@/lib/api/query-keys";
import { refreshAfterChargeChange } from "@/lib/api/refresh";
import { subscriptionKeys } from "./keys";

/** What a confirmed Subscription write did: `count` when the number of Subscriptions changed
 * (a create, or a delete, an Undo of a create included), and `charges` when it created,
 * repriced, unlinked or deleted charges. */
export type SubscriptionWrite = { count: boolean; charges: boolean };

/** The counts and months that a write's answer holds (F05 section 11). */
export type ChargeCounts = {
	chargesCreated?: number;
	chargesUpdated?: number;
	chargesDeleted?: number;
	/** A delete's charges left behind as unlinked expenses, which no longer name their
	 * Subscription. */
	chargesKept?: number;
	months?: readonly string[];
};

/** Whether an answer says some charge changed: a count above 0, or a month listed
 * (BR-F05-08). */
export function chargesChanged({
	chargesCreated = 0,
	chargesUpdated = 0,
	chargesDeleted = 0,
	chargesKept = 0,
	months = [],
}: ChargeCounts): boolean {
	return (
		chargesCreated + chargesUpdated + chargesDeleted + chargesKept > 0
		|| months.length > 0
	);
}

/**
 * After a confirmed Subscription write, what F05 section 12 lists, among the areas built so
 * far (STATE-5):
 * - every Subscriptions read: the list, the months and the charge reads;
 * - when charges changed, also every Transactions read, payees and every Budgets read;
 * - when the number of Subscriptions changed, the profile, whose currency lock counts them
 *   (BR-F02-14).
 * The dashboard, Insights and the demo status join when their roots exist. The answer settles
 * once the page's own reads have refetched, so a write's notice never sits beside the figures
 * from before it.
 */
export async function refreshAfterSubscriptionWrite(
	queryClient: QueryClient,
	{ count, charges }: SubscriptionWrite,
): Promise<void> {
	await Promise.all([
		charges ?
			refreshAfterChargeChange(queryClient)
		:	queryClient.invalidateQueries({ queryKey: subscriptionKeys.all }),
		count ?
			queryClient.invalidateQueries({ queryKey: [QUERY_ROOTS.profile] })
		:	undefined,
	]);
}
