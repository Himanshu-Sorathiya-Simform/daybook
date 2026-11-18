import type { QueryClient } from "@tanstack/react-query";

import { QUERY_ROOTS } from "@/lib/api/query-keys";
import { budgetKeys } from "./keys";

/** What a confirmed Budget write did: `count` when the number of Budgets changed (a create, a
 * restoring create or a delete), `rules` when only a Budget's limits did. */
export type BudgetWrite = "count" | "rules";

/**
 * After a confirmed Budget write, what F04 section 12 lists, among the areas built so far
 * (STATE-5):
 * - every Budgets read: month views, histories, year summaries and the panel's payees;
 * - when the number of Budgets changed, the profile, whose currency lock counts them
 *   (BR-F02-14).
 * The dashboard, Analytics, Insights and the demo status join when their roots exist. The
 * answer settles once the page's own reads have refetched, so a write's notice never sits
 * beside the figures from before it.
 */
export async function refreshAfterBudgetWrite(
	queryClient: QueryClient,
	write: BudgetWrite,
): Promise<void> {
	await Promise.all([
		queryClient.invalidateQueries({ queryKey: budgetKeys.all }),
		write === "count" ?
			queryClient.invalidateQueries({ queryKey: [QUERY_ROOTS.profile] })
		:	undefined,
	]);
}
