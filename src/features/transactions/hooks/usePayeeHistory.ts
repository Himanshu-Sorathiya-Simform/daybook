import { useQuery } from "@tanstack/react-query";

import { HISTORY_MONTHS, payeeHistoryOptions } from "../lib/queries";
import { payeeQueryText } from "../lib/suggestions";

/** One payee's last months for the panel (BR-F03-62, BR-F03-72). `null`, or text the server
 * would refuse, asks for nothing. */
export function usePayeeHistory(payee: string | null, months = HISTORY_MONTHS) {
	const text = payee === null ? null : payeeQueryText(payee);
	return useQuery({
		...payeeHistoryOptions(text ?? "", months),
		enabled: text !== null,
	});
}
