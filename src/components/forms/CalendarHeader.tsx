"use client";

import { ChevronLeft, ChevronRight, type LucideIcon } from "lucide-react";
import {
	Button as AriaButton,
	CalendarHeading as AriaCalendarHeading,
} from "react-aria-components";

import { cn } from "@/lib/cn";

export type CalendarHeaderProps = {
	/** Shows the month between the arrows. A calendar of two months names each one over its
	 * grid instead, since React Aria's heading names only the first. */
	showHeading?: boolean;
	className?: string;
};

function Arrow({
	slot,
	icon: Icon,
	label,
}: Readonly<{ slot: "previous" | "next"; icon: LucideIcon; label: string }>) {
	return (
		<AriaButton
			slot={slot}
			aria-label={label}
			className={cn(
				"rounded-control text-ink inline-flex size-8 shrink-0 cursor-pointer items-center justify-center max-md:size-11",
				"hover:bg-soft focus-visible:focus-ring transition-colors duration-(--dur-fast) ease-out",
				"disabled:text-ink-3 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent",
			)}
		>
			<Icon
				aria-hidden="true"
				className="size-4"
			/>
		</AriaButton>
	);
}

/**
 * Previous month, the month shown, next month: the top row of a Calendar or RangeCalendar.
 * React Aria disables an arrow when the month past it has no day that can be chosen, and its
 * heading names the month in the locale ("November 2026"). Screen readers hear the calendar's
 * name with the visible months either way.
 */
export function CalendarHeader({
	showHeading = true,
	className,
}: Readonly<CalendarHeaderProps>) {
	return (
		<header className={cn("flex items-center gap-1", className)}>
			<Arrow
				slot="previous"
				icon={ChevronLeft}
				label="Previous month"
			/>
			{showHeading ?
				<AriaCalendarHeading className="text-label text-ink flex-1 text-center font-semibold" />
			:	<span className="flex-1" />}
			<Arrow
				slot="next"
				icon={ChevronRight}
				label="Next month"
			/>
		</header>
	);
}
