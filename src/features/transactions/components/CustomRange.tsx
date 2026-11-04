"use client";

import { useDebouncer } from "@tanstack/react-pacer";
import { useState } from "react";

import { DateField } from "@/components/forms/DateField";
import { type DateRange, RangeCalendar } from "@/components/forms/RangeCalendar";
import { cn } from "@/lib/cn";
import type { WeekStart } from "@/lib/geo";
import { daysInRange } from "@/lib/time";
import { transactionCount } from "../lib/labels";
import { FILTER_TEXT } from "../lib/messages";

/** Typed dates commit this long after typing stops, as every text box does (FIL-4). */
export const DATE_COMMIT_MS = 300;

export type CustomRangeProps = {
	/** The range the fields start from: the committed dates, or the preset's. */
	value: DateRange | null;
	/** A complete range, From on or before To, committed at once. */
	onChange: (value: DateRange) => void;
	/** Today in the profile time zone; the calendar disables the days after it. */
	today: string;
	firstDayOfWeek: WeekStart;
	/** The header's count for the committed filter, once loaded. */
	count: number | undefined;
	/** The calendar's months: two in a desktop menu, one in the phone sheet. */
	months?: 1 | 2;
	className?: string;
};

/**
 * Date → Custom (BR-F03-39, D-538): From and To date fields over a two-month range calendar
 * with the future disabled, then "16 days · 4 Transactions" for the committed range. The
 * calendar commits at once when its second day is chosen; the fields commit 300 ms after
 * typing stops, once both hold a date and From is not after To, so a day typed digit by digit
 * is one change (D-543). From after To keeps the range as it was and says "Choose a From date
 * on or before To."
 */
export function CustomRange({
	value,
	onChange,
	today,
	firstDayOfWeek,
	count,
	months = 2,
	className,
}: Readonly<CustomRangeProps>) {
	const [from, setFrom] = useState(value?.start ?? null);
	const [to, setTo] = useState(value?.end ?? null);
	const [given, setGiven] = useState(value);
	// The fields follow a range committed from elsewhere while rendering, React's pattern for
	// state that follows a prop.
	if (value?.start !== given?.start || value?.end !== given?.end) {
		setGiven(value);
		setFrom(value?.start ?? null);
		setTo(value?.end ?? null);
	}

	const reversed = from !== null && to !== null && from > to;
	// Pacer calls the latest commit, so it sees this render's committed range.
	const commit = (start: string | null, end: string | null) => {
		if (start === null || end === null || start > end) return;
		if (start === value?.start && end === value.end) return;
		onChange({ start, end });
	};
	const typed = useDebouncer(commit, { wait: DATE_COMMIT_MS });

	return (
		<div className={cn("flex flex-col gap-2.5", className)}>
			<div className="grid grid-cols-2 gap-2">
				<DateField
					label="From"
					value={from}
					error={reversed ? FILTER_TEXT.fromAfterTo : undefined}
					onChange={(date) => {
						setFrom(date);
						typed.maybeExecute(date, to);
					}}
				/>
				<DateField
					label="To"
					value={to}
					onChange={(date) => {
						setTo(date);
						typed.maybeExecute(from, date);
					}}
				/>
			</div>
			<RangeCalendar
				label="Custom range"
				value={value}
				onChange={(range) => {
					typed.cancel();
					setFrom(range.start);
					setTo(range.end);
					commit(range.start, range.end);
				}}
				today={today}
				maxValue={today}
				firstDayOfWeek={firstDayOfWeek}
				months={months}
			/>
			{value && (
				<p className="figures text-caption text-ink-2">
					{daysInRange(value.start, value.end)}{" "}
					{daysInRange(value.start, value.end) === 1 ? "day" : "days"}
					{count !== undefined && ` · ${transactionCount(count)}`}
				</p>
			)}
		</div>
	);
}
