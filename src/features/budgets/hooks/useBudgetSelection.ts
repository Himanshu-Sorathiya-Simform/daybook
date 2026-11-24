import { useState } from "react";

import type { ExpenseCategory } from "@/lib/budgets/model";
import type { BudgetMonthAnswer } from "../lib/types";
import { shows } from "../lib/view";

/**
 * What the page has selected (BR-F04-17, D-249): a category, which stays across months while it
 * shows in the new one and clears otherwise. Cleared while rendering, React's pattern for state
 * that follows what was read. `choose(null)` clears it.
 */
export function useBudgetSelection(data: BudgetMonthAnswer | undefined) {
	const [selected, setSelected] = useState<ExpenseCategory | null>(null);
	if (data && selected !== null && !shows(data, selected)) setSelected(null);
	return { selected, choose: setSelected };
}
