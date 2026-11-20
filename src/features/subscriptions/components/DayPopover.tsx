"use client";

import {
	Button as AriaButton,
	Dialog as AriaDialog,
	DialogTrigger as AriaDialogTrigger,
	Popover as AriaPopover,
} from "react-aria-components";

import { cn } from "@/lib/cn";
import type { MonthItem } from "@/lib/subscriptions/model";
import { CALENDAR_TEXT, dayPopover, type GridDay, isStruck } from "../lib/calendar";
import type { Formats } from "../lib/labels";
import { ChipDot } from "./ChipDot";

export type DayPopoverProps = {
	day: GridDay;
	formats: Formats;
	/** Selects an item's Subscription; the popover closes with it. */
	onSelect: (item: MonthItem) => void;
	className?: string;
};

/**
 * "+2 more · ₹20,149" and the popover it opens (BR-F05-38): named by the day, "Thu, 5 Nov", with
 * the day's total, then every item with its name, "Entertainment · due" and its amount, and
 * "Select one to open it in the panel." A non-modal dialog that takes focus; Escape or a press
 * outside closes it, and nothing else.
 */
export function DayPopover({
	day,
	formats,
	onSelect,
	className,
}: Readonly<DayPopoverProps>) {
	const popover = dayPopover(day, formats);
	return (
		<AriaDialogTrigger>
			<AriaButton
				className={cn(
					"text-accent text-small figures cursor-pointer truncate py-0.5 text-left font-semibold hover:underline",
					"focus-visible:focus-ring rounded-chip",
					className,
				)}
			>
				{day.moreText}
			</AriaButton>
			<AriaPopover
				placement="bottom start"
				offset={6}
				className={cn(
					"border-line bg-page shadow-popover rounded-section z-50 w-77.5 max-w-[calc(100vw-2rem)] overflow-auto border",
					"entering:opacity-0 exiting:opacity-0 transition-opacity duration-(--dur-fast) ease-out",
				)}
			>
				<AriaDialog
					aria-label={popover.title}
					className="flex flex-col gap-0.5 px-3 py-2.5 outline-none"
				>
					{({ close }) => (
						<>
							<div className="border-line flex items-baseline border-b pb-1.5">
								<span className="text-label text-ink font-semibold">
									{popover.title}
								</span>
								<span className="flex-1" />
								<span className="text-label text-ink-2 figures">
									{popover.total}
								</span>
							</div>
							{popover.entries.map(({ item, caption, amount }) => (
								<AriaButton
									key={`${item.subscriptionId ?? item.chargeId} ${item.kind}`}
									onPress={() => {
										close();
										onSelect(item);
									}}
									className="rounded-control hover:bg-soft focus-visible:focus-ring flex min-h-11 cursor-pointer items-center gap-2.5 px-1 text-left"
								>
									<ChipDot item={item} />
									<span className="flex min-w-0 flex-1 flex-col">
										<span
											className={cn(
												"text-label text-ink truncate font-medium",
												isStruck(item.kind)
													&& "line-through",
											)}
										>
											{item.name}
										</span>
										<span className="text-small text-ink-3">
											{caption}
										</span>
									</span>
									<span className="text-label text-ink figures font-semibold">
										{amount}
									</span>
								</AriaButton>
							))}
							<span className="text-small text-ink-3 border-line border-t pt-1.5">
								{CALENDAR_TEXT.popoverHint}
							</span>
						</>
					)}
				</AriaDialog>
			</AriaPopover>
		</AriaDialogTrigger>
	);
}
