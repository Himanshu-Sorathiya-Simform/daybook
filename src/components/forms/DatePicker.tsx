"use client";

import { parseDate } from "@internationalized/date";
import { CalendarDays, ChevronDown } from "lucide-react";
import { useId, useState } from "react";
import {
	Button as AriaButton,
	Calendar as AriaCalendar,
	Dialog as AriaDialog,
	DialogTrigger as AriaDialogTrigger,
	Popover as AriaPopover,
} from "react-aria-components";

import { CalendarHeader } from "@/components/forms/CalendarHeader";
import { CalendarMonth } from "@/components/forms/CalendarMonth";
import { ARIA_FIRST_DAY } from "@/lib/calendar";
import { cn } from "@/lib/cn";
import type { WeekStart } from "@/lib/geo";

export type DatePickerProps = {
	/** The visible label, "Date". */
	label: string;
	/** The chosen day, `YYYY-MM-DD`. */
	value: string;
	onChange: (value: string) => void;
	/** The chosen day as the button shows it, "Today, 2 Nov"; the caller formats it (F02). */
	display: string;
	/** Today in the profile time zone, `YYYY-MM-DD`, which the calendar outlines. */
	today: string;
	/** The first and last days that can be chosen, `YYYY-MM-DD`. */
	minValue?: string;
	maxValue?: string;
	/** The profile's week start, the calendar's first column. */
	firstDayOfWeek?: WeekStart;
	/** A line under the calendar, "You can choose today or one of the 10 days before. Arrow
	 * keys move, Enter picks." It is read out with the calendar. */
	note?: string;
	hint?: string | undefined;
	/** The field's error. It replaces the hint and is read out with the button. */
	error?: string | undefined;
	isDisabled?: boolean;
	className?: string;
};

/**
 * A day chosen from a calendar: a button showing the day, which opens a popover named "Choose a
 * date" with one month. Only the days from `minValue` to `maxValue` can be chosen. Arrow keys
 * move between days, Page Up and Page Down between months, and Enter or a press picks a day,
 * which closes the popover and puts focus back on the button. Escape closes it without a
 * change.
 *
 * It is a button rather than a typed date, so no React Aria field links the label, hint and
 * error: the button names itself by the label and the day, and is described by the hint or the
 * error. A button takes no `aria-invalid`, so an error marks it `data-invalid`, which
 * `focusFirstInvalid` finds.
 */
export function DatePicker({
	label,
	value,
	onChange,
	display,
	today,
	minValue,
	maxValue,
	firstDayOfWeek,
	note,
	hint,
	error,
	isDisabled = false,
	className,
}: Readonly<DatePickerProps>) {
	const id = useId();
	const [isOpen, setOpen] = useState(false);
	const message = error ?? hint;

	return (
		<div className={cn("flex flex-col gap-1.25", className)}>
			<span
				id={`${id}-label`}
				className="text-caption text-ink font-semibold"
			>
				{label}
			</span>
			<AriaDialogTrigger
				isOpen={isOpen}
				onOpenChange={setOpen}
			>
				<AriaButton
					isDisabled={isDisabled}
					aria-labelledby={`${id}-label ${id}-value`}
					{...(error ? { "data-invalid": true } : {})}
					{...(message ? { "aria-describedby": `${id}-message` } : {})}
					className={cn(
						"rounded-control bg-page text-body text-ink flex min-h-10.5 w-full cursor-pointer items-center gap-2 border px-3 text-start max-md:min-h-11",
						"focus-visible:focus-ring transition-colors duration-(--dur-fast) ease-out",
						error ? "border-neg" : "border-edge",
						"aria-expanded:border-accent",
						"disabled:bg-soft disabled:text-ink-3 disabled:cursor-not-allowed",
					)}
				>
					<CalendarDays
						aria-hidden="true"
						className="text-ink-2 size-4 shrink-0"
					/>
					<span
						id={`${id}-value`}
						className="min-w-0 flex-1 truncate"
					>
						{display}
					</span>
					<ChevronDown
						aria-hidden="true"
						className="text-ink-3 size-3.5 shrink-0"
					/>
				</AriaButton>
				<AriaPopover
					placement="bottom start"
					offset={6}
					className={cn(
						"border-line bg-page shadow-popover rounded-section z-50 w-75 max-w-[calc(100vw-2rem)] overflow-auto border",
						"entering:opacity-0 exiting:opacity-0 transition-opacity duration-(--dur-fast) ease-out",
					)}
				>
					<AriaDialog
						aria-label="Choose a date"
						{...(note ? { "aria-describedby": `${id}-note` } : {})}
						className="flex flex-col gap-2 p-3 outline-none"
					>
						<AriaCalendar
							aria-label={label}
							value={parseDate(value)}
							onChange={(date) => {
								onChange(date.toString());
								setOpen(false);
							}}
							{...(minValue ? { minValue: parseDate(minValue) } : {})}
							{...(maxValue ? { maxValue: parseDate(maxValue) } : {})}
							{...(firstDayOfWeek ?
								{ firstDayOfWeek: ARIA_FIRST_DAY[firstDayOfWeek] }
							:	{})}
							autoFocus
							className="flex flex-col gap-2"
						>
							<CalendarHeader />
							<CalendarMonth today={today} />
						</AriaCalendar>
						{note && (
							<p
								id={`${id}-note`}
								className="text-caption text-ink-3"
							>
								{note}
							</p>
						)}
					</AriaDialog>
				</AriaPopover>
			</AriaDialogTrigger>
			{message && (
				<p
					id={`${id}-message`}
					className={cn(
						"text-caption",
						error ? "text-neg font-medium" : "text-ink-3",
					)}
				>
					{message}
				</p>
			)}
		</div>
	);
}
