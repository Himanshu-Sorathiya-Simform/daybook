import { useQuery } from "@tanstack/react-query";

import type { ExpenseCategory } from "@/lib/budgets/model";
import type { Month } from "@/lib/budgets/months";
import { budgetHistoryOptions, PANEL_MONTHS } from "../lib/queries";

/** One category's limits and spending over `months` months ending at `to`: the panel's Last 6
 * months, the dialog's hint and the preview's spending (BR-F04-35). With no category chosen
 * yet, it asks for nothing. */
export function useBudgetHistory(
	category: ExpenseCategory | null,
	to: Month,
	months = PANEL_MONTHS,
) {
	return useQuery(budgetHistoryOptions({ category, to, months }));
}
