"use client";

import { EmptyState } from "@/components/feedback/EmptyState";
import { FilterChips } from "@/components/forms/FilterChips";
import { STATE_LABELS, type StateLabel } from "@/lib/budgets/model";
import type { Month } from "@/lib/budgets/months";
import { cn } from "@/lib/cn";
import { filterEmptyText, type Formats, LIST_TEXT } from "../lib/labels";

export type BudgetsFilterProps = {
	/** The state the rows are filtered to. */
	filter: StateLabel;
	/** Whether no row is in that state: the empty text shows. */
	isEmpty: boolean;
	month: Month;
	formats: Formats;
	onFilterChange: (filter: StateLabel | null) => void;
	className?: string;
};

/**
 * What the list and the table show above their rows while a state count filters them
 * (BR-F04-31): "Showing" with the chip "Over budget", whose remove button and Show all clear the
 * filter; with no row in that state, "No Budgets are over budget in October 2026." and Show all
 * Budgets.
 */
export function BudgetsFilter({
	filter,
	isEmpty,
	month,
	formats,
	onFilterChange,
	className,
}: Readonly<BudgetsFilterProps>) {
	return (
		<div className={cn("flex flex-col", className)}>
			<div className="flex flex-wrap items-center gap-2 pt-3">
				<span className="text-label text-ink-2">{LIST_TEXT.showing}</span>
				<FilterChips
					label={LIST_TEXT.showing}
					chips={[{ id: filter, label: STATE_LABELS[filter] }]}
					onRemove={() => onFilterChange(null)}
					onClearAll={() => onFilterChange(null)}
					clearAllLabel={LIST_TEXT.showAll}
				/>
			</div>
			{isEmpty && (
				<EmptyState
					title={filterEmptyText(filter, month, formats)}
					action={LIST_TEXT.showAllBudgets}
					onAction={() => onFilterChange(null)}
				/>
			)}
		</div>
	);
}
