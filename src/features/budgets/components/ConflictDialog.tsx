"use client";

import { ConflictView } from "@/components/surfaces/ConflictView";
import { CONFLICT_TEXT, type ConflictRow } from "../lib/conflict";

export type ConflictDialogProps = {
	isOpen: boolean;
	/** Closing without a choice goes back to where the write started. */
	onOpenChange: (isOpen: boolean) => void;
	/** Every month either version holds an item in, from `conflictRows`. */
	rows: readonly ConflictRow[];
	/** What Keep mine saves, from `keepMineLine` or `CONFLICT_TEXT.undoLine`; a delete's view
	 * has none. */
	keepMineLine?: string | undefined;
	/** The view for a delete: "Delete anyway" and "Keep it". */
	isDelete?: boolean;
	onKeepMine: () => void;
	onKeepTheirs: () => void;
	/** While Keep mine's resend runs: both choices wait, and so does closing. */
	isPending?: boolean;
	className?: string;
};

/**
 * The Budget conflict view (BR-F04-23, D-567): after a 409 from a save, a delete, Remove or
 * Undo, the user's version beside the one saved now, a row per month that holds a schedule
 * entry or a one-month limit, each cell worded as the limit history words it. A row that reads
 * differently is tinted and marked "Differs", so colour is never the only sign. Keep mine
 * resends the write against the saved version, Keep theirs sends nothing. For a delete the
 * choices read "Delete anyway" and "Keep it".
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
			text={CONFLICT_TEXT}
			rowHeading={CONFLICT_TEXT.month}
			isDelete={isDelete}
			isOpen={isOpen}
			onOpenChange={onOpenChange}
			rows={rows.map((row) => ({
				key: row.month,
				label: row.label,
				differs: row.differs,
				mine: row.mine.join("\n"),
				theirs: row.theirs.join("\n"),
			}))}
			onKeepMine={onKeepMine}
			onKeepTheirs={onKeepTheirs}
			keepMineLine={keepMineLine}
			isPending={isPending}
			figures
			rowColumnClassName="w-[26%]"
			{...(className ? { className } : {})}
		/>
	);
}
