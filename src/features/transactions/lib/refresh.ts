import { hashKey, type QueryClient } from "@tanstack/react-query";

import { QUERY_ROOTS } from "@/lib/api/query-keys";
import { payeeKeys, transactionKeys, viewKeys } from "./keys";
import type { TransactionAnswer } from "./types";

export type TransactionWrite =
	| { kind: "create" | "edit"; row: TransactionAnswer }
	| { kind: "delete"; id: string };

/**
 * After a confirmed Transaction write, what F03 section 12 lists, among the areas built so far
 * (STATE-5):
 * - the written row is set from the answer, or a deleted one dropped, so its panel neither
 *   refetches nor asks for a row that is gone;
 * - every other Transactions read (lists, summaries, counts, histograms, other rows);
 * - payees, their searches and histories;
 * - on a create or delete, the profile, whose currency lock counts Transactions.
 * Budgets, Goals, the dashboard, Analytics, Insights and Subscriptions join when their roots
 * exist. The answer settles once every refetch has.
 */
export async function refreshAfterTransactionWrite(
	queryClient: QueryClient,
	write: TransactionWrite,
): Promise<void> {
	const id = write.kind === "delete" ? write.id : write.row.id;
	const written = hashKey(transactionKeys.detail(id));
	if (write.kind === "delete") {
		queryClient.removeQueries({
			queryKey: transactionKeys.detail(id),
			exact: true,
		});
	} else {
		queryClient.setQueryData(transactionKeys.detail(id), write.row);
	}
	await Promise.all([
		queryClient.invalidateQueries({
			queryKey: transactionKeys.all,
			predicate: (query) => query.queryHash !== written,
		}),
		queryClient.invalidateQueries({ queryKey: payeeKeys.all }),
		write.kind === "edit" ?
			undefined
		:	queryClient.invalidateQueries({ queryKey: [QUERY_ROOTS.profile] }),
	]);
}

/** After a saved-view write, or a refusal that means the list is stale (BR-F03-69): the views
 * list reloads. Views change no Transaction. */
export async function refreshViews(queryClient: QueryClient): Promise<void> {
	await queryClient.invalidateQueries({ queryKey: viewKeys.all });
}
