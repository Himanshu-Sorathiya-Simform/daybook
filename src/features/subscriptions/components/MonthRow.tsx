"use client";

import { Check, ChevronLeft, ChevronRight } from "lucide-react";
import {
	ListBox as AriaListBox,
	ListBoxItem as AriaListBoxItem,
} from "react-aria-components";

import { IconButton } from "@/components/actions/IconButton";
import { Skeleton } from "@/components/feedback/Skeleton";
import type { Month } from "@/lib/budgets/months";
import { cn } from "@/lib/cn";
import { CALENDAR_TEXT, type MonthCell } from "../lib/calendar";

export type MonthRowProps = {
	cells: readonly MonthCell[];
	/** The figures are on their way: each month holds its place with a skeleton bar. */
	isLoading: boolean;
	canEarlier: boolean;
	canLater: boolean;
	onEarlier: () => void;
	onLater: () => void;
	onPick: (month: Month) => void;
	className?: string;
};

/**
 * The calendar's month row (BR-F05-38): Earlier months, the months and Later months. Each
 * month shows its short name, its year when it is not this one, a check mark when it is past,
 * and its figure in whole units; the current month also has a bar of its charged share. It is
 * a React Aria list box in grid layout, so it is one Tab stop and the arrow keys move along it.
 * A month is named in full, "October 2026, charged ₹20,148.00", in text the eye does not read,
 * so what is spoken matches what is shown.
 */
export function MonthRow({
	cells,
	isLoading,
	canEarlier,
	canLater,
	onEarlier,
	onLater,
	onPick,
	className,
}: Readonly<MonthRowProps>) {
	const selected = cells.find((cell) => cell.selected)?.month;
	return (
		<div className={cn("flex items-center gap-1", className)}>
			<IconButton
				icon={ChevronLeft}
				label={CALENDAR_TEXT.earlier}
				variant="plain"
				size="sm"
				isDisabled={!canEarlier}
				onPress={onEarlier}
			/>
			<AriaListBox
				aria-label={CALENDAR_TEXT.monthRowLabel}
				layout="grid"
				selectionMode="single"
				// Escape would clear the selection, which reads as a choice; it belongs to the page.
				escapeKeyBehavior="none"
				selectedKeys={selected === undefined ? [] : [selected]}
				onSelectionChange={(keys) => {
					// A press on the chosen month asks to clear it, which a month row never does.
					const [picked] = keys as Set<Month>;
					onPick(picked ?? selected ?? cells[0]!.month);
				}}
				style={{
					gridTemplateColumns: `repeat(${cells.length}, minmax(0, 1fr))`,
				}}
				className="grid min-w-0 flex-1 gap-0.75 outline-none"
			>
				{cells.map((cell) => (
					<AriaListBoxItem
						key={cell.month}
						id={cell.month}
						textValue={cell.label}
						className={cn(
							"group rounded-control text-small figures flex min-h-12 min-w-0 cursor-pointer flex-col items-center gap-px overflow-hidden border-[1.5px] px-0.5 pt-1.25 pb-1 font-medium outline-none",
							"transition-colors duration-(--dur-fast) ease-out",
							cell.past ? "bg-soft text-ink-2" : "text-ink",
							cell.current ? "border-ink" : "border-transparent",
							"hover:bg-soft selected:border-accent selected:bg-accent-soft selected:hover:bg-accent-soft",
							"focus-visible:focus-ring",
						)}
					>
						<span
							aria-hidden="true"
							className={cn(
								"flex items-center gap-0.75",
								cell.current ? "font-bold" : "font-semibold",
							)}
						>
							{cell.year === null ?
								cell.name
							:	`${cell.name} ${cell.year}`}
							{cell.past && (
								<Check
									className="text-ink-3 size-2.75"
									aria-hidden="true"
								/>
							)}
						</span>
						<span className="sr-only">{cell.label}</span>
						<span
							aria-hidden="true"
							className="flex h-lh items-center whitespace-nowrap"
						>
							{isLoading ?
								<Skeleton className="h-[0.7em] w-8" />
							:	cell.figure}
						</span>
						{cell.chargedTenths !== null && (
							// As the summary's bar: the charged share fills a track, and the rest of
							// the track is what is still to come. A selected month's tint swallows the
							// usual track, so it has a darker one.
							<span
								aria-hidden="true"
								className="bg-track group-selected:bg-line-strong/40 mt-0.5 flex h-0.75 w-4/5 overflow-hidden rounded-full"
							>
								<span
									className="bg-bar"
									style={{ width: `${cell.chargedTenths / 10}%` }}
								/>
							</span>
						)}
					</AriaListBoxItem>
				))}
			</AriaListBox>
			<IconButton
				icon={ChevronRight}
				label={CALENDAR_TEXT.later}
				variant="plain"
				size="sm"
				isDisabled={!canLater}
				onPress={onLater}
			/>
		</div>
	);
}
