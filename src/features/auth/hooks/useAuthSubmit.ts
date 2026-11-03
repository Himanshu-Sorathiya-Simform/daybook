import { useState } from "react";

import { useAppSession } from "@/hooks/useAppSession";
import { finishOldLogout } from "../lib/finish-old-logout";
import {
	AUTH_MESSAGES,
	type AuthError,
	type AuthFailure,
	type AuthField,
	authFailure,
} from "../lib/messages";

/** One sign-up or login call to Better Auth, answering its error, if any. */
export type AuthCall<V> = (values: V) => Promise<{ error: AuthError | null }>;

export type AuthSubmitOptions<V> = {
	call: AuthCall<V>;
	/** Where success goes, with a full page load (D-510). */
	destination: string;
	/** Asks for focus on the first field with a message (`useFocusFirstInvalid`). */
	focusInvalid: () => void;
	/** Anything a form does for a refusal of its own, such as clearing a breached password. */
	onRefused?: (error: AuthError) => void;
};

/**
 * The steps sign-up and login share (F01 flows 7.1 and 7.2):
 * 1. a logout that never finished is signed out first, or nothing is sent (BR-F01-15);
 * 2. the call; no answer at all is the generic line (D-510);
 * 3. a refusal shows under its field or above the button (F01 section 8), and focus moves to
 *    the first field with a message;
 * 4. success keeps the form disabled while the destination loads.
 * `changed` takes a field's server message away once the user edits that field.
 */
export function useAuthSubmit<V>({
	call,
	destination,
	focusInvalid,
	onRefused,
}: AuthSubmitOptions<V>) {
	const { navigate } = useAppSession();
	const [failure, setFailure] = useState<AuthFailure | null>(null);
	const [leaving, setLeaving] = useState(false);

	async function submit(values: V): Promise<void> {
		setFailure(null);
		if (!(await finishOldLogout())) {
			setFailure({ form: AUTH_MESSAGES.oldSession });
			return;
		}
		let error: AuthError | null;
		try {
			({ error } = await call(values));
		} catch {
			setFailure({ form: AUTH_MESSAGES.failed });
			return;
		}
		if (error) {
			onRefused?.(error);
			setFailure(authFailure(error));
			focusInvalid();
			return;
		}
		setLeaving(true);
		navigate(destination);
	}

	function changed(field: AuthField): void {
		setFailure((current) =>
			current && "field" in current && current.field === field ?
				null
			:	current,
		);
	}

	const formFailure = failure && "form" in failure ? failure.form : null;
	return { failure, formFailure, leaving, submit, changed };
}
