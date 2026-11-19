import { useQuery } from "@tanstack/react-query";

import type { Month } from "@/lib/budgets/months";
import { subscriptionMonthsOptions } from "../lib/queries";

/** Each month from `from` to `to`, charged and expected, for the calendar's month row
 * (BR-F05-36). */
export function useSubscriptionMonths(from: Month, to: Month) {
	return useQuery(subscriptionMonthsOptions(from, to));
}
