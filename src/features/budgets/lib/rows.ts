import type {
	Key as AriaKey,
	Selection as AriaSelection,
} from "react-aria-components";

import type { ExpenseCategory } from "@/lib/budgets/model";

/** A row's id holds its group and category, "budget:food", so a category can sit under Not
 * budgeted and Not active at once. */
export const categoryOf = (id: string) =>
	id.slice(id.indexOf(":") + 1) as ExpenseCategory;

/** The ids among `ids` that show `selected`, for a list's or table's selected keys. */
export const selectedIn = (
	ids: readonly string[],
	selected: ExpenseCategory | null,
) => (selected === null ? [] : ids.filter((id) => categoryOf(id) === selected));

/** The category a selection change chose, or `null` for a cleared selection. Single selection
 * never reports "all". */
export const pickedIn = (keys: AriaSelection) => {
	const [key] = keys as Set<AriaKey>;
	return key === undefined ? null : categoryOf(String(key));
};
