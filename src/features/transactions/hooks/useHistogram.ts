import { useQuery } from "@tanstack/react-query";

import type { CurrencyCode } from "@/lib/currency";
import type { TransactionFilter } from "@/lib/transactions/url";
import { histogramOptions } from "../lib/queries";

/** The amount histogram, loaded while the Amount control or the phone sheet is open
 * (BR-F03-60, BR-F03-76, D-546). Its key leaves out the amount bounds, so moving them never
 * refetches it. */
export function useHistogram({
	filter,
	currency,
	enabled,
}: {
	filter: TransactionFilter;
	currency: CurrencyCode;
	enabled: boolean;
}) {
	return useQuery({ ...histogramOptions({ filter, currency }), enabled });
}
