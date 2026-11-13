"use client";

import { GridListItem as AriaGridListItem } from "react-aria-components";

import { BudgetBar } from "@/components/data/BudgetBar";
import { CategoryTag } from "@/components/data/CategoryTag";
import { STATE_LABELS, stateLabel } from "@/lib/budgets/model";
import { categoryLabel } from "@/lib/categories";
import { cn } from "@/lib/cn";
import {
	type Formats,
	headline,
	rowFigures,
	sourceText,
	spentOfLimit,
	STATE_TONES,
} from "../lib/labels";
import type { BudgetMonthAnswer } from "../lib/types";

export type BudgetListItemProps = {
	row: BudgetMonthAnswer["budgets"][number];
	formats: Formats;
	/** Today's share of the month, in the current month only: the bar's marker. */
	todayShare?: number;
	className?: string;
};

/**
 * One Budget in the list (BR-F04-16): the category and the headline in the state's colour;
 * the bar; "₹6,220.00 of ₹5,000.00 · 124.4% · Over budget", the state in words as well as
 * colour; and the limit's source. React Aria names the row by its text value, so that holds the
 * whole reading, the category first.
 */
export function BudgetListItem({
	row,
	formats,
	todayShare,
	className,
}: Readonly<BudgetListItemProps>) {
	const label = stateLabel(row.utilizationTenths);
	const tone = STATE_TONES[label];
	const top = headline(row.remainingMinor, formats);
	const source = sourceText(row.source, row.next, formats);
	return (
		<AriaGridListItem
			id={`budget:${row.category}`}
			textValue={[
				categoryLabel(row.category),
				top,
				rowFigures(row, formats),
				source,
			].join(", ")}
			className={cn(
				"rounded-control focus-visible:focus-ring hover:bg-soft selected:bg-accent-soft -mx-3 flex cursor-pointer flex-col gap-2.25 px-3 py-3 outline-none",
				"transition-colors duration-(--dur-fast) ease-out",
				className,
			)}
		>
			<div className="flex flex-wrap items-center gap-2.5">
				<CategoryTag category={row.category} />
				<span className="flex-1" />
				<span
					className={cn(
						"text-body figures font-semibold whitespace-nowrap",
						tone,
					)}
				>
					{top}
				</span>
			</div>
			<BudgetBar
				utilizationTenths={row.utilizationTenths}
				{...(todayShare === undefined ? {} : { todayShare })}
			/>
			<div className="text-caption text-ink-2 figures flex flex-wrap items-baseline gap-x-3 gap-y-1">
				<span>
					{spentOfLimit(row, formats)} ·{" "}
					<span className={cn("font-semibold", tone)}>
						{STATE_LABELS[label]}
					</span>
				</span>
				<span className="flex-1" />
				<span className="text-ink-3">{source}</span>
			</div>
		</AriaGridListItem>
	);
}
