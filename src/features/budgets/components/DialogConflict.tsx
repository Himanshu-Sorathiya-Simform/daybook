"use client";

import type { BudgetRules } from "@/lib/budgets/model";
import { conflictRows } from "../lib/conflict";
import type { Formats } from "../lib/labels";
import { ConflictDialog } from "./ConflictDialog";

export type DialogConflictProps = {
	/** The user's version of the Budget: what their change, delete or Undo would leave. */
	yours: BudgetRules;
	/** The Budget as it is saved now. */
	current: BudgetRules;
	formats: Formats;
	/** What Keep mine saves; a delete's view has none. */
	keepMineLine?: string | undefined;
	/** The view for a delete: "Delete anyway" and "Keep it". */
	isDelete?: boolean;
	/** While Keep mine's resend runs: both choices wait, and so does closing. */
	isPending: boolean;
	/** Closing without a choice goes back to where the write started. */
	onClose: () => void;
	onKeepMine: () => void;
	onKeepTheirs: () => void;
};

/**
 * The conflict view of a refused Budget write (BR-F04-23, D-567): the user's version beside the
 * one saved now, a row per month either holds an entry in. Every place a 409 can meet draws it
 * this way: a save and a delete in their dialogs, and an Undo or a Remove over the page.
 */
export function DialogConflict({
	yours,
	current,
	formats,
	keepMineLine,
	isDelete = false,
	isPending,
	onClose,
	onKeepMine,
	onKeepTheirs,
}: Readonly<DialogConflictProps>) {
	return (
		<ConflictDialog
			isOpen
			isDelete={isDelete}
			// It only ever reports closing.
			onOpenChange={onClose}
			rows={conflictRows(yours, current, formats)}
			keepMineLine={keepMineLine}
			isPending={isPending}
			onKeepMine={onKeepMine}
			onKeepTheirs={onKeepTheirs}
		/>
	);
}
