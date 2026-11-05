import { createContext, useContext, useEffect } from "react";

import type { TransactionAnswer } from "../lib/types";

/** What answers a row that comes back after a delete: Undo, or Keep it in the conflict view.
 * On the Transactions page it selects the row again (BR-F03-73). */
export type RestoredAnswer = (row: TransactionAnswer) => void;

export type TransactionDeletesApi = {
	/** Deletes a row with Undo (BR-F03-26, D-84): "Delete this Transaction?" asks first; once
	 * confirmed, `onConfirmed` runs, the row leaves the screen, "Transaction deleted." offers
	 * Undo for 5 seconds, and then the request is sent. A row already on its way out, or a second
	 * delete while the confirm is open, is left alone. */
	remove: (row: TransactionAnswer, options?: { onConfirmed?: () => void }) => void;
	/** Makes `answer` the one that answers a returning row, and answers the call that takes it
	 * back. */
	answerRestores: (answer: RestoredAnswer) => () => void;
};

export const TransactionDeletesContext = createContext<TransactionDeletesApi | null>(
	null,
);

const NONE: ReadonlySet<string> = new Set();

/** The ids of rows deleted in this tab, waiting out their Undo or confirmed: lists leave them
 * out, so a confirmed row never shows again while a list still holds it (BR-F03-26). */
export const DeletedRowsContext = createContext<ReadonlySet<string>>(NONE);

/** Whether the delete confirm or the delete's conflict view is open, for shortcuts that must
 * wait while it is (BR-F03-52). */
export const DeleteDialogOpenContext = createContext(false);

/** The deletes of the logged-in layout. */
export function useTransactionDeletes(): TransactionDeletesApi {
	const api = useContext(TransactionDeletesContext);
	if (!api) {
		throw new Error(
			"useTransactionDeletes needs the TransactionDeletesHost above it.",
		);
	}
	return api;
}

/** The ids of rows deleted in this tab, which lists leave out. */
export function useDeletedRows(): ReadonlySet<string> {
	return useContext(DeletedRowsContext);
}

/** Answers a returning row with `answer` while the caller is mounted. */
export function useRestoredAnswer(answer: RestoredAnswer): void {
	const { answerRestores } = useTransactionDeletes();
	useEffect(() => answerRestores(answer), [answerRestores, answer]);
}

/** Whether a delete's confirm or conflict view is open. */
export function useDeleteDialogOpen(): boolean {
	return useContext(DeleteDialogOpenContext);
}
