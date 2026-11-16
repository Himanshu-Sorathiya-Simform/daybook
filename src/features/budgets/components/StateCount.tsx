"use client";

import { ToggleButton as AriaToggleButton } from "react-aria-components";

import { STATE_LABELS, type StateLabel } from "@/lib/budgets/model";
import { cn } from "@/lib/cn";
import { STATE_TONES } from "../lib/labels";

export type StateCountProps = {
	state: StateLabel;
	/** How many of the month's Budgets have the state. */
	count: number;
	/** Whether the list shows only this state. */
	isSelected: boolean;
	onChange: (isSelected: boolean) => void;
	className?: string;
};

/** The label's colour: the accent while selected, the state's own with Budgets, else muted. */
function labelTone(state: StateLabel, count: number, isSelected: boolean): string {
	if (isSelected) return "text-accent font-semibold";
	if (count > 0) return cn(STATE_TONES[state], "font-semibold");
	return "text-ink-2";
}

/**
 * One of the overview's four state counts (BR-F04-15, BR-F04-31): the label and its number, a
 * toggle that filters the list to that state, announced as pressed while it does. A state with
 * Budgets takes its colour; one with none is muted. Pressing it again shows all.
 */
export function StateCount({
	state,
	count,
	isSelected,
	onChange,
	className,
}: Readonly<StateCountProps>) {
	return (
		<AriaToggleButton
			isSelected={isSelected}
			onChange={onChange}
			className={cn(
				"rounded-control text-label -mx-2.5 flex min-h-8.5 cursor-pointer items-center gap-2 px-2.5 text-left max-md:min-h-11",
				"hover:bg-soft selected:bg-accent-soft transition-colors duration-(--dur-fast) ease-out",
				"focus-visible:focus-ring",
				className,
			)}
		>
			<span className={cn("flex-1", labelTone(state, count, isSelected))}>
				{STATE_LABELS[state]}
			</span>
			{/* A space keeps the label and the number apart when read. */}{" "}
			<span
				className={cn(
					"figures font-semibold",
					count > 0 ? "text-ink" : "text-ink-3",
				)}
			>
				{count}
			</span>
		</AriaToggleButton>
	);
}
