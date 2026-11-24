"use client";

import { TransactionRow } from "@/components/data/TransactionRow";
import { ConfirmDialog } from "@/components/surfaces/ConfirmDialog";
import { type LabelLocale, rowDisplay } from "../lib/labels";
import { TRANSACTIONS_TEXT } from "../lib/messages";
import type { TransactionAnswer } from "../lib/types";

export type DeleteTransactionDialogProps = {
	/** The row to delete, shown as the list shows it. */
	row: TransactionAnswer;
	locale: LabelLocale;
	/** Cancel keeps the row. */
	onClose: () => void;
	/** Delete starts the Undo window. */
	onConfirm: () => void;
};

/**
 * "Delete this Transaction?" (BR-F03-26, D-84): the row as the list shows it and what a delete
 * does. Cancel keeps it; Delete starts the Undo window.
 */
export function DeleteTransactionDialog({
	row,
	locale,
	onClose,
	onConfirm,
}: Readonly<DeleteTransactionDialogProps>) {
	return (
		<ConfirmDialog
			title={TRANSACTIONS_TEXT.deleteTitle}
			isOpen
			onOpenChange={(open) => {
				if (!open) onClose();
			}}
			confirmLabel="Delete"
			onConfirm={onConfirm}
		>
			<div className="flex flex-col gap-3">
				<TransactionRow
					{...rowDisplay(row, "none", locale)}
					className="border-line rounded-control border px-3"
				/>
				<p>{TRANSACTIONS_TEXT.deleteBody}</p>
			</div>
		</ConfirmDialog>
	);
}
