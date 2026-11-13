import { useQuery } from "@tanstack/react-query";

import type { ExpenseCategory } from "@/lib/budgets/model";
import type { Month } from "@/lib/budgets/months";
import type { CurrencyCode } from "@/lib/currency";
import { payeeSummaryOptions, TOP_PAYEES } from "../lib/queries";
import type { PayeeSummaryAnswer } from "../lib/types";

/** The panel's "Where it went": the top payees by net spending and the number for "See 4
 * Transactions". */
export type BudgetPayees = {
	payees: NonNullable<PayeeSummaryAnswer["byPayee"]>;
	count: number;
};

const topPayees = (answer: PayeeSummaryAnswer): BudgetPayees => ({
	payees: (answer.byPayee ?? []).slice(0, TOP_PAYEES),
	count: answer.count,
});

/** "Where it went in October" for one category (BR-F04-30), from F03's summary with
 * `by=payee`, whose groups come largest first. With no category selected, it asks for
 * nothing. */
export function useBudgetPayees(
	category: ExpenseCategory | null,
	month: Month,
	currency: CurrencyCode,
) {
	return useQuery({
		...payeeSummaryOptions({ category, month, currency }),
		select: topPayees,
	});
}
