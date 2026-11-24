"use client";

import type { DialogConflict as DialogConflictState } from "../hooks/useWriteRefusal";
import {
	applyRequest,
	CONFLICT_TEXT,
	conflictRows,
	type ConflictFields,
	fieldsOf,
} from "../lib/conflict";
import type { Formats } from "../lib/labels";
import { ConflictDialog } from "./ConflictDialog";

export type DialogConflictProps = {
	conflict: DialogConflictState;
	/** What the dialog is about, as it was opened: what a delete's view shows as the user's. */
	origin: ConflictFields;
	formats: Formats;
	/** While Keep mine's resend runs. */
	isPending: boolean;
	onKeepMine: () => void;
	onKeepTheirs: () => void;
	/** Closing without a choice goes back to the dialog. */
	onClose: () => void;
};

/**
 * The conflict view a dialog draws over itself after a 409 (BR-F05-34): the user's write put
 * over the Subscription saved now, beside it. Keep mine sends the same write again against the
 * saved version, Keep theirs sends nothing. A delete reads "Delete anyway" and "Keep it".
 */
export function DialogConflict({
	conflict,
	origin,
	formats,
	isPending,
	onKeepMine,
	onKeepTheirs,
	onClose,
}: Readonly<DialogConflictProps>) {
	const { current, request } = conflict;
	const isDelete = request.kind === "delete";
	const yours = isDelete ? origin : applyRequest(fieldsOf(current), request);
	return (
		<ConflictDialog
			isOpen
			// It only ever reports closing.
			onOpenChange={onClose}
			rows={conflictRows(yours, fieldsOf(current), formats)}
			keepMineLine={
				isDelete ? CONFLICT_TEXT.deleteLine : CONFLICT_TEXT.writeLine
			}
			isDelete={isDelete}
			isPending={isPending}
			onKeepMine={onKeepMine}
			onKeepTheirs={onKeepTheirs}
		/>
	);
}
