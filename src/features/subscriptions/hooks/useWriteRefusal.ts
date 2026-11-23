import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import type { ChangeRequest } from "../lib/conflict";
import { refreshAfterSubscriptionWrite } from "../lib/refresh";
import { SUBSCRIPTIONS_TEXT } from "../lib/messages";
import type { SubscriptionAnswer } from "../lib/types";
import {
	readSubscriptionWriteError,
	type SubscriptionField,
	type SubscriptionWriteOutcome,
} from "../lib/write-errors";

/** A 409 on a dialog's write: the Subscription saved now, and the write to send again if the
 * user keeps theirs (BR-F05-34). */
export type DialogConflict = {
	current: SubscriptionAnswer;
	request: ChangeRequest;
};

/**
 * What a dialog shows of a refused write (F05 sections 6 to 8): the messages under the fields it
 * has, `fields`, and its own line, `failure`. `own` names the fields the dialog has a box for; a
 * 422 message for any other path is the line. A 404 says the Subscription was deleted on another
 * device and reads the page again. A 409 shows nothing in the dialog: it is `conflict`, for the
 * conflict view the dialog draws over itself, with the write to send again (BR-F05-34); Keep
 * theirs reads the page again, through `dropConflict`. A 401 or `profile_required` shows
 * nothing, since the app answers it.
 */
export function useWriteRefusal(own: readonly SubscriptionField[]) {
	const queryClient = useQueryClient();
	const [failure, setFailure] = useState<string | null>(null);
	const [fields, setFields] = useState<Partial<Record<SubscriptionField, string>>>(
		{},
	);
	const [conflict, setConflict] = useState<DialogConflict | null>(null);

	/** Clears one field's message once it changes, and the line with it. */
	const clearField = (field: SubscriptionField) => {
		setFields((current) => {
			const next = { ...current };
			delete next[field];
			return next;
		});
		setFailure(null);
	};

	/** Clears the messages: a new press starts clean. The conflict view stays until a choice. */
	const reset = () => {
		setFields({});
		setFailure(null);
	};

	/** Shows the refusal `error` is, and answers its outcome, so the dialog can move focus to a
	 * field that has a message. `request` is what a 409 would send again; an Add has none. */
	const refuse = async (
		error: unknown,
		request?: ChangeRequest,
	): Promise<SubscriptionWriteOutcome> => {
		const outcome = readSubscriptionWriteError(error);
		if (outcome.kind === "handled") return outcome;
		if (outcome.kind === "conflict") {
			// Only a write against a version, never an Add, can meet one.
			if (request) setConflict({ current: outcome.current, request });
			else setFailure(SUBSCRIPTIONS_TEXT.saveFailed);
			return outcome;
		}
		setConflict(null);
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
		} else if (outcome.kind === "gone") {
			setFailure(outcome.message);
			await refreshAfterSubscriptionWrite(queryClient, {
				count: true,
				charges: true,
			});
		} else {
			setFailure(outcome.message);
		}
		return outcome;
	};

	/** Keep theirs, or the end of the view: the page reads the saved Subscription again. */
	const dropConflict = async () => {
		setConflict(null);
		await refreshAfterSubscriptionWrite(queryClient, {
			count: false,
			charges: false,
		});
	};

	return {
		failure,
		fields,
		conflict,
		clearField,
		reset,
		refuse,
		setFailure,
		dropConflict,
		closeConflict: () => setConflict(null),
	};
}
