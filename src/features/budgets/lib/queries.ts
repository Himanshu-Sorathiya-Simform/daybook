import { queryOptions, skipToken } from "@tanstack/react-query";

import { apiFetch } from "@/lib/api/client";
import type { ExpenseCategory } from "@/lib/budgets/model";
import type { Month } from "@/lib/budgets/months";
import type { CurrencyCode } from "@/lib/currency";
import { budgetKeys } from "./keys";
import { historyPath, monthPath, payeeSummaryPath, yearPath } from "./paths";
import type {
	BudgetHistoryAnswer,
	BudgetMonthAnswer,
	BudgetYearAnswer,
	PayeeSummaryAnswer,
} from "./types";

/** The panel's "Last 6 months" (BR-F04-30). */
export const PANEL_MONTHS = 6;

/** "Where it went" lists this many payees (BR-F04-30). */
export const TOP_PAYEES = 3;

/** One month's view (F04 section 11, section 15). */
export function budgetMonthOptions(month: Month) {
	return queryOptions({
		queryKey: budgetKeys.month(month),
		queryFn: ({ signal }) =>
			apiFetch<BudgetMonthAnswer>(monthPath(month), { signal }),
	});
}

/** One category's limit and spending over `months` months ending at `to` (BR-F04-35). With no
 * category it asks for nothing. */
export function budgetHistoryOptions({
	category,
	to,
	months,
}: {
	category: ExpenseCategory | null;
	to: Month;
	months: number;
}) {
	return queryOptions({
		queryKey: budgetKeys.history(category, to, months),
		queryFn:
			category === null ? skipToken : (
				({ signal }) =>
					apiFetch<BudgetHistoryAnswer>(
						historyPath(category, to, months),
						{
							signal,
						},
					)
			),
	});
}

/** Each month of `year` with its overall utilization, for the month grid (BR-F04-35). */
export function budgetYearOptions(year: number) {
	return queryOptions({
		queryKey: budgetKeys.year(year),
		queryFn: ({ signal }) =>
			apiFetch<BudgetYearAnswer>(yearPath(year), { signal }),
	});
}

/** F03's summary of one category in one month with its payee breakdown (BR-F04-30). The key
 * leaves out the currency, which only formats an amount filter this read never has. With no
 * category it asks for nothing. */
export function payeeSummaryOptions({
	category,
	month,
	currency,
}: {
	category: ExpenseCategory | null;
	month: Month;
	currency: CurrencyCode;
}) {
	return queryOptions({
		queryKey: budgetKeys.payees(category, month),
		queryFn:
			category === null ? skipToken : (
				({ signal }) =>
					apiFetch<PayeeSummaryAnswer>(
						payeeSummaryPath(category, month, currency),
						{ signal },
					)
			),
	});
}
