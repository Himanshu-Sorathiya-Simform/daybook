"use client";

import type { ExpenseCategory } from "@/lib/budgets/model";
import type { Month } from "@/lib/budgets/months";
import type { BudgetChange, BudgetPreview } from "@/lib/budgets/preview";
import { BUDGET_MESSAGES } from "@/lib/budgets/schemas";
import { type DialogScope, nothingChanges } from "../lib/dialog";
import type { Formats } from "../lib/labels";
import type { Figures } from "../lib/preview";
import { ChangeNotes } from "./ChangeNotes";
import { FormAlert } from "@/components/feedback/FormAlert";
import { WhatChanges } from "./WhatChanges";

export type BudgetChangeSummaryProps = {
	category: ExpenseCategory | null;
	scope: DialogScope;
	month: Month;
	current: Month;
	formats: Formats;
	/** The change as typed, and what it would do; `null` until there is a category and a limit. */
	change: BudgetChange | null;
	preview: BudgetPreview | null;
	figures: Figures;
	/** A stop that would remove every month (BR-F04-21, BR-F04-27). */
	blocked: boolean;
	/** A change that would change nothing (BR-F04-26). */
	unchanged: boolean;
};

/**
 * What the Budget dialog says of the change it would make, under its fields (BR-F04-26,
 * BR-F04-27): "What changes", the refusal of a stop that removes every month, "Nothing
 * changes.", and the notes under the cards, in that order.
 */
export function BudgetChangeSummary({
	category,
	scope,
	month,
	current,
	formats,
	change,
	preview,
	figures,
	blocked,
	unchanged,
}: Readonly<BudgetChangeSummaryProps>) {
	const context = category === null ? null : { category, current, formats };
	const shown = change && preview && !preview.blocked && context ? preview : null;
	return (
		<>
			{shown && change && context && (
				<WhatChanges
					preview={shown}
					change={change}
					context={context}
					figures={figures}
				/>
			)}
			{blocked && (
				<FormAlert>{BUDGET_MESSAGES.stopRemovesEveryMonth}</FormAlert>
			)}
			{unchanged && category !== null && (
				<p className="text-body text-ink-2">
					{nothingChanges(category, scope, month, formats)}
				</p>
			)}
			{!unchanged && shown && change && context && (
				<ChangeNotes
					notes={shown.notes}
					change={change}
					context={context}
				/>
			)}
		</>
	);
}
