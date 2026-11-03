import { useQuery } from "@tanstack/react-query";

import { payeesOptions } from "../lib/queries";

/** The 200 payee suggestions and category counts (BR-F03-44). Loaded once a logged-in page has
 * rendered, so the first entry dialog has them (BR-F03-76). */
export function usePayees() {
	return useQuery(payeesOptions());
}
