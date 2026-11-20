import { useQuery } from "@tanstack/react-query";

import { payeesOptions } from "../lib/payees";

/** The payees with an expense, which Add's Name box lists (BR-F05-24, D-451). They are the
 * Transactions page's own payee list, so a dialog opened after it has them at once. An Edit,
 * whose Name is plain text, asks for nothing (`enabled` false). */
export function usePaidPayees({ enabled = true }: { enabled?: boolean } = {}) {
	return useQuery({ ...payeesOptions(), enabled });
}
