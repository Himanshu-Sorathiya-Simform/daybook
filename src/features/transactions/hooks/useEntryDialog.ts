import { createContext, useContext, useEffect } from "react";

import type { TransactionAnswer } from "../lib/types";

/** How a create was saved: Save, which closes the dialog, or "Save and add another". */
export type SaveKind = "save" | "again";

/** What answers a confirmed create: a toast, and on the Transactions page the selection
 * (BR-F03-21, BR-F03-22, D-548). */
export type CreatedAnswer = (row: TransactionAnswer, kind: SaveKind) => void;

/** What answers an edit that found its row deleted elsewhere (BR-F03-25), beside the message:
 * on the Transactions page, clearing the selection. */
export type GoneAnswer = (id: string) => void;

type OpenOptions = { onClose?: () => void };

export type EntryDialogApi = {
	/** Opens a new Transaction (BR-F03-48). `onClose` runs once that dialog closes, saved or
	 * not. While a dialog is open, it does nothing, and so do the two below. */
	openNew: (options?: OpenOptions) => void;
	/** Opens "Edit Transaction" for a row (BR-F03-23). */
	openEdit: (row: TransactionAnswer, options?: OpenOptions) => void;
	/** Opens "Duplicate Transaction", a new Transaction with the row's values (BR-F03-28). */
	openDuplicate: (row: TransactionAnswer, options?: OpenOptions) => void;
	/** Makes `answer` the one that answers creates, in place of "Transaction saved.", and
	 * answers the call that takes it back. */
	answerCreates: (answer: CreatedAnswer) => () => void;
	/** Adds `answer` to a deleted row's message, and answers the call that takes it back. */
	answerGone: (answer: GoneAnswer) => () => void;
};

export const EntryDialogContext = createContext<EntryDialogApi | null>(null);

/** Whether the entry dialog is open, for shortcuts that must wait while it is (BR-F03-52). */
export const EntryDialogOpenContext = createContext(false);

/** The entry dialog of the logged-in layout (D-548). */
export function useEntryDialog(): EntryDialogApi {
	const api = useContext(EntryDialogContext);
	if (!api) throw new Error("useEntryDialog needs the EntryDialogHost above it.");
	return api;
}

/** Whether the entry dialog is open. */
export function useEntryDialogOpen(): boolean {
	return useContext(EntryDialogOpenContext);
}

/** Answers creates with `answer` while the caller is mounted: the Transactions page selects
 * the new row or says it is hidden by the filters. */
export function useCreatedAnswer(answer: CreatedAnswer): void {
	const { answerCreates } = useEntryDialog();
	useEffect(() => answerCreates(answer), [answerCreates, answer]);
}

/** Answers an edit's deleted row with `answer` while the caller is mounted: the Transactions
 * page clears the selection. */
export function useGoneAnswer(answer: GoneAnswer): void {
	const { answerGone } = useEntryDialog();
	useEffect(() => answerGone(answer), [answerGone, answer]);
}
