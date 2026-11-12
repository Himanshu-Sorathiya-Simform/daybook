import { useQuery } from "@tanstack/react-query";

import { viewsOptions } from "../lib/queries";

/** The saved views, in BR-F03-63's order, without All Transactions, which lives in code. */
export function useViews() {
	return useQuery(viewsOptions());
}
