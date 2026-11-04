import { useQuery } from "@tanstack/react-query";

import type { CurrencyCode } from "@/lib/currency";
import type { TransactionFilter } from "@/lib/transactions/url";
import { facetsOptions } from "../lib/queries";

/** The filter counts, loaded while a control that shows them is open (BR-F03-59, BR-F03-76,
 * D-546). A closed control asks nothing; its last answer stays fresh for 30 seconds. */
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
