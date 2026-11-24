import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { useOnce } from "@/hooks/useOnce";
import { todayIn } from "@/lib/time";
import type { TransactionEditInput } from "@/lib/transactions/schemas";
import type { EntryField, EntryLocale } from "../lib/entry";
import { SERVER_FIELDS } from "../lib/entry";
import { TRANSACTIONS_TEXT } from "../lib/messages";
import { refreshAfterTransactionWrite } from "../lib/refresh";
import type { TransactionAnswer } from "../lib/types";
import { readWriteError } from "../lib/write-errors";

export type ServerMessages = Partial<Record<EntryField, string>>;

/** A 409 on an edit: the row as it is saved now, and the change that met it (BR-F03-24). */
export type EntryConflict = {
	current: TransactionAnswer;
	change: TransactionEditInput;
};

export type EntryWriteOptions = {
	/** The row an edit is on, or `null` for a new Transaction or a duplicate. */
	editing: TransactionAnswer | null;
	locale: EntryLocale;
	onClose: () => void;
	/** A refusal named fields: the dialog moves focus to the first. */
	onFieldsRefused: () => void;
};

/**
 * What the entry dialog shows of a write (flows 7.1 and 7.3, BR-F03-24): the messages under its
 * fields, `server`, and its own line, `failure`. A 409 on an edit is `conflict`, for the view
 * the dialog draws over itself; Keep theirs drops the change, reads the page again and closes
 * the dialog, through `keepTheirs`. One write goes at a time (D-615), through `sending`. What
 * is sent is `useEntrySave`'s.
 */
export function useEntryWrite({
	editing,
	locale,
	onClose,
	onFieldsRefused,
}: EntryWriteOptions) {
	const queryClient = useQueryClient();
	const sending = useOnce();
	const [server, setServer] = useState<ServerMessages>({});
	const [failure, setFailure] = useState<string | null>(null);
	const [conflict, setConflict] = useState<EntryConflict | null>(null);

	/** Clears the messages: a new press starts clean. */
	const reset = () => {
		setFailure(null);
		setServer({});
	};

	/** Clears what the server said about a field once it changes. */
	const clear = (field: EntryField) => {
		if (server[field] === undefined) return;
		setServer((messages) => {
			const rest = { ...messages };
			delete rest[field];
			return rest;
		});
	};

	/** A refused save: its messages under their fields, or one line (flows 7.1 and 7.3). */
	const refused = (error: unknown) => {
		const outcome = readWriteError(error, {
			mode: editing ? "edit" : "create",
			dateLocale: locale.dateLocale,
			today: todayIn(locale.timezone, new Date()),
		});
		if (outcome.kind === "handled") return;
		if (outcome.kind !== "fields") {
			// A conflict without its row, or a create's 404, reads as a failed save.
			setFailure(
				outcome.kind === "form" ?
					outcome.message
				:	TRANSACTIONS_TEXT.saveFailed,
			);
			return;
		}
		const messages: ServerMessages = {};
		let line = outcome.message;
		for (const [path, text] of Object.entries(outcome.fields)) {
			const field = SERVER_FIELDS[path as keyof typeof SERVER_FIELDS];
			if (field) messages[field] ??= text;
			else line ??= text;
		}
		setServer(messages);
		setFailure(line);
		onFieldsRefused();
	};

	/** Keep theirs (BR-F03-24): the change is dropped, the saved row shows everywhere, and the
	 * dialog closes. */
	const keepTheirs = (current: TransactionAnswer) => {
		setConflict(null);
		void refreshAfterTransactionWrite(queryClient, {
			kind: "edit",
			row: current,
		});
		onClose();
	};

	return {
		sending,
		server,
		failure,
		conflict,
		setConflict,
		closeConflict: () => setConflict(null),
		reset,
		clear,
		refused,
		keepTheirs,
	};
}
