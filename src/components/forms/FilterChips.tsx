"use client";

import { X } from "lucide-react";
import {
	Button as AriaButton,
	Tag as AriaTag,
	TagGroup as AriaTagGroup,
	TagList as AriaTagList,
} from "react-aria-components";

import { cn } from "@/lib/cn";

export type FilterChip = {
	/** Unique among the chips, such as "date" or "category:food". */
	id: string;
	/** "5 Oct to 20 Oct", "Food", "₹1,000 to ₹2,500" or “swiggy” (BR-F03-39). */
	label: string;
};

export type FilterChipsProps = {
	/** The group's name for screen readers, "Active filters". */
	label: string;
	chips: readonly FilterChip[];
	/** Removes one filter. */
	onRemove: (id: string) => void;
	/** Removes them all. */
	onClearAll: () => void;
	className?: string;
};

/**
 * The active filters as removable chips (BR-F03-39), then Clear all. Each chip's remove button
 * is named "Remove <label>". React Aria gives the keyboard: Tab reaches the group once, then
 * the focused chip's remove button; the arrows move between chips; and Delete or Backspace
 * removes the focused one. Nothing shows while no filter is on.
 */
export function FilterChips({
	label,
	chips,
	onRemove,
	onClearAll,
	className,
}: Readonly<FilterChipsProps>) {
	if (chips.length === 0) return null;
	return (
		<div className={cn("flex flex-wrap items-center gap-1.5", className)}>
			<AriaTagGroup
				aria-label={label}
				onRemove={(keys) => {
					for (const key of keys) onRemove(String(key));
				}}
			>
				<AriaTagList
					items={chips}
					className="flex flex-wrap items-center gap-1.5"
				>
					{(chip) => (
						<AriaTag
							id={chip.id}
							textValue={chip.label}
							className="rounded-chip bg-soft text-caption text-ink focus-visible:focus-ring inline-flex h-7 cursor-default items-center gap-1 pr-1 pl-2.5 font-medium outline-none max-md:h-11"
						>
							{chip.label}
							<AriaButton
								slot="remove"
								className="text-ink-2 hover:text-ink inline-flex size-5 cursor-pointer items-center justify-center rounded-full max-md:size-9"
							>
								<X
									aria-hidden="true"
									className="size-3"
								/>
							</AriaButton>
						</AriaTag>
					)}
				</AriaTagList>
			</AriaTagGroup>
			<AriaButton
				onPress={onClearAll}
				className="rounded-control text-caption text-accent inline-flex h-7 cursor-pointer items-center px-1.5 font-semibold max-md:min-h-11"
			>
				Clear all
			</AriaButton>
		</div>
	);
}
