import type { ExpenseCategory } from "@/lib/budgets/model";
import type { Month } from "@/lib/budgets/months";
import { QUERY_ROOTS } from "@/lib/api/query-keys";

const BUDGETS = [QUERY_ROOTS.budgets] as const;

/**
 * The Budgets area's keys (STATE-5): the root, the kind of read, then its parameters. The
 * panel's payee summary is an F03 read, but its figures move with the same writes as the rest
 * of the page, so it sits under this root too: one invalidation refreshes everything the page
 * shows, and a Transaction write reaches it through the root (F04 section 12). A `null`
 * category is a read still waiting for one, which never matches a real category's answer.
 */
export const budgetKeys = {
	all: BUDGETS,
	month: (month: Month) => [...BUDGETS, "month", month] as const,
	history: (category: ExpenseCategory | null, to: Month, months: number) =>
		[...BUDGETS, "history", category, to, months] as const,
	year: (year: number) => [...BUDGETS, "year", year] as const,
	payees: (category: ExpenseCategory | null, month: Month) =>
		[...BUDGETS, "payees", category, month] as const,
};
