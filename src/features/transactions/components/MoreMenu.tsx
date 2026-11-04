"use client";

import { ChoiceGroup } from "@/components/forms/ChoiceGroup";
import { FilterPopover } from "@/components/forms/FilterPopover";
import { SOURCES, type Source } from "@/lib/transactions/model";
import { SOURCE_LABELS } from "../lib/filter-labels";

export type MoreMenuProps = {
	/** The committed source; none is any source. */
	value: Source | undefined;
	/** A new source, none for any, committed at once. */
	onChange: (value: Source | undefined) => void;
	/** Each source's count under every other filter (BR-F03-59), once loaded. */
	counts?: Record<Source, number> | undefined;
	/** Whether the counts are on their way, so each holds its place. */
	countsPending?: boolean;
	onOpenChange?: (isOpen: boolean) => void;
	className?: string;
};

/**
 * The More control (BR-F03-39): a trigger reading "More", with "1" while a source is chosen,
 * opening Source: "Any source", "Added by you" and "Subscription charges", each with its
 * count. Any source counts both. A choice commits at once, and the popover stays open.
 */
export function MoreMenu({
	value,
	onChange,
	counts,
	countsPending = false,
	onOpenChange,
	className,
}: Readonly<MoreMenuProps>) {
	const count = (source: Source | "any") => {
		if (!counts) return {};
		return {
			count:
				source === "any" ?
					counts.manual + counts.subscription
				:	counts[source],
		};
	};
	return (
		<FilterPopover
			label="More"
			{...(value ? { value: "1" } : {})}
			isActive={value !== undefined}
			align="end"
			width="sm"
			{...(onOpenChange ? { onOpenChange } : {})}
			{...(className ? { className } : {})}
		>
			<ChoiceGroup
				label="Source"
				value={value ?? "any"}
				options={(["any", ...SOURCES] as const).map((source) => ({
					value: source,
					label: SOURCE_LABELS[source],
					...count(source),
					countPending: countsPending,
				}))}
				onChange={(next) =>
					onChange(next === "any" ? undefined : (next as Source))
				}
				className="px-1"
			/>
		</FilterPopover>
	);
}
