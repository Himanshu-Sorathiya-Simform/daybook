import type { CurrencyCode } from "@/lib/currency";
import type { Budget } from "@/server/dal/budgets/row";
import type { SummaryAnswer } from "@/server/dal/transactions/answers";

export type {
	BudgetHistory as BudgetHistoryAnswer,
	BudgetMonthAnswer,
	BudgetYearSummary as BudgetYearAnswer,
} from "@/server/dal/budgets/read";

/** The answers of F04 section 11's reads and writes, as the routes send them. The types come
 * from the data access layer that builds each answer, so the two cannot drift. */
export type BudgetAnswer = Budget & { currency: CurrencyCode };

/** F03's summary for one category and month with `by=payee`, which the panel's "Where it
 * went" reads (BR-F04-30). */
export type PayeeSummaryAnswer = SummaryAnswer;
