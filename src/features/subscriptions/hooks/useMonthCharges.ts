import { useQuery } from "@tanstack/react-query";

import type { Month } from "@/lib/budgets/months";
import { monthChargesOptions } from "../lib/queries";

/** Every charge dated in `month`, whole, for the calendar (BR-F05-38, BR-F05-48). */
export function useMonthCharges(month: Month) {
	return useQuery(monthChargesOptions(month));
}
