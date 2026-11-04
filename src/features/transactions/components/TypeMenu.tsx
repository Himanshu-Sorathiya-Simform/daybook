"use client";

import { Choice } from "@/components/forms/Choice";
import { FilterPopover } from "@/components/forms/FilterPopover";
import type { TxnType } from "@/lib/transactions/model";
import { choiceSummary, FILTER_TYPES, TYPE_LABELS } from "../lib/filter-labels";

export type TypeMenuProps = {
	/** The committed types; none filters nothing. */
	value: readonly TxnType[] | undefined;
	/** A new set of types, none to drop the filter, committed at once. */
	onChange: (value: TxnType[] | undefined) => void;
	/** Each type's count under every other filter (BR-F03-59), once loaded. */
	counts?: Record<TxnType, number> | undefined;
	/** Whether the counts are on their way, so each holds its place. */
	countsPending?: boolean;
	onOpenChange?: (isOpen: boolean) => void;
	className?: string;
};

/**
 * The Type control (BR-F03-39): a trigger reading "Type Any", a type's name or how many are
 * chosen, opening a checkbox per type with its count. Until M2 it offers Expense, Income and
 * Refund. Each press commits, and the popover stays open.
 */
export function TypeMenu({
	value,
	onChange,
	counts,
	countsPending = false,
	onOpenChange,
	className,
}: Readonly<TypeMenuProps>) {
	const chosen = value ?? [];
	const toggle = (type: TxnType, on: boolean) => {
		const next =
			on ? [...chosen, type] : chosen.filter((other) => other !== type);
		onChange(next.length ? next : undefined);
	};
	return (
		<FilterPopover
			label="Type"
			value={choiceSummary(value, (type) => TYPE_LABELS[type])}
			isActive={chosen.length > 0}
			width="sm"
			{...(onOpenChange ? { onOpenChange } : {})}
			{...(className ? { className } : {})}
		>
			<div
				role="group"
				aria-label="Type"
				className="flex flex-col gap-0.5 px-1"
			>
				{FILTER_TYPES.map((type) => (
					<Choice
						key={type}
						label={TYPE_LABELS[type]}
						isSelected={chosen.includes(type)}
						onChange={(on) => toggle(type, on)}
						{...(counts ? { count: counts[type] } : {})}
						countPending={countsPending}
					/>
				))}
			</div>
		</FilterPopover>
	);
}
