"use client";

import { FilterChips } from "@/components/forms/FilterChips";
import { cn } from "@/lib/cn";
import type { ExpenseCategory } from "@/lib/subscriptions/model";
import { categoryChip, FILTER_TEXT } from "../lib/category-filter";

export type CategoryFilterRowProps = {
	/** The category the rows are narrowed to. */
	category: ExpenseCategory;
	/** Clears the filter: the chip's remove button and Show all (BR-F05-50). */
	onClear: () => void;
	className?: string;
};

/** "Showing" with the category as a chip, and Show all, above the rows the filter narrows: the
 * list's and the table's (BR-F05-50, D-627). */
export function CategoryFilterRow({
	category,
	onClear,
	className,
}: Readonly<CategoryFilterRowProps>) {
	return (
		<div className={cn("flex flex-wrap items-center gap-2 pt-3", className)}>
			<span className="text-label text-ink-2">{FILTER_TEXT.showing}</span>
			<FilterChips
				label={FILTER_TEXT.showing}
				chips={[{ id: category, label: categoryChip(category) }]}
				onRemove={onClear}
				onClearAll={onClear}
				clearAllLabel={FILTER_TEXT.showAll}
			/>
		</div>
	);
}
