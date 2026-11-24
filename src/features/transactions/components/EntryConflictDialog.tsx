"use client";

import type { EntryConflict } from "../hooks/useEntryWrite";
import { changedFields, type EntryLocale, type EntryValues } from "../lib/entry";
import { conflictRows, keepMineLine } from "../lib/conflict";
import type { TransactionAnswer } from "../lib/types";
import { ConflictDialog } from "./ConflictDialog";

export type EntryConflictDialogProps = {
	/** The row the edit was on, as the dialog opened. */
	editing: TransactionAnswer;
	/** The row as it is saved now, and the change that met it. */
	conflict: EntryConflict;
	/** The fields as they stand, and as the dialog opened them. */
	values: EntryValues;
	start: EntryValues;
	locale: EntryLocale;
	today: string;
	/** Closing without a choice goes back to the dialog. */
	onClose: () => void;
	onKeepMine: () => void;
	onKeepTheirs: () => void;
	isPending: boolean;
};

/**
 * The conflict view over the entry dialog (BR-F03-24): after a 409 on an edit, the user's change
 * beside the row as it is saved now. Keep mine sends the change again at the saved version;
 * Keep theirs drops it.
 */
export function EntryConflictDialog({
	editing,
	conflict,
	values,
	start,
	locale,
	today,
	onClose,
	onKeepMine,
	onKeepTheirs,
	isPending,
}: Readonly<EntryConflictDialogProps>) {
	return (
		<ConflictDialog
			isOpen
			onOpenChange={(next) => {
				if (!next) onClose();
			}}
			rows={conflictRows(editing, conflict.change, conflict.current, {
				...locale,
				today,
			})}
			keepMineLine={keepMineLine(
				changedFields(conflict.change, values, start),
			)}
			onKeepMine={onKeepMine}
			onKeepTheirs={onKeepTheirs}
			isPending={isPending}
		/>
	);
}
