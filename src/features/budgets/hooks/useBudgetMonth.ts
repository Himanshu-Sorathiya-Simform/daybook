import { useQuery } from "@tanstack/react-query";

import type { Month } from "@/lib/budgets/months";
import { budgetMonthOptions } from "../lib/queries";

/** The page's month view: overview, rows, Not budgeted, Not active and the summary panel's
 * `previous` (F04 section 11). */
export function useBudgetMonth(month: Month) {
	return useQuery(budgetMonthOptions(month));
}
