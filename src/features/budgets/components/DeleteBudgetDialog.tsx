"use client";

import { FormAlert } from "@/components/feedback/FormAlert";
import { ConfirmDialog } from "@/components/surfaces/ConfirmDialog";
import type { BudgetRecord } from "@/lib/budgets/view";
import { uuidV7 } from "@/lib/ids";
import { useBudgetWrite } from "../hooks/useBudgetWrite";
import { useDeleteBudget } from "../hooks/useDeleteBudget";
import { deleteBody, deleteHistory, deleteTitle, DIALOG_TEXT } from "../lib/dialog";
import type { Formats } from "../lib/labels";
import type { BudgetAnswer } from "../lib/types";
import { readBudgetDeleteRefusal } from "../lib/write-errors";
import { DialogConflict } from "./DialogConflict";

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
 * (section 6). A 409 opens the conflict view with "Delete anyway", which deletes the Budget as
 * it is saved now, and "Keep it" (BR-F04-23).
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
	// A 409: the Budget saved now, beside the one the user chose to delete (BR-F04-23).
	const write = useBudgetWrite<BudgetAnswer>(onClose);
	const { failure, conflict } = write;
	const history = deleteHistory(record, formats);

	/** Deletes at `version`: the record's, or after a conflict the saved one ("Delete anyway").
	 * The Budget deleted, for the notice's Undo, is the one at that version. */
	const confirm = async (version: number, deleted: BudgetRecord) => {
		// A second press, Enter included, sends nothing while the delete is out (D-615).
		const request = write.sending.run(() =>
			remove.mutateAsync({
				id: record.id,
				version,
				idempotencyKey: uuidV7(),
			}),
		);
		if (request === null) return;
		write.reset();
		try {
			await request;
			write.setConflict(null);
			onDeleted?.(deleted);
			onClose();
		} catch (error) {
			await write.refuse(error, {
				read: readBudgetDeleteRefusal,
				conflictOf: (current) => current,
			});
		}
	};

	return (
		<>
			<ConfirmDialog
				title={deleteTitle(record.category)}
				isOpen={isOpen}
				// It only ever reports closing.
				onOpenChange={onClose}
				confirmLabel={DIALOG_TEXT.deleteBudget}
				tone="danger"
				isPending={remove.isPending}
				onConfirm={() => void confirm(record.version, record)}
				{...(className ? { className } : {})}
			>
				<div className="flex flex-col gap-2">
					<p className="text-ink">{deleteBody(record.category)}</p>
					{history && <p>{history}</p>}
					{failure && <FormAlert>{failure}</FormAlert>}
				</div>
			</ConfirmDialog>
			{conflict && (
				<DialogConflict
					yours={record}
					current={conflict}
					formats={formats}
					isDelete
					isPending={remove.isPending}
					onClose={write.closeConflict}
					onKeepMine={() =>
						void confirm(conflict.version, {
							...record,
							version: conflict.version,
							schedule: conflict.schedule,
							overrides: conflict.overrides,
						})
					}
					onKeepTheirs={write.keepTheirs}
				/>
			)}
		</>
	);
}
