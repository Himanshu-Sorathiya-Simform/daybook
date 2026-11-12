import { EXPENSE_CATEGORIES } from "@/lib/categories";

import { GOLDEN_ALL, GOLDEN_BUDGETS } from "../../../../seed/golden";
import type { ExpenseCategory } from "../model";
import type { Month } from "../months";
import type { BudgetRecord, CategorySpending } from "../view";

/** Category spending (TXN-5) of `month` from the golden Transactions #1 to #27: the input the
 * database gives `buildMonthView`. Expected figures stay written out in each test, from
 * docs/03-golden-dataset.md. */
export function goldenSpending(month: Month): CategorySpending {
	const spending: CategorySpending = {};
	for (const row of GOLDEN_ALL) {
		if (!row.occurredOn.startsWith(month)) continue;
		if (!EXPENSE_CATEGORIES.includes(row.category as ExpenseCategory)) continue;
		const sign = { expense: 1, refund: -1 }[row.type as string];
		if (sign === undefined) continue;
		const category = row.category as ExpenseCategory;
		spending[category] = (spending[category] ?? 0) + sign * row.amountMinor;
	}
	return spending;
}

/** One golden Budget as a stored record, with fresh arrays a test may change. */
export function goldenBudget(category: ExpenseCategory): BudgetRecord {
	const budget = GOLDEN_BUDGETS.find((each) => each.category === category);
	if (!budget) throw new Error(`The golden dataset has no ${category} Budget.`);
	return {
		...budget,
		schedule: budget.schedule.map((entry) => ({ ...entry })),
		overrides: [],
	};
}

/** The four golden Budgets as stored records. */
export function goldenBudgets(): BudgetRecord[] {
	return GOLDEN_BUDGETS.map((budget) => goldenBudget(budget.category));
}
