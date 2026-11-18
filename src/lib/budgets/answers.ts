import type { CurrencyCode } from "@/lib/currency";
import type { ExpenseCategory } from "./model";
import type { Month } from "./months";
import type { BudgetRecord, MonthView } from "./view";

/** A Budget as the API answers it (F04 section 3). */
export type Budget = BudgetRecord & { createdAt: string; updatedAt: string };

/** A month view with the profile currency, as `GET /api/budgets` answers it (API-6). */
export type BudgetMonthAnswer = MonthView & { currency: CurrencyCode };

export type BudgetHistory = {
	category: ExpenseCategory;
	currency: CurrencyCode;
	months: { month: Month; limitMinor: number | null; spentMinor: number }[];
};

export type BudgetYearSummary = {
	year: number;
	months: { month: Month; utilizationTenths: number | null }[];
};
