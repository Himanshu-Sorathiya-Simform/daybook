import { useQuery } from "@tanstack/react-query";

import type { CurrencyCode } from "@/lib/currency";
import type { TransactionFilter } from "@/lib/transactions/url";
import { facetsOptions } from "../lib/queries";

/** The filter counts, loaded once a filter control first opens and then following the filter
 * (BR-F03-59, BR-F03-76). `enabled` stays true after that, so closing the control keeps them. */
export function useFacets({
	filter,
	currency,
	enabled,
}: {
	filter: TransactionFilter;
	currency: CurrencyCode;
	enabled: boolean;
}) {
	return useQuery({ ...facetsOptions({ filter, currency }), enabled });
}
