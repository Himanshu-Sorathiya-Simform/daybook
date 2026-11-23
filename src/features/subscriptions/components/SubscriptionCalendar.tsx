"use client";

import { useState } from "react";

import { Button } from "@/components/actions/Button";
import { Skeleton } from "@/components/feedback/Skeleton";
import { Section } from "@/components/surfaces/Section";
import { useElementWidth } from "@/hooks/useElementWidth";
import { monthOf, type Month } from "@/lib/budgets/months";
import { cn } from "@/lib/cn";
import type { WeekStart } from "@/lib/geo";
import type { MonthItem } from "@/lib/subscriptions/model";
import { useMonthCharges } from "../hooks/useMonthCharges";
import { useSubscriptionMonths } from "../hooks/useSubscriptionMonths";
import {
	CALENDAR_TEXT,
	calendarItems,
	calendarTitle,
	canMoveMonths,
	gridWeeks,
	LEGEND,
	MONTH_STEP,
	monthCells,
	monthsFit,
	monthSpan,
	monthWindow,
	phoneWeeks,
	weekdayHeaders,
} from "../lib/calendar";
import type { Formats } from "../lib/labels";
import { PANEL_TEXT } from "../lib/panel";
import type { SubscriptionItem } from "../lib/types";
import { CalendarDays } from "./CalendarDays";
import { CalendarGrid } from "./CalendarGrid";
import { MonthRow } from "./MonthRow";

export type SubscriptionCalendarProps = {
	/** Every Subscription of the list: the due, skipped and paused dates come from them. */
	items: readonly SubscriptionItem[];
	formats: Formats & { weekStart: WeekStart };
	/** From 768 px: the grid. Below, day by day. The month row shows as many months as fit its
	 * own width, 4 to 8. */
	isWide: boolean;
	/** The selected Subscription and the date its charge was picked on, which the grid marks. */
	selected: string | null;
	markedDue: string | null;
	/** An item was pressed: the page selects its Subscription, or says its Subscription is gone. */
	onSelectItem: (item: MonthItem) => void;
	className?: string;
};

/**
 * The calendar view (BR-F05-38): the month row, the month's title with its figures, then the
 * grid from 768 px or the days below it, and under the grid the legend. The month row's figures
 * come from the months read, the items of the shown month from the list and that month's
 * charges, read whole (BR-F05-48). While the figures load the month row holds their places with
 * skeleton bars; while the charges load the grid or days do, and if they fail the month shows
 * "Charges could not be loaded." with Retry in place of what needs them. The page draws it only
 * once the browser has read the remembered view, so the width it is given is already known.
 */
export function SubscriptionCalendar({
	items,
	formats,
	isWide,
	selected,
	markedDue,
	onSelectItem,
	className,
}: Readonly<SubscriptionCalendarProps>) {
	const current = monthOf(formats.today);
	const [month, setMonth] = useState<Month>(current);
	const [offset, setOffset] = useState(0);
	const [rowRef, rowPixels] = useElementWidth<HTMLDivElement>();
	const { from, to } = monthSpan(current, offset);
	const months = useSubscriptionMonths(from, to);
	const charges = useMonthCharges(month);
	const failed =
		!charges.data && (charges.isError || charges.fetchStatus === "paused");
	const isLoading = !charges.data && !failed;
	const cells = monthCells(
		monthWindow(current, offset, monthsFit(rowPixels)),
		months.data?.months,
		{ current, selected: month },
		formats,
	);
	const shown = calendarItems(items, charges.data ?? [], month, formats.today);
	const heading = calendarTitle(month, shown, formats);

	const body = () => {
		if (failed) {
			return (
				<div className="flex flex-wrap items-center gap-x-3 gap-y-1">
					<p
						role="alert"
						className="text-body text-ink-2"
					>
						{PANEL_TEXT.chargesFailed}
					</p>
					<Button
						size="sm"
						variant="row"
						onPress={() => void charges.refetch()}
					>
						{PANEL_TEXT.retry}
					</Button>
				</div>
			);
		}
		if (isWide) {
			return (
				<>
					<CalendarGrid
						title={heading.title}
						weeks={gridWeeks(month, formats.weekStart, shown, formats)}
						weekdays={weekdayHeaders(formats.weekStart, formats)}
						formats={formats}
						selected={selected}
						markedDue={markedDue}
						onSelectItem={onSelectItem}
						isLoading={isLoading}
					/>
					<ul className="text-small text-ink-3 border-line flex flex-wrap gap-x-4 gap-y-1 border-t pt-2.5">
						{LEGEND.filter((entry) => entry.fromM5 !== true).map(
							(entry) => (
								<li key={entry.text}>{entry.text}</li>
							),
						)}
					</ul>
				</>
			);
		}
		return (
			<CalendarDays
				weeks={phoneWeeks(month, formats.weekStart, shown, formats)}
				onSelectItem={onSelectItem}
				isLoading={isLoading}
			/>
		);
	};

	return (
		<Section
			className={cn(
				"flex flex-col gap-3.5 px-5 py-4 max-md:px-3.5 max-md:py-3",
				className,
			)}
		>
			<div
				ref={rowRef}
				className="min-w-0"
			>
				<MonthRow
					cells={cells}
					isLoading={
						months.data === undefined
						&& months.fetchStatus === "fetching"
					}
					canEarlier={canMoveMonths(current, offset, -1)}
					canLater={canMoveMonths(current, offset, 1)}
					onEarlier={() => setOffset(offset - MONTH_STEP)}
					onLater={() => setOffset(offset + MONTH_STEP)}
					onPick={setMonth}
				/>
			</div>
			<div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
				<h2 className="text-heading text-ink">{heading.title}</h2>
				<span className="flex-1" />
				{isLoading ?
					<Skeleton className="h-3.5 w-48" />
				:	!failed && (
						<span className="text-label text-ink-2 figures">
							{heading.figures}
						</span>
					)
				}
			</div>
			<div
				role={isLoading ? "status" : undefined}
				aria-label={isLoading ? CALENDAR_TEXT.loading : undefined}
				className="flex flex-col gap-3.5"
			>
				{body()}
			</div>
		</Section>
	);
}
