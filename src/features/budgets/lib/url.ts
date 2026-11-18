import { inRange, isMonth, type Month, monthRange } from "@/lib/budgets/months";

/** The page's path, which links to Budgets open (BR-F04-14). */
export const BUDGETS_PAGE = "/budgets";

/**
 * The month a Budgets link shows (BR-F04-14, D-566): its `month`, given once as `YYYY-MM`
 * within the range, else the current month. A `month` that is repeated, malformed or outside
 * the range is `invalid`, for the page to drop with the FIL-5 notice. The server render and the
 * browser read a link the same way, so they always show the same month.
 */
export function readMonthParam(
	params: URLSearchParams,
	current: Month,
): { month: Month; invalid: boolean } {
	const values = params.getAll("month");
	if (values.length === 0) return { month: current, invalid: false };
	const [value] = values;
	if (
		values.length === 1
		&& isMonth(value)
		&& inRange(value, monthRange(current))
	) {
		return { month: value, invalid: false };
	}
	return { month: current, invalid: true };
}

/** The page's link for `month`: the current month is the page with no `month`, so a link to
 * it keeps meaning "now". */
export function budgetsHref(month: Month, current: Month): string {
	return month === current ? BUDGETS_PAGE : `${BUDGETS_PAGE}?month=${month}`;
}
