import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { DIALOG_TEXT } from "../lib/dialog";
import { refreshAfterSubscriptionWrite } from "../lib/refresh";
import {
	readSubscriptionWriteError,
	type SubscriptionField,
	type SubscriptionWriteOutcome,
} from "../lib/write-errors";

/**
 * What a dialog shows of a refused write (F05 sections 6 to 8): the messages under the fields it
 * has, `fields`, and its own line, `failure`. `own` names the fields the dialog has a box for; a
 * 422 message for any other path is the line. A 404 says the Subscription was deleted on another
 * device and reads the page again; a 409 says it changed on another device until the conflict
 * view arrives with the notices, and also reads the page again. A 401 or `profile_required` shows
 * nothing, since the app answers it.
 */
export function useWriteRefusal(own: readonly SubscriptionField[]) {
	const queryClient = useQueryClient();
	const [failure, setFailure] = useState<string | null>(null);
	const [fields, setFields] = useState<Partial<Record<SubscriptionField, string>>>(
		{},
	);

	/** Clears one field's message once it changes, and the line with it. */
	const clearField = (field: SubscriptionField) => {
		setFields((current) => {
			const next = { ...current };
			delete next[field];
			return next;
		});
		setFailure(null);
	};

	/** Clears everything: a new press starts clean. */
	const reset = () => {
		setFields({});
		setFailure(null);
	};

	/** Shows the refusal `error` is, and answers which kind it was, so the dialog can move focus
	 * to a field that has a message. */
	const refuse = async (
		error: unknown,
	): Promise<SubscriptionWriteOutcome["kind"]> => {
		const outcome = readSubscriptionWriteError(error);
		if (outcome.kind === "handled") return outcome.kind;
		if (outcome.kind === "fields") {
			const mapped: Partial<Record<SubscriptionField, string>> = {};
			let line = outcome.message;
			for (const [field, text] of Object.entries(outcome.fields)) {
				if (own.includes(field as SubscriptionField)) {
					mapped[field as SubscriptionField] = text;
				} else line ??= text;
			}
			setFields(mapped);
			setFailure(line);
		} else if (outcome.kind === "conflict") {
			setFailure(DIALOG_TEXT.conflict);
			await refreshAfterSubscriptionWrite(queryClient, {
				count: false,
				charges: false,
			});
		} else if (outcome.kind === "gone") {
			setFailure(outcome.message);
			await refreshAfterSubscriptionWrite(queryClient, {
				count: true,
				charges: true,
			});
		} else {
			setFailure(outcome.message);
		}
		return outcome.kind;
	};

	return { failure, fields, clearField, reset, refuse, setFailure };
}
