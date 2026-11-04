"use client";

import { GridListItem as AriaGridListItem } from "react-aria-components";

import { TransactionRow } from "@/components/data/TransactionRow";
import { cn } from "@/lib/cn";
import type { Group, Transaction } from "@/lib/transactions/model";
import { type LabelLocale, rowDisplay, rowName } from "../lib/labels";

export type TransactionListItemProps = {
	row: Transaction;
	/** The list's grouping, which decides how the row words its time (BR-F03-31). */
	group: Group;
	locale: LabelLocale;
	className?: string;
};

/** One row of the Transactions list: a GridList row holding `TransactionRow` (BR-F03-32). React
 * Aria names the row by its text value, so that holds the whole reading, title first. */
export function TransactionListItem({
	row,
	group,
	locale,
	className,
}: Readonly<TransactionListItemProps>) {
	const shown = rowDisplay(row, group, locale);
	return (
		<AriaGridListItem
			id={row.id}
			textValue={rowName(shown, locale)}
			className={cn(
				"rounded-control focus-visible:focus-ring -mx-2 cursor-default px-2 outline-none",
				className,
			)}
		>
			<TransactionRow {...shown} />
		</AriaGridListItem>
	);
}
