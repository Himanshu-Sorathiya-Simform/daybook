"use client";

import { Skeleton } from "@/components/feedback/Skeleton";
import { cn } from "@/lib/cn";
import type { MonthItem } from "@/lib/subscriptions/model";
import { CALENDAR_TEXT, type GridWeek } from "../lib/calendar";
import type { Formats } from "../lib/labels";
import { ChargeChip } from "./ChargeChip";
import { DayPopover } from "./DayPopover";

export type CalendarGridProps = {
	/** The month's name, the table's caption for screen readers. */
	title: string;
	weeks: readonly GridWeek[];
	/** The seven weekday names from the week start. */
	weekdays: readonly string[];
	formats: Formats;
	/** The selected Subscription and the date its marked charge was picked on. */
	selected: string | null;
	markedDue: string | null;
	onSelectItem: (item: MonthItem) => void;
	/** The month's charges are on their way: each day of the month and each total holds its
	 * place with a skeleton bar. */
	isLoading?: boolean;
	className?: string;
};

/**
 * A month as a grid, from 768 px (BR-F05-38): a table of weeks from the profile's week start with
 * a "Week" column of totals ("—" for none). Days outside the month are dimmed and show only
 * their date ("1 Dec" for a first day); today's date sits in a filled circle. A day shows up to
 * two items, or the first and "+2 more · ₹20,149" with a popover of all of them. The legend
 * names the marks.
 */
export function CalendarGrid({
	title,
	weeks,
	weekdays,
	formats,
	selected,
	markedDue,
	onSelectItem,
	isLoading = false,
	className,
}: Readonly<CalendarGridProps>) {
	return (
		<table
			className={cn("w-full table-fixed border-collapse", className)}
			aria-busy={isLoading}
		>
			<caption className="sr-only">{title}</caption>
			<colgroup>
				<col span={7} />
				<col className="w-24" />
			</colgroup>
			<thead>
				<tr className="text-small text-ink-3 font-medium">
					{weekdays.map((name) => (
						<th
							key={name}
							scope="col"
							className="pr-1.5 pb-1.5 text-left font-medium"
						>
							{name}
						</th>
					))}
					<th
						scope="col"
						className="pb-1.5 text-right font-medium"
					>
						{CALENDAR_TEXT.weekColumn}
					</th>
				</tr>
			</thead>
			<tbody>
				{weeks.map((week) => (
					<tr
						key={week.key}
						className="border-line h-23 border-t align-top"
					>
						{week.days.map((day) => (
							<td
								key={day.date}
								className="min-w-0 pt-1.5 pr-1.5"
							>
								<div
									className={cn(
										"flex min-w-0 flex-col gap-px",
										day.moreCount > 0
											&& "bg-soft rounded-control -mx-1 mb-1 px-1",
									)}
								>
									<span
										className={cn(
											"text-small flex h-5.5 items-center",
											// A day of another month is dimmed with a lighter ink and weight, not
											// with opacity, which would take its text below the contrast it needs.
											day.today ? "font-bold"
											: !day.inMonth ? "text-ink-3 font-normal"
											: day.past ? "text-ink-3 font-medium"
											: "text-ink-2 font-medium",
										)}
									>
										{day.today ?
											<span className="bg-ink text-page figures inline-grid size-5.5 place-items-center rounded-full">
												<span className="sr-only">
													Today,{" "}
												</span>
												{day.label}
											</span>
										:	day.label}
									</span>
									{!isLoading
										&& day.shown.map((item) => (
											<ChargeChip
												key={`${item.subscriptionId ?? item.chargeId} ${item.kind}`}
												item={item}
												formats={formats}
												onSelect={onSelectItem}
												isMarked={
													item.subscriptionId !== null
													&& item.subscriptionId
														=== selected
													&& item.date === markedDue
												}
											/>
										))}
									{!isLoading && day.moreCount > 0 && (
										<DayPopover
											day={day}
											formats={formats}
											onSelect={onSelectItem}
										/>
									)}
									{isLoading && day.inMonth && (
										// The two lines of a chip, its name over its amount, so the day
										// keeps its height when the items arrive.
										<div className="text-small -mx-1 flex min-h-7 flex-col px-1 py-px leading-tight">
											<span className="flex h-lh items-center">
												<Skeleton className="h-[0.7em] w-4/5" />
											</span>
											<span className="flex h-lh items-center">
												<Skeleton className="h-[0.7em] w-1/2" />
											</span>
										</div>
									)}
								</div>
							</td>
						))}
						<td
							className={cn(
								"text-label figures pt-1.5 text-right",
								week.totalMinor === 0 ? "text-ink-3" : "text-ink-2",
							)}
						>
							{isLoading ?
								<Skeleton className="ml-auto h-3.5 w-16" />
							:	week.total}
						</td>
					</tr>
				))}
			</tbody>
		</table>
	);
}
