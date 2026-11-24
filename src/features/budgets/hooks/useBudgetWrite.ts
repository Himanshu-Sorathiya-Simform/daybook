import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { useOnce } from "@/hooks/useOnce";
import { refreshAfterBudgetWrite } from "../lib/refresh";
import type { BudgetAnswer } from "../lib/types";
import {
	type BudgetField,
	type BudgetWriteOutcome,
	readBudgetWriteError,
} from "../lib/write-errors";

/** What a dialog does with the refusals that are its own business. */
export type BudgetRefusal<Conflict> = {
	/** How the write's refusals are read; a delete's by its own. */
	read?: (error: unknown) => BudgetWriteOutcome;
	/** The conflict view's content for a 409: the Budget saved now, and the write to resend. */
	conflictOf: (current: BudgetAnswer) => Conflict;
	/** `budget_exists` on an Add: the existing Budget opens in Change limit (flow 7.1). */
	onExists?: (current: BudgetAnswer) => void;
	/** A refusal named fields: the dialog moves focus to the first. */
	onFields?: () => void;
};

/**
 * What every Budget dialog shows of a write (F04 sections 6 to 8, BR-F04-23), the part they
 * share: one write at a time (D-575, D-615), the messages under its fields, `server`, and its
 * own line, `failure`. A 409 is `conflict`, for the conflict view the dialog draws over itself:
 * Keep theirs reads the page again and closes the dialog, through `keepTheirs`. A 404 says the
 * Budget was deleted on another device and reads the page again. A 401 or `profile_required`
 * shows nothing, since the app answers it. What differs between dialogs is given to `refuse`.
 */
export function useBudgetWrite<Conflict>(onClose: () => void) {
	const queryClient = useQueryClient();
	const sending = useOnce();
	const [failure, setFailure] = useState<string | null>(null);
	const [server, setServer] = useState<Partial<Record<BudgetField, string>>>({});
	const [conflict, setConflict] = useState<Conflict | null>(null);

	/** Clears what the server said about a field once it changes, and the line with it. */
	const clearField = (field: BudgetField) => {
		setServer((was) => {
			const next = { ...was };
			delete next[field];
			return next;
		});
		setFailure(null);
	};

	/** Clears the messages: a new press starts clean. */
	const reset = () => {
		setFailure(null);
		setServer({});
	};

	/** Shows the refusal `error` is. */
	const refuse = async (
		error: unknown,
		{
			read = readBudgetWriteError,
			conflictOf,
			onExists,
			onFields,
		}: BudgetRefusal<Conflict>,
	) => {
		const outcome = read(error);
		if (outcome.kind === "conflict") {
			setConflict(conflictOf(outcome.current));
			return;
		}
		// Any other refusal closes the view and shows where the write started.
		setConflict(null);
		if (outcome.kind === "fields") {
			setServer(outcome.fields);
			setFailure(outcome.message);
			onFields?.();
		} else if (outcome.kind === "exists") {
			onExists?.(outcome.current);
		} else if (outcome.kind === "gone") {
			setFailure(outcome.message);
			await refreshAfterBudgetWrite(queryClient, "count");
		} else if (outcome.kind === "form") {
			setFailure(outcome.message);
		}
	};

	/** Keep theirs: the page reads the saved Budget again, and the dialog closes. */
	const keepTheirs = () => {
		setConflict(null);
		void refreshAfterBudgetWrite(queryClient, "rules");
		onClose();
	};

	return {
		sending,
		failure,
		server,
		conflict,
		setConflict,
		clearField,
		reset,
		refuse,
		keepTheirs,
		closeConflict: () => setConflict(null),
	};
}
