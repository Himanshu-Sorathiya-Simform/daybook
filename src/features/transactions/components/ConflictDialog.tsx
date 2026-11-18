"use client";

import { ConflictView } from "@/components/surfaces/ConflictView";
import { CONFLICT_TEXT, type ConflictRow } from "../lib/conflict";

export type ConflictDialogProps = {
	isOpen: boolean;
	/** Closing without a choice goes back to the edit dialog, which keeps what was typed. */
	onOpenChange: (isOpen: boolean) => void;
	/** Every field of both versions, from `conflictRows`. */
	rows: readonly ConflictRow[];
	/** What Keep mine saves, from `keepMineLine`; a delete's view has none. */
	keepMineLine?: string;
	/** The view for a delete (BR-P1-26): the row as it was deleted beside the saved one, with
	 * "Delete anyway" and "Keep it". */
	isDelete?: boolean;
	onKeepMine: () => void;
	onKeepTheirs: () => void;
	/** While Keep mine's resend runs: both choices wait, and so does closing. */
	isPending?: boolean;
	className?: string;
};

/**
 * The conflict view (BR-F03-24, BR-P1-26, BR-F03-78): after a 409, the user's version beside
 * the one saved now, field by field, each difference marked with "Differs" as well as a tint, so
 * colour is never the only sign. Keep mine resends the user's change against the saved version;
 * Keep theirs drops it. For a delete, the row as it was deleted sits beside the saved one, and
 * the choices read "Delete anyway" and "Keep it" (BR-F03-26).
 */
export function ConflictDialog({
	isOpen,
	onOpenChange,
	rows,
	keepMineLine,
	isDelete = false,
	onKeepMine,
	onKeepTheirs,
	isPending = false,
	className,
}: Readonly<ConflictDialogProps>) {
	return (
		<ConflictView
			title={CONFLICT_TEXT.title}
			intro={isDelete ? CONFLICT_TEXT.deleteIntro : CONFLICT_TEXT.intro}
			isOpen={isOpen}
			onOpenChange={onOpenChange}
			headings={{
				row: CONFLICT_TEXT.field,
				mine: isDelete ? CONFLICT_TEXT.deletedMine : CONFLICT_TEXT.mine,
				theirs: CONFLICT_TEXT.theirs,
			}}
			rows={rows.map((row) => ({
				key: row.field,
				label: row.label,
				differs: row.differs,
				mine: row.mine,
				theirs: row.theirs,
			}))}
			differsLabel={CONFLICT_TEXT.differs}
			keepMineLabel={
				isDelete ? CONFLICT_TEXT.deleteAnyway : CONFLICT_TEXT.keepMine
			}
			keepTheirsLabel={
				isDelete ? CONFLICT_TEXT.keepIt : CONFLICT_TEXT.keepTheirs
			}
			onKeepMine={onKeepMine}
			onKeepTheirs={onKeepTheirs}
			keepMineLine={keepMineLine}
			isPending={isPending}
			{...(className ? { className } : {})}
		/>
	);
}
