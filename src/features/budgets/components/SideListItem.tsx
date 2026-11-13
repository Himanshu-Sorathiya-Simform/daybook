"use client";

import type { ReactNode } from "react";
import { GridListItem as AriaGridListItem } from "react-aria-components";

import { CategoryTag } from "@/components/data/CategoryTag";
import type { ExpenseCategory } from "@/lib/budgets/model";
import { categoryLabel } from "@/lib/categories";
import { cn } from "@/lib/cn";

export type SideListItemProps = {
	/** The row's id in its list, unique there: `unbudgeted:food` or `inactive:food`. */
	id: string;
	category: ExpenseCategory;
	/** The line under the category: "No limit in October" or "Starts October 2026". */
	caption: string;
	/** The month's spending in the category, already formatted, for a Not budgeted row. */
	amount?: string;
	/** The row's buttons: Add a Budget or Change limit, or Change limit and Delete. */
	actions: ReactNode;
	className?: string;
};

/**
 * A category with no limit in the month (BR-F04-15): under Not budgeted with its spending, or
 * under Not active this month with why. Selecting it shows it in the panel; its buttons act
 * without selecting it. React Aria names the row by its text value.
 */
export function SideListItem({
	id,
	category,
	caption,
	amount,
	actions,
	className,
}: Readonly<SideListItemProps>) {
	return (
		<AriaGridListItem
			id={id}
			textValue={[categoryLabel(category), caption, amount]
				.filter(Boolean)
				.join(", ")}
			className={cn(
				"rounded-control focus-visible:focus-ring hover:bg-soft selected:bg-accent-soft -mx-3 flex min-h-14 cursor-pointer items-center gap-2 px-3 py-1 outline-none",
				"transition-colors duration-(--dur-fast) ease-out",
				className,
			)}
		>
			<div className="flex min-w-0 flex-1 flex-col gap-0.5">
				<CategoryTag category={category} />
				<span className="text-caption text-ink-3">{caption}</span>
			</div>
			{amount !== undefined && (
				<span className="text-body figures font-semibold whitespace-nowrap">
					{amount}
				</span>
			)}
			<div className="flex shrink-0 items-center gap-1">{actions}</div>
		</AriaGridListItem>
	);
}
