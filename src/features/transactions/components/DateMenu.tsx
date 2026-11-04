"use client";

import { useState } from "react";

import { ChoiceGroup } from "@/components/forms/ChoiceGroup";
import { FilterPopover } from "@/components/forms/FilterPopover";
import type { WeekStart } from "@/lib/geo";
import {
	DATE_PRESETS,
	type DatePreset,
	type RangePreset,
} from "@/lib/transactions/model";
import { presetRange } from "@/lib/transactions/presets";
import type { TransactionFilter } from "@/lib/transactions/url";
import {
	dateLabel,
	type FilterLocale,
	PRESET_LABELS,
	presetOfFilter,
} from "../lib/filter-labels";
import { CustomRange } from "./CustomRange";

/** The dates a filter holds, or none for all time. */
export type DateBounds = { from: string; to: string } | null;

export type DateMenuProps = {
	filter: TransactionFilter;
	/** New dates, none for all time, committed at once. */
	onChange: (dates: DateBounds) => void;
	locale: FilterLocale;
	firstDayOfWeek: WeekStart;
	/** Each preset's count under every other filter (BR-F03-59), once loaded. */
	counts?: Record<Exclude<DatePreset, "custom">, number> | undefined;
	/** The header's count for the committed filter, for Custom's line. */
	count: number | undefined;
	onOpenChange?: (isOpen: boolean) => void;
	className?: string;
};

/**
 * The Date control (BR-F03-39): a trigger reading "Date All time", a preset's name or "5 Oct
 * to 20 Oct", opening the presets with their counts. A preset commits its dates from today in
 * the profile zone (D-227) and closes the popover. Custom range keeps it open and widens it
 * for the From and To fields and the range calendar, with Done; a committed range that is no
 * preset today opens there.
 */
export function DateMenu({
	filter,
	onChange,
	locale,
	firstDayOfWeek,
	counts,
	count,
	onOpenChange,
	className,
}: Readonly<DateMenuProps>) {
	const preset = presetOfFilter(filter, locale.today);
	const [custom, setCustom] = useState(false);
	const showCustom = custom || preset === "custom";
	const range =
		filter.from !== undefined ? { start: filter.from, end: filter.to! } : null;

	return (
		<FilterPopover
			label="Date"
			value={dateLabel(filter, locale)}
			isActive={preset !== "all"}
			width={showCustom ? "xl" : "sm"}
			showDone={showCustom}
			onOpenChange={(isOpen) => {
				if (!isOpen) setCustom(false);
				onOpenChange?.(isOpen);
			}}
			{...(className ? { className } : {})}
		>
			{(close) => (
				<>
					<ChoiceGroup
						label="Date"
						value={showCustom ? "custom" : preset}
						options={DATE_PRESETS.map((key) => ({
							value: key,
							label: PRESET_LABELS[key],
							...(counts && key !== "custom" ?
								{ count: counts[key] }
							:	{}),
						}))}
						onChange={(key) => {
							if (key === "custom") {
								setCustom(true);
								return;
							}
							setCustom(false);
							onChange(
								key === "all" ? null : (
									presetRange(key as RangePreset, locale.today)
								),
							);
							close();
						}}
						className="px-1"
					/>
					{showCustom && (
						<CustomRange
							value={range}
							onChange={({ start, end }) =>
								onChange({ from: start, to: end })
							}
							today={locale.today}
							firstDayOfWeek={firstDayOfWeek}
							count={count}
							className="border-line mt-1.5 border-t px-1 pt-2.5"
						/>
					)}
				</>
			)}
		</FilterPopover>
	);
}
