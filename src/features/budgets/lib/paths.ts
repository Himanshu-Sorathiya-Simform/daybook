import type { ExpenseCategory } from "@/lib/budgets/model";
import { firstDayOf, lastDayOf, type Month } from "@/lib/budgets/months";
import type { CurrencyCode } from "@/lib/currency";
import { DEFAULT_DIR, DEFAULT_SORT, defaultGroup } from "@/lib/transactions/model";
import { type ListParams, writeFilterQuery } from "@/lib/transactions/url";

/** The list parameters a link or read that ignores them is written with: all defaults, so
 * none of them reaches the URL (BR-F03-33). */
const NO_LIST: ListParams = {
	sort: DEFAULT_SORT,
	dir: DEFAULT_DIR,
	group: defaultGroup(DEFAULT_SORT),
};

/** The month view, and a create (F04 section 11). */
export const BUDGETS_PATH = "/api/budgets";

export function monthPath(month: Month): string {
	return `${BUDGETS_PATH}?month=${month}`;
}

/** One Budget's change and delete. */
export function budgetPath(id: string): string {
	return `${BUDGETS_PATH}/${encodeURIComponent(id)}`;
}

/** One month's one-month limit, which Remove deletes (BR-F04-25). */
export function monthLimitPath(id: string, month: Month): string {
	return `${budgetPath(id)}/overrides/${month}`;
}

/** One category's limits and spending over `months` months ending at `to` (BR-F04-35). */
export function historyPath(
	category: ExpenseCategory,
	to: Month,
	months: number,
): string {
	return `${BUDGETS_PATH}/history?category=${category}&to=${to}&months=${months}`;
}

/** The overall utilization of each month of `year`, for the month grid (BR-F04-35). */
export function yearPath(year: number): string {
	return `${BUDGETS_PATH}/summary?year=${year}`;
}

/** The F03 filter of one category's Transactions in one month (D-111). */
function categoryMonthQuery(
	category: ExpenseCategory,
	month: Month,
	currency: CurrencyCode,
): string {
	return writeFilterQuery(
		{ from: firstDayOf(month), to: lastDayOf(month), cat: [category] },
		NO_LIST,
		{ currency },
	);
}

/** F03's summary of that filter with its payee breakdown, for "Where it went" (BR-F04-30). */
export function payeeSummaryPath(
	category: ExpenseCategory,
	month: Month,
	currency: CurrencyCode,
): string {
	return `/api/transactions/summary?${categoryMonthQuery(category, month, currency)}&by=payee`;
}

/** "See 4 Transactions": the Transactions page for that filter, whose header Out equals the
 * row's spent (BR-F04-17). */
export function transactionsHref(
	category: ExpenseCategory,
	month: Month,
	currency: CurrencyCode,
): string {
	return `/transactions?${categoryMonthQuery(category, month, currency)}`;
}
