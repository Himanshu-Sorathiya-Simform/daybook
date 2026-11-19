import { useQuery } from "@tanstack/react-query";

import { subscriptionListOptions } from "../lib/queries";

/** The page's list: every Subscription with its derived figures, the totals, the next 30 days
 * and this month (F05 section 11). */
export function useSubscriptions() {
	return useQuery(subscriptionListOptions());
}
