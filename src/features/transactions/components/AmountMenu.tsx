"use client";

import { Button } from "@/components/actions/Button";
import { FilterPopover } from "@/components/forms/FilterPopover";
import { amountLabel, type FilterLocale } from "../lib/filter-labels";
import { type AmountBounds, quickRanges } from "../lib/quick-ranges";
import type { HistogramAnswer } from "../lib/types";
import { AmountBlock } from "./AmountBlock";

export type AmountMenuProps = {
	bounds: AmountBounds;
	/** New bounds, none for any amount, committed at once. */
	onChange: (bounds: AmountBounds) => void;
	histogram: Pick<HistogramAnswer, "edges" | "counts"> | undefined;
	isLoading: boolean;
	/** The header's count for the committed filter. */
	count: number | undefined;
	locale: FilterLocale;
	onOpenChange?: (isOpen: boolean) => void;
	className?: string;
};

/**
 * The Amount control (BR-F03-39): a trigger reading "Amount Any", or the amount chip's label,
 * opening the amount block with Clear, which drops both bounds at once. Like every menu it has
 * no Done: each change applies, and Escape, a press outside or the trigger closes it (D-547).
 */
export function AmountMenu({
	bounds,
	onChange,
	histogram,
	isLoading,
	count,
	locale,
	onOpenChange,
	className,
}: Readonly<AmountMenuProps>) {
	const label = amountLabel(
		bounds,
		locale,
		histogram ? quickRanges(histogram) : [],
	);
	return (
		<FilterPopover
			label="Amount"
			value={label ?? "Any"}
			isActive={label !== null}
			align="end"
			width="lg"
			footer={
				<Button
					variant="ghost"
					size="sm"
					isDisabled={label === null}
					onPress={() => onChange({})}
					className="-ms-2"
				>
					Clear
				</Button>
			}
			{...(onOpenChange ? { onOpenChange } : {})}
			{...(className ? { className } : {})}
		>
			<AmountBlock
				bounds={bounds}
				onChange={onChange}
				histogram={histogram}
				isLoading={isLoading}
				count={count}
				locale={locale}
				className="px-1 pt-1"
			/>
		</FilterPopover>
	);
}
