"use client";

import { ConflictView } from "@/components/surfaces/ConflictView";
import { CONFLICT_TEXT, type ConflictRow } from "../lib/conflict";

export type ConflictDialogProps = {
	isOpen: boolean;
	/** Closing without a choice goes back to where the write started. */
	onOpenChange: (isOpen: boolean) => void;
	/** From `conflictRows`: each value, the user's version beside the saved one. */
	rows: readonly ConflictRow[];
	/** What Keep mine does, from `CONFLICT_TEXT`. */
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
 * The Subscription conflict view (BR-F05-34): after a 409 from a save, a delete, a skip or an
 * Undo, the user's version beside the one saved now, a row per value, a row that reads
 * differently tinted and marked "Differs", so colour is never the only sign. Keep mine sends
 * the write again against the saved version, Keep theirs sends nothing. For a delete the choices
 * read "Delete anyway" and "Keep it".
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
			rowHeading={CONFLICT_TEXT.field}
			isDelete={isDelete}
			isOpen={isOpen}
			onOpenChange={onOpenChange}
			rows={rows.map((row) => ({
				key: row.key,
				label: row.label,
				differs: row.differs,
				mine: row.mine,
				theirs: row.theirs,
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
