"use client";

import { useEffect, useRef, useState } from "react";
import { Button as AriaButton } from "react-aria-components";

import { Button } from "@/components/actions/Button";
import { Skeleton } from "@/components/feedback/Skeleton";
import { cn } from "@/lib/cn";
import type { MonthItem } from "@/lib/subscriptions/model";
import {
	type PhoneEntry,
	phoneRows,
	type PhoneWeek,
	phoneWeekHint,
} from "../lib/calendar";
import { ChipDot } from "./ChipDot";

export type CalendarDaysProps = {
	weeks: readonly PhoneWeek[];
	onSelectItem: (item: MonthItem) => void;
	/** The month's charges are on their way: each week holds its place with skeleton lines. */
	isLoading?: boolean;
	className?: string;
};

const LINE = "border-line border-t text-small text-ink-3 flex items-center";

/** One item of a day: its date on the first, its name with the category dot over its caption,
 * and its amount. Skipped and paused ones are struck through. */
function entryButton(
	entry: PhoneEntry,
	label: string,
	first: boolean,
	onSelect: (item: MonthItem) => void,
) {
	return (
		<AriaButton
			key={`${entry.item.subscriptionId ?? entry.item.chargeId} ${entry.item.kind}`}
			onPress={() => onSelect(entry.item)}
			className={cn(
				"focus-visible:focus-ring grid min-h-13 w-full cursor-pointer grid-cols-[4rem_minmax(0,1fr)_auto] items-center gap-2 text-left",
				first && "border-line border-t",
			)}
		>
			<span
				className={cn(
					"text-label text-ink font-semibold",
					!first && "invisible",
				)}
			>
				{label}
			</span>
			<span className="flex min-w-0 flex-col">
				<span
					className={cn(
						"text-body text-ink flex items-center gap-1.5 font-medium",
						entry.struck && "line-through",
					)}
				>
					<ChipDot item={entry.item} />
					<span className="truncate">{entry.item.name}</span>
				</span>
				<span className="text-small text-ink-3">{entry.caption}</span>
			</span>
			<span
				className={cn(
					"text-body figures font-semibold",
					entry.struck ? "text-ink-3" : "text-ink",
				)}
			>
				{entry.amount}
			</span>
		</AriaButton>
	);
}

/**
 * A month day by day, below 768 px (BR-F05-38): each week a heading with its days ("2 to 8 Nov")
 * and total; a week with no item reads "Nothing due · Show days" until opened; three or more
 * empty days in a row are one line; today always shows and reads "Today". A due item's caption
 * is its relative date, the others "Charged", "Skipped" or "Paused". The current month opens
 * scrolled to today.
 */
export function CalendarDays({
	weeks,
	onSelectItem,
	isLoading = false,
	className,
}: Readonly<CalendarDaysProps>) {
	const [opened, setOpened] = useState<ReadonlySet<string>>(new Set());
	const today = useRef<HTMLDivElement | null>(null);
	const month = weeks[0]?.key.slice(0, 7);
	useEffect(() => {
		// Only the current month has a line for today, and none shows while it loads.
		today.current?.scrollIntoView?.({ block: "start" });
	}, [isLoading, month]);

	return (
		<div
			className={cn("flex flex-col", className)}
			aria-busy={isLoading}
		>
			{weeks.map((week) => {
				const expanded = opened.has(week.key);
				const hint = phoneWeekHint(week, expanded);
				/** The week's total, or the button that opens it, or a bar while loading. */
				const weekEnd = () => {
					if (isLoading) return <Skeleton className="h-3.5 w-16" />;
					if (week.total !== null) {
						return <span className="figures">{week.total}</span>;
					}
					if (hint === null) return null;
					return (
						<Button
							size="sm"
							variant="ghost"
							className="text-ink-3 font-medium"
							onPress={() => setOpened(new Set([...opened, week.key]))}
						>
							{hint}
						</Button>
					);
				};
				return (
					<section
						key={week.key}
						aria-label={week.label}
					>
						<div className="text-label text-ink-2 flex items-baseline pt-3.5 pb-1 font-semibold">
							<h3>{week.label}</h3>
							<span className="flex-1" />
							{weekEnd()}
						</div>
						{isLoading ?
							<div className="flex flex-col gap-2 py-1">
								<Skeleton className="h-3.5 w-3/5" />
								<Skeleton className="h-3.5 w-2/5" />
							</div>
						:	phoneRows(week, expanded).map((row) => {
								if (row.kind === "run") {
									return (
										<div
											key={`run ${row.from}`}
											className={cn(LINE, "min-h-7")}
										>
											{row.label}
										</div>
									);
								}
								if (row.kind === "empty") {
									return (
										<div
											key={row.date}
											ref={row.today ? today : undefined}
											className={cn(
												LINE,
												"grid scroll-mt-40 grid-cols-[4rem_1fr]",
												row.today ? "min-h-9" : "min-h-7",
											)}
										>
											<span
												className={
													row.today ?
														"text-ink font-semibold"
													:	""
												}
											>
												{row.label}
											</span>
										</div>
									);
								}
								return (
									<div
										key={row.date}
										ref={row.today ? today : undefined}
										className="scroll-mt-40"
									>
										{row.entries.map((entry, index) =>
											entryButton(
												entry,
												row.label,
												index === 0,
												onSelectItem,
											),
										)}
									</div>
								);
							})
						}
					</section>
				);
			})}
		</div>
	);
}
