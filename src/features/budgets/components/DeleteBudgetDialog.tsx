"use client";

import { useState } from "react";

import { FormAlert } from "@/components/feedback/FormAlert";
import { ConfirmDialog } from "@/components/surfaces/ConfirmDialog";
import type { BudgetRecord } from "@/lib/budgets/view";
import { uuidV7 } from "@/lib/ids";
import { useDeleteBudget } from "../hooks/useDeleteBudget";
import { deleteBody, deleteHistory, deleteTitle, DIALOG_TEXT } from "../lib/dialog";
import type { Formats } from "../lib/labels";
import { BUDGETS_TEXT } from "../lib/messages";
import { readBudgetDeleteError } from "../lib/write-errors";

export type DeleteBudgetDialogProps = {
	isOpen: boolean;
	/** The Budget to delete, at the version the page has. */
	record: BudgetRecord;
	formats: Formats;
	onClose: () => void;
	/** The delete is confirmed: every month has lost the Budget. */
	onDeleted?: (record: BudgetRecord) => void;
	className?: string;
};

/**
 * The Delete confirmation (BR-F04-06, flow 7.5): "Delete the Food Budget?", "Every month,
 * including past ones, loses its Food limit.", and with more than one change the limit
 * history's line, then Cancel and Delete Budget. Delete sends `DELETE` at the record's version
 * with a new key per press; a 404 counts as done (D-569). A refusal keeps it open with its line
 * (section 6).
 */
export function DeleteBudgetDialog({
	isOpen,
	record,
	formats,
	onClose,
	onDeleted,
	className,
}: Readonly<DeleteBudgetDialogProps>) {
	const remove = useDeleteBudget();
	const [failure, setFailure] = useState<string | null>(null);
	const history = deleteHistory(record, formats);

	const confirm = async () => {
		setFailure(null);
		try {
			await remove.mutateAsync({
				id: record.id,
				version: record.version,
				idempotencyKey: uuidV7(),
			});
			onDeleted?.(record);
			onClose();
		} catch (error) {
			const outcome = readBudgetDeleteError(error);
			if (outcome.kind === "refused") setFailure(outcome.message);
			// The conflict view comes with Undo (C9); until then the delete says it failed.
			if (outcome.kind === "conflict") setFailure(BUDGETS_TEXT.deleteFailed);
		}
	};

	return (
		<ConfirmDialog
			title={deleteTitle(record.category)}
			isOpen={isOpen}
			// It only ever reports closing.
			onOpenChange={onClose}
			confirmLabel={DIALOG_TEXT.deleteBudget}
			tone="danger"
			isPending={remove.isPending}
			onConfirm={() => void confirm()}
			{...(className ? { className } : {})}
		>
			<div className="flex flex-col gap-2">
				<p className="text-ink">{deleteBody(record.category)}</p>
				{history && <p>{history}</p>}
				{failure && <FormAlert>{failure}</FormAlert>}
			</div>
		</ConfirmDialog>
	);
}
