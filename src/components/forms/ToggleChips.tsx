"use client";

import { Check } from "lucide-react";
import {
	ToggleButton as AriaToggleButton,
	ToggleButtonGroup as AriaToggleButtonGroup,
} from "react-aria-components";

import { cn } from "@/lib/cn";

export type ToggleChipOption = { value: string; label: string };

export type ToggleChipsProps = {
	/** The group's accessible name, "Type". */
	label: string;
	options: readonly ToggleChipOption[];
	/** One chip at a time, which stays chosen when pressed again, or any number of chips. */
	selectionMode?: "single" | "multiple";
	/** The chosen chips' values. */
	value: readonly string[];
	/** Called when the choice changes, with the chosen values in the order of `options`. */
	onChange: (value: string[]) => void;
	isDisabled?: boolean;
	className?: string;
};

/**
 * A wrapping row of chips to press on and off, as in the phone filter sheet (BR-F03-39). A
 * chosen chip takes the accent outline and tint and a check mark, so the choice is not shown by
 * colour alone. The group is one Tab stop: the arrow keys move between chips, and Space or
 * Enter presses one. With one choice it is a radio group; with several, each chip is a toggle
 * button.
 */
export function ToggleChips({
	label,
	options,
	selectionMode = "multiple",
	value,
	onChange,
	isDisabled = false,
	className,
}: Readonly<ToggleChipsProps>) {
	return (
		<AriaToggleButtonGroup
			aria-label={label}
			selectionMode={selectionMode}
			disallowEmptySelection={selectionMode === "single"}
			selectedKeys={value}
			onSelectionChange={(keys) => {
				const next = options
					.map((option) => option.value)
					.filter((key) => keys.has(key));
				// React Aria reports a press on the one chosen chip as a choice of it again.
				const same =
					next.length === value.length
					&& next.every((key) => value.includes(key));
				if (!same) onChange(next);
			}}
			isDisabled={isDisabled}
			className={cn("flex flex-wrap gap-1.5", className)}
		>
			{options.map((option) => (
				<AriaToggleButton
					key={option.value}
					id={option.value}
					className={cn(
						"text-label text-ink bg-page border-line-strong inline-flex h-10 cursor-pointer items-center gap-1.5 rounded-full border px-3.5 font-medium whitespace-nowrap max-md:min-h-11",
						"hover:bg-soft transition-colors duration-(--dur-fast) ease-out",
						"selected:border-accent selected:bg-accent-soft selected:border-[1.5px] selected:hover:bg-accent-soft",
						"focus-visible:focus-ring",
						"disabled:text-ink-3 disabled:cursor-not-allowed disabled:border-dashed",
					)}
				>
					{({ isSelected }) => (
						<>
							{isSelected && (
								<Check
									aria-hidden="true"
									strokeWidth={2.5}
									className="text-accent size-3.5 shrink-0"
								/>
							)}
							{option.label}
						</>
					)}
				</AriaToggleButton>
			))}
		</AriaToggleButtonGroup>
	);
}
