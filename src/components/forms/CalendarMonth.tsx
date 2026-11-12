"use client";

import { type DateDuration, DateFormatter } from "@internationalized/date";
import { useContext } from "react";
import {
	CalendarCell as AriaCalendarCell,
	CalendarGrid as AriaCalendarGrid,
	CalendarGridBody as AriaCalendarGridBody,
	CalendarGridHeader as AriaCalendarGridHeader,
	CalendarHeaderCell as AriaCalendarHeaderCell,
	CalendarStateContext as AriaCalendarStateContext,
	RangeCalendarStateContext as AriaRangeCalendarStateContext,
	useLocale as useAriaLocale,
} from "react-aria-components";

import { cn } from "@/lib/cn";

export type CalendarMonthProps = {
	/** Today in the profile time zone, `YYYY-MM-DD`. React Aria's own today follows the device
	 * zone, so the mark reads this instead (TIME-5). */
	today: string;
	/** Which visible month this is, counted from the first: `{ months: 1 }` for the second. */
	offset?: DateDuration;
	/** Names the month above its grid, for a calendar that shows more than one. */
	showMonthName?: boolean;
	/** Smaller days, for a calendar that shows two months in a popover. */
	compact?: boolean;
	className?: string;
};

/**
 * One month of a Calendar or RangeCalendar: the weekday names from the locale and its days.
 * Days from the months on either side keep their place in the grid but are not shown. Today
 * has an outline; the chosen day, or a range's two ends, are filled with the accent and the
 * days between them tinted. A day outside the calendar's minimum and maximum is dimmed and
 * cannot be chosen.
 */
export function CalendarMonth({
	today,
	offset,
	showMonthName = false,
	compact = false,
	className,
}: Readonly<CalendarMonthProps>) {
	const { locale } = useAriaLocale();
	const single = useContext(AriaCalendarStateContext);
	const range = useContext(AriaRangeCalendarStateContext);
	const isRange = range !== null;
	const start = (range ?? single)!.visibleRange.start;
	const month = offset ? start.add(offset) : start;
	const name = new DateFormatter(locale, {
		month: "long",
		year: "numeric",
		timeZone: "UTC",
	}).format(month.toDate("UTC"));

	return (
		<div className={cn("flex min-w-0 flex-col gap-1.5", className)}>
			{showMonthName && (
				<p
					aria-hidden="true"
					className="text-label text-ink text-center font-semibold"
				>
					{name}
				</p>
			)}
			<AriaCalendarGrid
				weekdayStyle="short"
				{...(offset ? { offset } : {})}
				className="w-full border-collapse"
			>
				<AriaCalendarGridHeader>
					{(day) => (
						<AriaCalendarHeaderCell className="text-caption text-ink-3 pb-1 font-medium">
							{day}
						</AriaCalendarHeaderCell>
					)}
				</AriaCalendarGridHeader>
				<AriaCalendarGridBody>
					{(date) => (
						<AriaCalendarCell
							date={date}
							className={cn(
								"figures text-label text-ink flex cursor-pointer items-center justify-center rounded-lg font-medium outline-none",
								compact ? "m-px h-7.5" : "m-px h-9",
								"hover:bg-soft focus-visible:focus-ring transition-colors duration-(--dur-fast) ease-out",
								date.toString() === today
									&& "ring-accent selected:ring-0 ring-[1.5px] ring-inset",
								isRange ?
									"selected:bg-accent-soft selection-start:bg-accent selection-start:text-on-accent selection-start:font-bold selection-end:bg-accent selection-end:text-on-accent selection-end:font-bold"
								:	"selected:bg-accent selected:text-on-accent selected:font-bold",
								"disabled:text-ink-3 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent",
								"outside-month:invisible",
							)}
						/>
					)}
				</AriaCalendarGridBody>
			</AriaCalendarGrid>
		</div>
	);
}
