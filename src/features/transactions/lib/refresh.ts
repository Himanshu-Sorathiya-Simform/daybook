import { hashKey, type QueryClient } from "@tanstack/react-query";

import { QUERY_ROOTS } from "@/lib/api/query-keys";
import { payeeKeys, transactionKeys, viewKeys } from "./keys";
import type { SavedView } from "@/lib/transactions/views";
import type { TransactionAnswer, ViewAnswer, ViewsAnswer } from "./types";

export type TransactionWrite =
	| { kind: "create" | "edit"; row: TransactionAnswer }
	/** `charge`: the deleted row was a Subscription's charge, which its tombstone and its
	 * Subscription's figures follow (BR-F03-17). */
	| { kind: "delete"; id: string; charge?: boolean };

/**
 * After a confirmed Transaction write, what F03 section 12 lists, among the areas built so far
 * (STATE-5):
 * - the written row is set from the answer, or a deleted one dropped, so its panel neither
 *   refetches nor asks for a row that is gone;
 * - every other Transactions read (lists, summaries, counts, histograms, other rows);
 * - payees, their searches and histories;
 * - on a create or delete, the profile, whose currency lock counts Transactions;
 * - every Budgets read, whose spending a Transaction moves (F04 section 12);
 * - every Subscriptions read, when a charge changed: an edit of a charge, or the delete of one
 *   with its tombstone (F03 section 12). A new manual row is no charge.
 * Goals, the dashboard, Analytics and Insights join when their roots exist. The answer settles
 * once every refetch has.
 */
export async function refreshAfterTransactionWrite(
	queryClient: QueryClient,
	write: TransactionWrite,
): Promise<void> {
	const id = write.kind === "delete" ? write.id : write.row.id;
	const charge =
		write.kind === "delete" ?
			write.charge === true
		:	write.kind === "edit" && write.row.source === "subscription";
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
		queryClient.invalidateQueries({ queryKey: [QUERY_ROOTS.budgets] }),
		charge ?
			queryClient.invalidateQueries({ queryKey: [QUERY_ROOTS.subscriptions] })
		:	undefined,
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

/** A view's answer as the list holds it, without the answer's `currency`. */
function listed({
	id,
	name,
	filter,
	sort,
	dir,
	group,
	version,
	createdAt,
	updatedAt,
}: ViewAnswer): SavedView {
	return { id, name, filter, sort, dir, group, version, createdAt, updatedAt };
}

/** Puts a saved view into the cached list as the server answered it, before the list reloads,
 * so the bar shows it at once and never takes a new view's id for an unknown one (BR-F03-65):
 * a changed view in its place, a new one last, since views keep creation order (BR-F03-63). */
export function putView(queryClient: QueryClient, view: ViewAnswer): void {
	queryClient.setQueryData<ViewsAnswer>(viewKeys.list(), (old) => {
		if (!old) return old;
		const items =
			old.items.some((item) => item.id === view.id) ?
				old.items.map((item) => (item.id === view.id ? listed(view) : item))
			:	[...old.items, listed(view)];
		return { ...old, items };
	});
}

/** Takes a deleted view out of the cached list before it reloads (BR-F03-69). */
export function dropView(queryClient: QueryClient, id: string): void {
	queryClient.setQueryData<ViewsAnswer>(
		viewKeys.list(),
		(old) =>
			old && { ...old, items: old.items.filter((item) => item.id !== id) },
	);
}
