import { useState } from "react";

import { formatAmountInput } from "@/lib/amount";
import type { ExpenseCategory } from "@/lib/subscriptions/model";
import type { PayeeItem } from "@/lib/transactions/answers";
import { filledHint } from "../lib/dialog";
import type { SubscriptionsLocale } from "../lib/types";

/** What choosing a payee fills in. */
export type PayeeFill = {
	name: string;
	category: ExpenseCategory;
	amount: string;
};

/** A payee chosen from the list, and what it filled, so the hint goes once any of them
 * changes (BR-F05-24, D-594). */
type Filled = PayeeFill & { amountMinor: number };

/**
 * Add's "Payees you've paid" (BR-F05-24, D-594): choosing one fills the category and the amount
 * of its last expense, through `onFill`, and `hint` says so, "Filled from your last Netflix
 * expense: Entertainment, ₹649.00.", until the name, the category or the amount changes. A
 * payee with no expense fills nothing.
 */
export function usePayeeFill({
	values,
	locale,
	onFill,
}: {
	/** The fields as they stand. */
	values: { name: string; category: ExpenseCategory | null; amount: string };
	locale: SubscriptionsLocale;
	onFill: (fill: PayeeFill) => void;
}) {
	const [filled, setFilled] = useState<Filled | null>(null);
	const standing =
		(
			filled !== null
			&& values.name === filled.name
			&& values.category === filled.category
			&& values.amount === filled.amount
		) ?
			filled
		:	null;

	const choose = ({ payee, lastExpense }: PayeeItem) => {
		if (lastExpense === null) return;
		const fill = {
			name: payee,
			category: lastExpense.category as ExpenseCategory,
			amount: formatAmountInput(lastExpense.amountMinor, locale),
		};
		onFill(fill);
		setFilled({ ...fill, amountMinor: lastExpense.amountMinor });
	};

	return {
		choose,
		hint: standing ? filledHint(standing.name, standing, locale) : undefined,
	};
}
