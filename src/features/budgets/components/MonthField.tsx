"use client";

import { useEffect, useRef, useState } from "react";
import { Dialog as AriaDialog, Popover as AriaPopover } from "react-aria-components";

import { ToggleChips } from "@/components/forms/ToggleChips";
import { MonthGrid } from "@/components/navigation/MonthGrid";
import { type Month, monthRange } from "@/lib/budgets/months";
import { cn } from "@/lib/cn";
import { DIALOG_TEXT, monthChips, rangeCaption } from "../lib/dialog";
import type { Formats } from "../lib/labels";

export type MonthFieldProps = {
	/** "Apply from", "Stop from" or "Month". */
	label: string;
	value: Month;
	onChange: (month: Month) => void;
	/** The profile's current month: the chips count from it, and the range around it. */
	current: Month;
	/** The month the page shows, a chip of its own when it is neither this month nor next. */
	viewed: Month;
	formats: Formats;
	isDisabled?: boolean;
	className?: string;
};

/**
 * A dialog's month (BR-F04-28): chips for this month, next month, the viewed month and a month
 * picked in the grid, and "Other month", which opens the month grid, without figures, in a
 * popover under the chips, captioned with the range it allows (BR-F04-07), so the dialog keeps
 * its layout. Picking a month in the grid closes it and shows that month as its own chosen chip;
 * Escape or a press outside closes it alone, and focus goes back to the chosen chip.
 */
export function MonthField({
	label,
	value,
	onChange,
	current,
	viewed,
	formats,
	isDisabled = false,
	className,
}: Readonly<MonthFieldProps>) {
	const [isGridOpen, setGridOpen] = useState(false);
	// Each close of the grid hands focus back to the chosen chip, as the grid's month goes.
	const [closes, setCloses] = useState(0);
	const root = useRef<HTMLDivElement>(null);
	const chipsRef = useRef<HTMLDivElement>(null);
	useEffect(() => {
		if (closes === 0) return;
		// A frame later, after the dialog's focus trap has answered the grid leaving. Focus
		// coming into the chips goes to the one last focused, so the chosen one is focused again
		// from there.
		const frame = requestAnimationFrame(() => {
			// One chip is always chosen.
			const chosen = root.current!.querySelector<HTMLElement>(
				'[role="radio"][aria-checked="true"]',
			)!;
			chosen.focus();
			chosen.focus();
		});
		return () => cancelAnimationFrame(frame);
	}, [closes]);
	const closeGrid = () => {
		setGridOpen(false);
		setCloses((count) => count + 1);
	};
	const range = monthRange(current);
	const chips = monthChips({ current, viewed, picked: value }, formats);
	return (
		<div
			ref={root}
			className={cn("flex flex-col gap-1.5", className)}
		>
			{/* The chips' group carries the same name for screen readers. */}
			<span
				aria-hidden="true"
				className="text-caption text-ink font-semibold"
			>
				{label}
			</span>
			<div ref={chipsRef}>
				<ToggleChips
					label={label}
					selectionMode="single"
					options={chips}
					value={[isGridOpen ? "other" : value]}
					onChange={([chosen]) => {
						if (chosen === "other") {
							setGridOpen(true);
							return;
						}
						onChange(chosen as Month);
					}}
					isDisabled={isDisabled}
				/>
			</div>
			<AriaPopover
				triggerRef={chipsRef}
				isOpen={isGridOpen}
				// It only ever reports closing: Other month is what opens it.
				onOpenChange={closeGrid}
				placement="bottom start"
				offset={6}
				className={cn(
					"border-line bg-page shadow-popover rounded-section z-50 w-84 max-w-[calc(100vw-2rem)] overflow-auto border",
					"entering:opacity-0 exiting:opacity-0 transition-opacity duration-(--dur-fast) ease-out",
				)}
			>
				<AriaDialog
					aria-label={DIALOG_TEXT.otherMonth}
					className="flex flex-col gap-2 p-3 outline-none"
				>
					<MonthGrid
						value={value}
						onChange={(month) => {
							closeGrid();
							onChange(month);
						}}
						range={range}
						current={current}
						dateLocale={formats.dateLocale}
						autoFocus
					/>
					<p className="text-caption text-ink-3">
						{rangeCaption(range.first, range.last, formats)}
					</p>
				</AriaDialog>
			</AriaPopover>
		</div>
	);
}
