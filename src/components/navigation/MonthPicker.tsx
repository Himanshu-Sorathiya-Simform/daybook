"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import type { ReactNode } from "react";
import {
	Button as AriaButton,
	Dialog as AriaDialog,
	DialogTrigger as AriaDialogTrigger,
	Popover as AriaPopover,
} from "react-aria-components";

import { IconButton } from "@/components/actions/IconButton";
import { cn } from "@/lib/cn";

export type MonthPickerProps = {
	/** For example "October 2026", or "November 2026 · to date" for the current month. */
	label: string;
	canPrev?: boolean;
	canNext?: boolean;
	onPrev?: () => void;
	onNext?: () => void;
	/** Reports a press on the month. */
	onOpen?: () => void;
	/** The month grid, in a popover from the month. As a function it gets `close`, for a choice
	 * that closes it. Without it, the month only reports its press through `onOpen`. */
	grid?: ReactNode | ((close: () => void) => ReactNode);
	/** The popover's name for screen readers. */
	gridLabel?: string;
	/** Whether the popover is open, for a page that closes it itself, as Escape on the Budgets
	 * page does (BR-F04-32). */
	isGridOpen?: boolean;
	onGridOpenChange?: (isOpen: boolean) => void;
	/** Fills its row: the month takes the room between the arrows, outlined, with 44px arrows
	 * (BR-F04-14). `"phone"` does so only below 768px (D-512), where every arrow is 44px
	 * already, so one control serves both layouts. */
	stretch?: boolean | "phone";
	className?: string;
};

/**
 * The month control of the Dashboard, Budgets and Insights: previous, the month, next. An arrow
 * that cannot go further stays focusable and is marked disabled, so a keyboard user who reaches
 * the current month does not lose their place. With a `grid`, the month opens it in a popover:
 * a non-modal dialog that takes focus, keeps Tab inside, and closes on Escape or a press
 * outside, putting focus back on the month.
 */
export function MonthPicker({
	label,
	canPrev = true,
	canNext = true,
	onPrev,
	onNext,
	onOpen,
	grid,
	gridLabel = "Choose a month",
	isGridOpen,
	onGridOpenChange,
	stretch = false,
	className,
}: Readonly<MonthPickerProps>) {
	const month = (
		<AriaButton
			aria-haspopup="dialog"
			{...(onOpen ? { onPress: onOpen } : {})}
			className={cn(
				"rounded-control text-body text-ink hover:bg-soft h-9 cursor-pointer px-2.5 font-semibold whitespace-nowrap transition-colors duration-(--dur-fast) ease-out max-md:min-h-11",
				"aria-expanded:bg-accent-soft",
				stretch === true
					&& "border-edge bg-page min-w-0 flex-1 truncate border",
				stretch === "phone"
					&& "max-md:border-edge max-md:bg-page max-md:min-w-0 max-md:flex-1 max-md:truncate max-md:border",
			)}
		>
			{label}
		</AriaButton>
	);
	return (
		<div
			className={cn(
				"items-center gap-1.5",
				stretch === true ? "flex w-full" : "inline-flex",
				stretch === "phone" && "max-md:flex max-md:w-full",
				className,
			)}
		>
			<IconButton
				icon={ChevronLeft}
				label="Previous month"
				isDisabled={!canPrev}
				{...(stretch === true ? { size: "lg" as const } : {})}
				{...(onPrev ? { onPress: onPrev } : {})}
			/>
			{grid === undefined ?
				month
			:	<AriaDialogTrigger
					{...(isGridOpen === undefined ? {} : { isOpen: isGridOpen })}
					{...(onGridOpenChange ? { onOpenChange: onGridOpenChange } : {})}
				>
					{month}
					<AriaPopover
						placement="bottom"
						offset={6}
						className={cn(
							"border-line bg-page shadow-popover rounded-section z-50 w-84 max-w-[calc(100vw-2rem)] overflow-auto border",
							"entering:opacity-0 exiting:opacity-0 transition-opacity duration-(--dur-fast) ease-out",
						)}
					>
						<AriaDialog
							aria-label={gridLabel}
							className="flex flex-col gap-2 p-3 outline-none"
						>
							{({ close }) =>
								typeof grid === "function" ? grid(close) : grid
							}
						</AriaDialog>
					</AriaPopover>
				</AriaDialogTrigger>
			}
			<IconButton
				icon={ChevronRight}
				label="Next month"
				isDisabled={!canNext}
				{...(stretch === true ? { size: "lg" as const } : {})}
				{...(onNext ? { onPress: onNext } : {})}
			/>
		</div>
	);
}
