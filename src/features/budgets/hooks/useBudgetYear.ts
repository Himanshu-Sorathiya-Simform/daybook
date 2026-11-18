import { useQuery } from "@tanstack/react-query";

import { budgetYearOptions } from "../lib/queries";
import { useNotKeptOffline } from "./useNotKeptOffline";

/** Each month of `year` with its overall utilization, for the month grid's figures
 * (BR-F04-14, BR-F04-35). Offline it reads as never read (F04 section 10). */
export function useBudgetYear(year: number) {
	return useNotKeptOffline(useQuery(budgetYearOptions(year)));
}
