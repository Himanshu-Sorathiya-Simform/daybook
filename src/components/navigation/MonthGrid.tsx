"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useId, useState } from "react";
import {
	ListBox as AriaListBox,
	ListBoxItem as AriaListBoxItem,
} from "react-aria-components";

import { IconButton } from "@/components/actions/IconButton";
import {
	inRange,
	type Month,
	type MonthRange,
	monthsStarting,
} from "@/lib/budgets/months";
import { cn } from "@/lib/cn";
import { formatMonth, formatYear } from "@/lib/date-format";

export type MonthGridProps = {
	/** The chosen month, `YYYY-MM`. The grid opens on its year. */
	value: Month;
	/** Called with the month pressed, the chosen one included, so a popover can close on it. */
	onChange: (month: Month) => void;
	/** The months that can be chosen; the others show but are disabled (BR-F04-07). */
	range: MonthRange;
	/** The profile's current month, set in bold and named "this month". */
	current: Month;
	/** The profile's date locale, for the month and year names (BR-F02-19). */
	dateLocale: string;
	/** A figure under a month, such as its overall utilization "81.0%" (BR-F04-14). A month
	 * missing here shows none. */
	figures?: Partial<Record<Month, string>>;
	/** The grid's name, "Months". The year shown is added to it. */
	label?: string;
	/** Called with the year the arrows move to, for a page that loads that year's figures. */
	onYearChange?: (year: number) => void;
	/** Puts focus on the chosen month, or the first one that can be chosen, when it mounts. */
	autoFocus?: boolean;
	className?: string;
};

const yearOf = (month: Month) => Number(month.slice(0, 4));

/**
 * A year of months to choose one from (BR-F04-14, BR-F04-28): the year with Previous year and
 * Next year, then twelve months in four columns. It is a React Aria list box in grid layout, so
 * it is one Tab stop, the arrow keys move in two dimensions, Home and End go to the ends,
 * Enter, Space or a press chooses, and Escape is left to whatever holds the grid. Months outside the range are disabled and skipped. The
 * chosen month takes the accent outline and is announced as selected; the current month is
 * bold and named "this month". Each month's name, figure included, is read in full: "October
 * 2026, 119.7%".
 */
export function MonthGrid({
	value,
	onChange,
	range,
	current,
	dateLocale,
	figures,
	label = "Months",
	onYearChange,
	autoFocus = false,
	className,
}: Readonly<MonthGridProps>) {
	const [year, setYear] = useState(() => yearOf(value));
	const headingId = useId();
	const months = monthsStarting(`${String(year).padStart(4, "0")}-01`, 12);
	const locale = { dateLocale };
	const canPrev = year > yearOf(range.first);
	const canNext = year < yearOf(range.last);
	const showYear = (next: number) => {
		setYear(next);
		onYearChange?.(next);
	};

	return (
		<div className={cn("flex flex-col gap-2", className)}>
			<div className="flex items-center">
				<IconButton
					icon={ChevronLeft}
					label="Previous year"
					variant="plain"
					size="sm"
					isDisabled={!canPrev}
					onPress={() => showYear(year - 1)}
				/>
				<span
					id={headingId}
					className="text-label text-ink flex-1 text-center font-semibold"
				>
					{formatYear(year, locale)}
				</span>
				<IconButton
					icon={ChevronRight}
					label="Next year"
					variant="plain"
					size="sm"
					isDisabled={!canNext}
					onPress={() => showYear(year + 1)}
				/>
			</div>
			<AriaListBox
				aria-label={label}
				aria-describedby={headingId}
				layout="grid"
				selectionMode="single"
				// Escape would clear the selection, which reads as a choice; it belongs to the
				// popover or dialog holding the grid.
				escapeKeyBehavior="none"
				selectedKeys={months.includes(value) ? [value] : []}
				disabledKeys={months.filter((month) => !inRange(month, range))}
				onSelectionChange={(keys) => {
					// Single selection never reports "all". A press on the chosen month asks to
					// clear the selection, which the grid never does: it is a choice of that
					// month again.
					const [picked] = keys as Set<Month>;
					onChange(picked ?? value);
				}}
				autoFocus={autoFocus}
				className="grid grid-cols-4 gap-1 outline-none"
			>
				{months.map((month) => {
					const figure = figures?.[month];
					const isCurrent = month === current;
					const name = [
						formatMonth(month, locale, "long"),
						isCurrent ? "this month" : null,
						figure ?? null,
					]
						.filter(Boolean)
						.join(", ");
					return (
						<AriaListBoxItem
							key={month}
							id={month}
							textValue={formatMonth(month, locale, "long")}
							aria-label={name}
							className={cn(
								"rounded-control text-label text-ink flex cursor-pointer flex-col items-center justify-center gap-px border border-transparent px-1 outline-none",
								figures ? "min-h-13" : "min-h-10",
								"max-md:min-h-11",
								isCurrent ? "font-bold" : "font-medium",
								"hover:bg-soft transition-colors duration-(--dur-fast) ease-out",
								"selected:border-accent selected:bg-accent-soft selected:border-[1.5px] selected:hover:bg-accent-soft",
								"focus-visible:focus-ring",
								"disabled:text-ink-3 disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:bg-transparent",
							)}
						>
							<span>{formatMonth(month, locale, "shortName")}</span>
							{figure !== undefined && (
								<span className="text-small text-ink-2 figures font-medium">
									{figure}
								</span>
							)}
						</AriaListBoxItem>
					);
				})}
			</AriaListBox>
		</div>
	);
}
