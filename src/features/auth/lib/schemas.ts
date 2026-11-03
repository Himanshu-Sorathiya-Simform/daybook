import { z } from "zod";

import { codePointLength, normalizeText } from "@/lib/text";
import { AUTH_MESSAGES } from "./messages";

/** The longest email Better Auth's hook accepts (F01, BR-F01-01). */
export const MAX_EMAIL = 254;
/** Passwords are 12 to 128 characters, counted as Better Auth counts them (D-148). */
export const MIN_PASSWORD = 12;
export const MAX_PASSWORD = 128;
/** A display name is 1 to 50 characters after trimming and NFC (F01 section 3). */
export const MAX_NAME = 50;

// Lengths of the email and password count UTF-16 units, as the server's checks do
// (`.length`); Zod's own `min` and `max` count code points, so an emoji would pass here and be
// refused there.

/** The email, trimmed as the server trims it, then checked in F01's order: required, length,
 * form. The server also lowercases it; the form sends it as typed. */
const email = z
	.string()
	.trim()
	.refine((value) => value.length > 0, {
		error: AUTH_MESSAGES.emailRequired,
		abort: true,
	})
	.refine((value) => value.length <= MAX_EMAIL, {
		error: AUTH_MESSAGES.emailTooLong,
		abort: true,
	})
	.pipe(z.email({ error: AUTH_MESSAGES.emailInvalid }));

/** A new password: 12 to 128 characters, no rules on what they are (SEC-10). Never trimmed. */
const newPassword = z
	.string()
	.refine((value) => value.length > 0, {
		error: AUTH_MESSAGES.passwordRequired,
		abort: true,
	})
	.refine((value) => value.length >= MIN_PASSWORD, {
		error: AUTH_MESSAGES.passwordTooShort,
		abort: true,
	})
	.refine((value) => value.length <= MAX_PASSWORD, {
		error: AUTH_MESSAGES.passwordTooLong,
	});

/** The display name as the hook will store it (BR-F01-01): trimmed, NFC, 1 to 50 characters,
 * no control characters. */
const name = z.string().refine(
	(value) => {
		const normalized = normalizeText(value);
		return (
			normalized.ok
			&& normalized.value.length > 0
			&& codePointLength(normalized.value) <= MAX_NAME
		);
	},
	{ error: AUTH_MESSAGES.name },
);

export const signUpSchema = z.object({ email, password: newPassword, name });

/** Logging in checks only that a password was typed; the server decides the rest, and a wrong
 * one reads like a wrong email (BR-F01-07). */
export const loginSchema = z.object({
	email,
	password: z.string().min(1, { error: AUTH_MESSAGES.passwordRequired }),
});

export type SignUpValues = z.input<typeof signUpSchema>;
export type LoginValues = z.input<typeof loginSchema>;
