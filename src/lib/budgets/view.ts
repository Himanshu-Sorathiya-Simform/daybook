import { CATEGORY_LABELS, EXPENSE_CATEGORIES } from "@/lib/categories";
import { compareCodeUnits } from "@/lib/compare";

import {
	budgetState,
	type BudgetRules,
	type BudgetState,
	categoryOrder,
	type ExpenseCategory,
	inactiveStatus,
	type InactiveStatus,
	type LimitSource,
	limitSource,
	nextEntry,
	type ScheduleEntry,
	utilizationTenths,
} from "./model";
import { type Month, shiftMonth } from "./months";

/** A stored Budget, as the month view needs it. */
export type BudgetRecord = BudgetRules & {
	id: string;
	category: ExpenseCategory;
	version: number;
	demo: boolean;
};

/** Category spending (TXN-5) in one month: expenses minus refunds, confirmed only. A
 * category with no Transactions may be missing or 0. */
export type CategorySpending = Partial<Record<ExpenseCategory, number>>;

export type BudgetRow = BudgetRecord & {
	limitMinor: number;
	spentMinor: number;
	remainingMinor: number;
	utilizationTenths: number;
	state: BudgetState;
	source: LimitSource;
	next: ScheduleEntry | null;
};

export type InactiveRow = BudgetRecord & InactiveStatus;

export type MonthView = {
	month: Month;
	overall: {
		limitMinor: number;
		spentMinor: number;
		utilizationTenths: number | null;
		state: BudgetState | null;
	};
	totalSpentMinor: number;
	unbudgetedMinor: number;
	unbudgeted: {
		category: ExpenseCategory;
		spentMinor: number;
		budgetId: string | null;
	}[];
	budgets: BudgetRow[];
	inactive: InactiveRow[];
	previous: {
		month: Month;
		limitMinor: number;
		spentMinor: number;
		budgetCount: number;
		overCount: number;
	};
};

const STATE_ORDER = { over: 0, warning: 1, ok: 2 } as const satisfies Record<
	BudgetState,
	number
>;

const spentIn = (spending: CategorySpending, category: ExpenseCategory) =>
	spending[category] ?? 0;

/** The budgeted rows of `month`, sorted by state (Over budget and At limit first), then by
 * utilization, highest first (BR-F04-15); ties keep CAT-2's order. */
function budgetRows(
	budgets: readonly BudgetRecord[],
	spending: CategorySpending,
	month: Month,
): BudgetRow[] {
	const rows: BudgetRow[] = [];
	for (const budget of budgets) {
		const source = limitSource(budget, month);
		if (source?.limitMinor == null) continue;
		const limitMinor = source.limitMinor;
		const spentMinor = spentIn(spending, budget.category);
		const tenths = utilizationTenths(spentMinor, limitMinor);
		rows.push({
			...budget,
			limitMinor,
			spentMinor,
			remainingMinor: limitMinor - spentMinor,
			utilizationTenths: tenths,
			state: budgetState(tenths),
			source,
			next: nextEntry(budget, month),
		});
	}
	return rows.sort(
		(a, b) =>
			STATE_ORDER[a.state] - STATE_ORDER[b.state]
			|| b.utilizationTenths - a.utilizationTenths
			|| categoryOrder(a.category) - categoryOrder(b.category),
	);
}

const sum = (values: readonly number[]) =>
	values.reduce((total, value) => total + value, 0);

/**
 * F04's month view for `month` (section 3, BR-F04-10, BR-F04-11, BR-F04-34), from the user's
 * Budgets and the category spending of `month` and the month before. Pure, so `budgetMonth`,
 * the history, the year summary and the tests compute every figure the same way.
 */
export function buildMonthView(input: {
	month: Month;
	budgets: readonly BudgetRecord[];
	spending: CategorySpending;
	previousSpending: CategorySpending;
}): MonthView {
	const { month, budgets, spending } = input;
	const rows = budgetRows(budgets, spending, month);
	const budgeted = new Set(rows.map((row) => row.category));
	const limitMinor = sum(rows.map((row) => row.limitMinor));
	const spentMinor = sum(rows.map((row) => row.spentMinor));
	const overallTenths =
		rows.length === 0 ? null : utilizationTenths(spentMinor, limitMinor);
	const totalSpentMinor = sum(
		EXPENSE_CATEGORIES.map((category) => spentIn(spending, category)),
	);
	const recordOf = new Map(budgets.map((budget) => [budget.category, budget]));

	const unbudgeted = EXPENSE_CATEGORIES.filter(
		(category) => !budgeted.has(category) && spentIn(spending, category) !== 0,
	)
		.map((category) => ({
			category,
			spentMinor: spentIn(spending, category),
			budgetId: recordOf.get(category)?.id ?? null,
		}))
		.sort(
			(a, b) =>
				b.spentMinor - a.spentMinor
				|| categoryOrder(a.category) - categoryOrder(b.category),
		);

	const inactive = budgets
		.flatMap((budget) => {
			const status = inactiveStatus(budget, month);
			return status ? [{ ...budget, ...status }] : [];
		})
		.sort((a, b) =>
			compareCodeUnits(
				CATEGORY_LABELS[a.category],
				CATEGORY_LABELS[b.category],
			),
		);

	const previousMonth = shiftMonth(month, -1);
	const previousRows = budgetRows(budgets, input.previousSpending, previousMonth);

	return {
		month,
		overall: {
			limitMinor,
			spentMinor,
			utilizationTenths: overallTenths,
			state: overallTenths === null ? null : budgetState(overallTenths),
		},
		totalSpentMinor,
		unbudgetedMinor: totalSpentMinor - spentMinor,
		unbudgeted,
		budgets: rows,
		inactive,
		previous: {
			month: previousMonth,
			limitMinor: sum(previousRows.map((row) => row.limitMinor)),
			spentMinor: sum(previousRows.map((row) => row.spentMinor)),
			budgetCount: previousRows.length,
			overCount: previousRows.filter((row) => row.state === "over").length,
		},
	};
}
