import {
	type BudgetRules,
	type ExpenseCategory,
	limitIn,
} from "@/lib/budgets/model";
import {
	type BudgetChange,
	type BudgetPreview,
	previewChange,
} from "@/lib/budgets/preview";
import { type Month, monthsStarting } from "@/lib/budgets/months";
import { buildMonthView } from "@/lib/budgets/view";
import {
	goldenBudget,
	goldenBudgets,
	goldenSpending,
} from "@/lib/budgets/__tests__/golden";
import { shiftMonth } from "@/lib/budgets/months";
import type {
	BudgetAnswer,
	BudgetHistoryAnswer,
	BudgetMonthAnswer,
	PayeeSummaryAnswer,
} from "../types";

/** A golden Budget as the API answers it, with `changes` over it. */
export function budgetAnswer(
	category: ExpenseCategory,
	changes: Partial<BudgetAnswer> = {},
): BudgetAnswer {
	return {
		...goldenBudget(category),
		createdAt: "2026-09-01T06:30:00.000Z",
		updatedAt: "2026-10-01T06:30:00.000Z",
		currency: "INR",
		...changes,
	};
}

/** Golden's month view for `month`, as `GET /api/budgets` answers it. */
export function monthAnswer(
	month: Month,
	budgets = goldenBudgets(),
): BudgetMonthAnswer {
	return {
		...buildMonthView({
			month,
			budgets,
			spending: goldenSpending(month),
			previousSpending: goldenSpending(shiftMonth(month, -1)),
		}),
		currency: "INR",
	};
}

/** F03's summary of October food with `by=payee`: golden's three food payees (F04 section 5),
 * then three more so the panel's top 3 has something to cut. */
export function payeeSummary(
	changes: Partial<PayeeSummaryAnswer> = {},
): PayeeSummaryAnswer {
	return {
		count: 4,
		incomeMinor: 0,
		spendingMinor: 622000,
		toGoalsMinor: 0,
		firstOn: "2026-10-04",
		lastOn: "2026-10-26",
		byPayee: [
			{ key: "bigbasket", label: "BigBasket", count: 1, outMinor: 290000 },
			{ key: "zomato", label: "Zomato", count: 2, outMinor: 230000 },
			{ key: "swiggy", label: "Swiggy", count: 1, outMinor: 102000 },
			{ key: "cafe", label: "Cafe", count: 1, outMinor: 50000 },
			{ key: "bakery", label: "Bakery", count: 1, outMinor: 30000 },
			{ key: "tea", label: "Tea", count: 1, outMinor: 10000 },
		],
		currency: "INR",
		...changes,
	};
}

/** Golden's history of `category` over `months` months ending at `to`, as
 * `GET /api/budgets/history` answers it (BR-F04-35). */
export function historyAnswer(
	category: ExpenseCategory,
	to: Month,
	months = 6,
): BudgetHistoryAnswer {
	const budget = goldenBudgets().find((each) => each.category === category);
	return {
		category,
		currency: "INR",
		months: monthsStarting(shiftMonth(to, 1 - months), months).map((month) => ({
			month,
			limitMinor: budget ? limitIn(budget, month) : null,
			spentMinor: goldenSpending(month)[category] ?? 0,
		})),
	};
}

/** The preview of a change over a golden Budget (or `rules`), with golden's spending and its
 * November 2026 as the current month, which is never blocked here. */
export function goldenPreview(
	category: ExpenseCategory,
	change: BudgetChange,
	rules: BudgetRules | null = goldenBudget(category),
	spending: (month: Month) => number = (month) =>
		goldenSpending(month)[category] ?? 0,
): Extract<BudgetPreview, { blocked: false }> {
	const result = previewChange({ rules, change, spending, current: "2026-11" });
	if (result.blocked) throw new Error("The preview is blocked.");
	return result;
}
