import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

import type { CurrencyCode } from "@/lib/currency";
import type { ListParams, TransactionFilter } from "@/lib/transactions/url";
import { orderChanged, transactionListOptions } from "../lib/queries";

/**
 * The infinite list for a filter (BR-F03-29, BR-F03-30). When a page comes back under another
 * group order, which a write anywhere can cause under category or payee grouping, the list
 * reloads from the first page (BR-F03-57): reset, so the stale pages and their cursors go.
 */
export function useTransactionList({
	filter,
	list,
	currency,
}: {
	filter: TransactionFilter;
	list: ListParams;
	currency: CurrencyCode;
}) {
	const queryClient = useQueryClient();
	const options = transactionListOptions({ filter, list, currency });
	const query = useInfiniteQuery(options);
	const moved = query.data !== undefined && orderChanged(query.data.pages);
	const { queryKey } = options;

	useEffect(() => {
		if (moved) void queryClient.resetQueries({ queryKey, exact: true });
	}, [moved, queryClient, queryKey]);

	return query;
}
