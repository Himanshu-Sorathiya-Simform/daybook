"use client";

import { Button as AriaButton } from "react-aria-components";

import { cn } from "@/lib/cn";
import type { MonthItem } from "@/lib/subscriptions/model";
import { chipAmount, chipLabel, isStruck } from "../lib/calendar";
import type { Formats } from "../lib/labels";
import { ChipDot } from "./ChipDot";

export type ChargeChipProps = {
	item: MonthItem;
	formats: Formats;
	/** Selects the item's Subscription (BR-F05-38). */
	onSelect: (item: MonthItem) => void;
	/** The item is the one the panel's timeline marks. */
	isMarked?: boolean;
	className?: string;
};

/**
 * One item of a day in the grid (BR-F05-38): the category dot, the name over the amount in whole
 * units, struck through when skipped or paused. Its name is "Netflix, ₹649.00, due". Pressing it
 * selects its Subscription.
 */
export function ChargeChip({
	item,
	formats,
	onSelect,
	isMarked = false,
	className,
}: Readonly<ChargeChipProps>) {
	const struck = isStruck(item.kind);
	return (
		<AriaButton
			aria-label={chipLabel(item, formats)}
			onPress={() => onSelect(item)}
			className={cn(
				"rounded-chip text-small figures -mx-1 flex min-h-7 w-[calc(100%+0.5rem)] min-w-0 cursor-pointer items-start gap-1.25 px-1 py-px text-left transition-colors duration-(--dur-fast) ease-out",
				isMarked ?
					"bg-accent-soft font-semibold"
				:	"hover:bg-soft font-medium",
				struck ? "text-ink-3" : "text-ink",
				"focus-visible:focus-ring",
				className,
			)}
		>
			<ChipDot
				item={item}
				className="mt-1"
			/>
			<span
				aria-hidden="true"
				className="flex min-w-0 flex-col leading-tight"
			>
				<span className={cn("truncate", struck && "line-through")}>
					{item.name}
				</span>
				<span
					className={cn(
						struck ? "text-ink-3" : "text-ink-2",
						struck && "line-through",
					)}
				>
					{chipAmount(item, formats)}
				</span>
			</span>
		</AriaButton>
	);
}
