"use client";

import { cn } from "@/lib/cn";
import type { MonthItem } from "@/lib/subscriptions/model";
import { chipColor } from "../lib/calendar";

export type ChipDotProps = {
	item: MonthItem;
	className?: string;
};

/** The dot before a name: filled when charged, a ring when due, skipped or paused, dashed when
 * the Subscription is waiting to sync (BR-F05-38). The kind is in the button's name too. */
export function ChipDot({ item, className }: Readonly<ChipDotProps>) {
	const filled = item.kind === "charged";
	return (
		<span
			aria-hidden="true"
			className={cn(
				"box-border size-2 flex-none rounded-full",
				!filled && "bg-page border-[1.5px]",
				!filled
					&& (item.kind === "pending" ? "border-dashed" : "border-solid"),
				className,
			)}
			style={
				filled ?
					{ background: chipColor(item.category) }
				:	{ borderColor: chipColor(item.category) }
			}
		/>
	);
}
