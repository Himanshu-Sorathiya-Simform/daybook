import { useState } from "react";

import type { StateLabel } from "@/lib/budgets/model";
import type { Month } from "@/lib/budgets/months";

/** The state the list is filtered to, or `null` for all (BR-F04-31). */
export type MonthFilter = StateLabel | null;

/**
 * The state filter of the month shown (BR-F04-31). It belongs to the month it was chosen in: any
 * change of `month`, Back included, drops it for good, React's pattern for state that follows
 * what was read.
 */
export function useMonthFilter(
	month: Month,
): [MonthFilter, (state: MonthFilter) => void] {
	const [chosen, setChosen] = useState<{ month: Month; state: StateLabel } | null>(
		null,
	);
	if (chosen !== null && chosen.month !== month) setChosen(null);
	const filter = chosen?.month === month ? chosen.state : null;
	const setFilter = (state: MonthFilter) =>
		setChosen(state === null ? null : { month, state });
	return [filter, setFilter];
}
