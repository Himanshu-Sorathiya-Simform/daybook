import type { AuthFailure } from "../lib/messages";

export type FormAlertProps = { failure: AuthFailure | null };

/** The line above the button: a refusal of the whole form, read out at once. A refusal of one
 * field shows under that field instead, so this shows nothing for it. */
export function FormAlert({ failure }: Readonly<FormAlertProps>) {
	if (!failure || !("form" in failure)) return null;
	return (
		<p
			role="alert"
			className="text-label text-neg"
		>
			{failure.form}
		</p>
	);
}
