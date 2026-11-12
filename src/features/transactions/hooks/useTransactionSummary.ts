import { useQuery } from "@tanstack/react-query";

import type { CurrencyCode } from "@/lib/currency";
import type { TransactionFilter } from "@/lib/transactions/url";
import { transactionSummaryOptions } from "../lib/queries";
import { type Breakdown, PAGE_BREAKDOWNS } from "../lib/types";

/** The header totals and the panel's breakdowns for a filter, from one request (BR-F03-41,
 * BR-F03-71). */
export function useTransactionSummary({
	filter,
	currency,
	by = PAGE_BREAKDOWNS,
}: {
	filter: TransactionFilter;
	currency: CurrencyCode;
	by?: readonly Breakdown[];
}) {
	return useQuery(transactionSummaryOptions({ filter, by, currency }));
}
