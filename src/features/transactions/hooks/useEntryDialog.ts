import { createContext, useContext, useEffect } from "react";

import type { TransactionAnswer } from "../lib/types";

/** How a create was saved: Save, which closes the dialog, or "Save and add another". */
export type SaveKind = "save" | "again";

/** What answers a confirmed create: a toast, and on the Transactions page the selection
 * (BR-F03-21, BR-F03-22, D-548). */
export type CreatedAnswer = (row: TransactionAnswer, kind: SaveKind) => void;

export type EntryDialogApi = {
	/** Opens a new Transaction (BR-F03-48). `onClose` runs once that dialog closes, saved or
	 * not. While a dialog is open, it does nothing. */
	openNew: (options?: { onClose?: () => void }) => void;
	/** Makes `answer` the one that answers creates, in place of "Transaction saved.", and
	 * answers the call that takes it back. */
	answerCreates: (answer: CreatedAnswer) => () => void;
};

export const EntryDialogContext = createContext<EntryDialogApi | null>(null);

/** The entry dialog of the logged-in layout (D-548). */
export function useEntryDialog(): EntryDialogApi {
	const api = useContext(EntryDialogContext);
	if (!api) throw new Error("useEntryDialog needs the EntryDialogHost above it.");
	return api;
}

/** Answers creates with `answer` while the caller is mounted: the Transactions page selects
 * the new row or says it is hidden by the filters. */
export function useCreatedAnswer(answer: CreatedAnswer): void {
	const { answerCreates } = useEntryDialog();
	useEffect(() => answerCreates(answer), [answerCreates, answer]);
}
