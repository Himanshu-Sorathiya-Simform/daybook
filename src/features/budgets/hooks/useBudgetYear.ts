import { useQuery } from "@tanstack/react-query";

import { budgetYearOptions } from "../lib/queries";

/** Each month of `year` with its overall utilization, for the month grid's figures
 * (BR-F04-14, BR-F04-35). */
export function useBudgetYear(year: number) {
	return useQuery(budgetYearOptions(year));
}
