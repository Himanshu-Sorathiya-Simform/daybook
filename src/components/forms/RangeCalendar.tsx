"use client";

import { parseDate } from "@internationalized/date";
import { useState } from "react";
import { RangeCalendar as AriaRangeCalendar } from "react-aria-components";

import { CalendarHeader } from "@/components/forms/CalendarHeader";
import { CalendarMonth } from "@/components/forms/CalendarMonth";
import { ARIA_FIRST_DAY } from "@/lib/calendar";
import { cn } from "@/lib/cn";
import type { WeekStart } from "@/lib/geo";

/** An inclusive range of days, each `YYYY-MM-DD`. */
export type DateRange = { start: string; end: string };

export type RangeCalendarProps = {
	/** The calendar's accessible name, "Custom range". */
	label: string;
	/** The chosen range, or none yet. */
	value: DateRange | null;
	/** Called once both ends are chosen, with the earlier day first. */
	onChange: (value: DateRange) => void;
	/** Today in the profile time zone, `YYYY-MM-DD`, which the calendar outlines. */
	today: string;
	/** The first and last days that can be chosen, `YYYY-MM-DD`: the maximum is usually today,
	 * so future days are disabled. */
	minValue?: string;
	maxValue?: string;
	/** The profile's week start, the first column of each month. */
	firstDayOfWeek?: WeekStart;
	className?: string;
};

/**
 * Two months side by side, the later one holding the chosen range's end, or `today` before a
 * range is chosen. A range set from outside, such as typed From and To dates, brings its end
 * into view. The months stack when there is no room for both. A press on one day starts a range
 * and on a second day ends it, in either order. From the keyboard, Enter starts a range and
 * moves focus on a day, the arrow keys extend it and Enter ends it; Escape drops a range not
 * yet ended. The arrows and Page Up and Page Down move by one month.
 */
export function RangeCalendar({
	label,
	value,
	onChange,
	today,
	minValue,
	maxValue,
	firstDayOfWeek,
	className,
}: Readonly<RangeCalendarProps>) {
	const end = value?.end ?? null;
	const [focused, setFocused] = useState(() => parseDate(end ?? today));
	const [shownEnd, setShownEnd] = useState(end);
	// The focused day follows a new end while rendering, React's pattern for state that follows
	// a prop; React Aria then shows the months around it.
	if (end !== shownEnd) {
		setShownEnd(end);
		if (end !== null) setFocused(parseDate(end));
	}

	return (
		<AriaRangeCalendar
			aria-label={label}
			value={
				value ?
					{ start: parseDate(value.start), end: parseDate(value.end) }
				:	null
			}
			onChange={(range) =>
				onChange({
					start: range.start.toString(),
					end: range.end.toString(),
				})
			}
			visibleDuration={{ months: 2 }}
			pageBehavior="single"
			focusedValue={focused}
			onFocusChange={setFocused}
			selectionAlignment="end"
			{...(minValue ? { minValue: parseDate(minValue) } : {})}
			{...(maxValue ? { maxValue: parseDate(maxValue) } : {})}
			{...(firstDayOfWeek ?
				{ firstDayOfWeek: ARIA_FIRST_DAY[firstDayOfWeek] }
			:	{})}
			className={cn("flex flex-col gap-2", className)}
		>
			<CalendarHeader showHeading={false} />
			<div className="grid grid-cols-[repeat(auto-fit,minmax(13.75rem,1fr))] gap-4">
				<CalendarMonth
					today={today}
					showMonthName
					compact
				/>
				<CalendarMonth
					today={today}
					offset={{ months: 1 }}
					showMonthName
					compact
				/>
			</div>
		</AriaRangeCalendar>
	);
}
