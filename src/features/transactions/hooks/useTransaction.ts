import { useQuery } from "@tanstack/react-query";

import { transactionOptions } from "../lib/queries";

/** One Transaction by id, for a selected row the loaded pages do not hold (BR-F03-53,
 * BR-F03-73). `null` asks for nothing. A 404 is the query's error, never retried. */
export function useTransaction(id: string | null) {
	return useQuery({ ...transactionOptions(id ?? ""), enabled: id !== null });
}
