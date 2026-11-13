import type { ExpenseCategory } from "@/lib/budgets/model";
import type { Month } from "@/lib/budgets/months";
import { buildMonthView } from "@/lib/budgets/view";
import {
	goldenBudget,
	goldenBudgets,
	goldenSpending,
} from "@/lib/budgets/__tests__/golden";
import { shiftMonth } from "@/lib/budgets/months";
import type { BudgetAnswer, BudgetMonthAnswer, PayeeSummaryAnswer } from "../types";

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
export function monthAnswer(month: Month): BudgetMonthAnswer {
	return {
		...buildMonthView({
			month,
			budgets: goldenBudgets(),
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
