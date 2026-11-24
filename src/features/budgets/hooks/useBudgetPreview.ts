import type { ExpenseCategory } from "@/lib/budgets/model";
import { type Month, monthRange } from "@/lib/budgets/months";
import {
	type BudgetChange,
	type BudgetPreview,
	previewChange,
} from "@/lib/budgets/preview";
import type { BudgetRecord } from "@/lib/budgets/view";
import { type DialogKind, limitOf, type DialogScope } from "../lib/dialog";
import { type Figures, figuresOf, historyWindow } from "../lib/preview";
import { useBudgetHistory } from "./useBudgetHistory";

export type BudgetPreviewInput = {
	kind: DialogKind;
	category: ExpenseCategory | null;
	/** The limit as typed, read by the amount rules. */
	typed: Parameters<typeof limitOf>[1];
	scope: DialogScope;
	month: Month;
	/** The Budget record the change is made over, or `null` for a category with none. */
	record: BudgetRecord | null;
	current: Month;
};

/**
 * "What changes" for the dialog as it stands (BR-F04-26): the change as typed, over the Budget
 * record if there is one, with the spending of the months it lists. A category with no record
 * always applies from a month. `limit` is the new limit, `null` for a stop and `undefined`
 * while the typed one is not valid; `change` and `preview` are `null` until there is a category
 * and a limit; `figures` says whether the spending is in, still loading or missing.
 */
export function useBudgetPreview({
	kind,
	category,
	typed,
	scope,
	month,
	record,
	current,
}: BudgetPreviewInput): {
	limit: number | null | undefined;
	change: BudgetChange | null;
	preview: BudgetPreview | null;
	figures: Figures;
} {
	const limit = limitOf(kind, typed);
	const change: BudgetChange | null =
		category !== null && limit !== undefined ?
			{
				scope: scope === "month" ? "month" : "from",
				month,
				limitMinor: limit,
			}
		:	null;
	const window =
		change && historyWindow(change, current, monthRange(current).last);
	const spending = useBudgetHistory(
		change ? category : null,
		window?.to ?? current,
		window?.months,
	);
	const spentIn = new Map(
		spending.data?.months.map((each) => [each.month, each.spentMinor]),
	);
	return {
		limit,
		change,
		figures: figuresOf(spending),
		preview:
			change ?
				previewChange({
					rules: record,
					change,
					spending: (each) => spentIn.get(each) ?? 0,
					current,
				})
			:	null,
	};
}
