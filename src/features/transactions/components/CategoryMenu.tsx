"use client";

import { Choice } from "@/components/forms/Choice";
import { FilterPopover } from "@/components/forms/FilterPopover";
import {
	type CategoryKey,
	categoryLabel,
	EXPENSE_CATEGORIES,
	INCOME_CATEGORIES,
} from "@/lib/categories";
import { choiceSummary } from "../lib/filter-labels";
import { FILTER_TEXT } from "../lib/messages";

export type CategoryMenuProps = {
	/** The committed categories; none filters nothing. */
	value: readonly CategoryKey[] | undefined;
	/** A new set of categories, none to drop the filter, committed at once. */
	onChange: (value: CategoryKey[] | undefined) => void;
	/** Each category's count under every other filter (BR-F03-59), once loaded. */
	counts?: Record<CategoryKey, number> | undefined;
	/** Whether the counts are on their way, so each holds its place. */
	countsPending?: boolean;
	onOpenChange?: (isOpen: boolean) => void;
	className?: string;
};

/**
 * The Category control (BR-F03-39): a trigger reading "Category Any", a category's name or how
 * many are chosen, opening the expense categories under "Expense", then the income categories
 * under "Income",
 * each a checkbox with its count. A line says category filters hide Goal Transactions
 * (BR-F03-37). Each press commits, and the popover stays open.
 */
export function CategoryMenu({
	value,
	onChange,
	counts,
	countsPending = false,
	onOpenChange,
	className,
}: Readonly<CategoryMenuProps>) {
	const chosen = value ?? [];
	const toggle = (category: CategoryKey, on: boolean) => {
		const next =
			on ?
				[...chosen, category]
			:	chosen.filter((other) => other !== category);
		onChange(next.length ? next : undefined);
	};
	const list = (label: string, categories: readonly CategoryKey[]) => (
		<div
			role="group"
			aria-label={label}
			className="flex flex-col gap-0.5 px-1"
		>
			{categories.map((category) => (
				<Choice
					key={category}
					label={categoryLabel(category)}
					isSelected={chosen.includes(category)}
					onChange={(on) => toggle(category, on)}
					{...(counts ? { count: counts[category] } : {})}
					countPending={countsPending}
				/>
			))}
		</div>
	);
	return (
		<FilterPopover
			label="Category"
			value={choiceSummary(value, categoryLabel)}
			isActive={chosen.length > 0}
			width="md"
			{...(onOpenChange ? { onOpenChange } : {})}
			{...(className ? { className } : {})}
		>
			<p
				aria-hidden="true"
				className="text-caption text-ink-2 px-1 font-semibold"
			>
				Expense
			</p>
			{list("Expense categories", EXPENSE_CATEGORIES)}
			<p
				aria-hidden="true"
				className="text-caption text-ink-2 mt-1.5 px-1 font-semibold"
			>
				Income
			</p>
			{list("Income categories", INCOME_CATEGORIES)}
			<p className="text-caption text-ink-3 mt-1.5 px-1">
				{FILTER_TEXT.categoryNote}
			</p>
		</FilterPopover>
	);
}
