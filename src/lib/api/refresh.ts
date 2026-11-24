import type { QueryClient } from "@tanstack/react-query";

import { QUERY_ROOTS } from "./query-keys";

/**
 * After charges were created, repriced, unlinked or deleted outside a Transaction write, by
 * Subscription catch-up or a Subscription write (F05 sections 7.2 and 12), and after a
 * Transaction write that changed a charge (F03 section 12): every read that holds
 * Transactions, or figures drawn from them, among the areas built so far (STATE-5):
 * - Subscriptions: this month's charged figure, charge counts, the calendar and the timelines;
 * - every Transactions read, and payees, which a new charge's payee joins;
 * - every Budgets read, whose spending a charge moves.
 * The dashboard, Analytics and Insights join when their roots exist. The answer settles once
 * every refetch has.
 */
export async function refreshAfterChargeChange(
	queryClient: QueryClient,
): Promise<void> {
	await Promise.all(
		[
			QUERY_ROOTS.subscriptions,
			QUERY_ROOTS.transactions,
			QUERY_ROOTS.payees,
			QUERY_ROOTS.budgets,
		].map((root) => queryClient.invalidateQueries({ queryKey: [root] })),
	);
}
