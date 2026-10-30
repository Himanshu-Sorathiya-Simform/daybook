import "server-only";
import { APIError } from "better-auth/api";
import { codePointLength, normalizeText } from "@/lib/text";

/** The longest email an account may have, in characters (F01, section 3). */
export const MAX_EMAIL = 254;
/** The longest display name, in code points after trimming and NFC (BR-F01-01). */
export const MAX_NAME = 50;

/** The refusals F01's hook adds, in Better Auth's error shape (`{ code, message }`). The
 * browser shows its own text for each code (F01, section 8); these messages say the same for
 * anyone calling the API directly. `INVALID_EMAIL` is Better Auth's own code, reused for an
 * email over 254 characters so the browser handles one code. */
export const AUTH_REFUSALS = {
	INVALID_EMAIL: "Enter a valid email address, like name@example.com.",
	INVALID_NAME: "Enter a name of up to 50 characters.",
	FIELD_NOT_ALLOWED: "Only the name can be changed.",
	PASSWORD_BREACHED:
		"This password has appeared in a data breach. Choose a different one.",
} as const;

export type AuthRefusal = keyof typeof AUTH_REFUSALS;

/** A 400 with one of F01's codes, which Better Auth answers as `{ code, message }`. */
export function refuse(code: AuthRefusal): APIError {
	return APIError.from("BAD_REQUEST", { code, message: AUTH_REFUSALS[code] });
}

/** The email as the account stores it (BR-F01-01): trimmed and lowercased, so
 * `Asha@Example.com ` and `asha@example.com` are one account. Anything but a string is
 * returned unchanged, for Better Auth's own validation to refuse. */
export function normalizeEmail(email: unknown): unknown {
	return typeof email === "string" ? email.trim().toLowerCase() : email;
}

/** The display name as stored (BR-F01-01, root 6.7): trimmed, NFC, 1 to 50 code points, with
 * no control character, line separator or lone surrogate. `null` when it breaks a rule,
 * including a name that is not a string or holds only invisible characters. */
export function normalizeName(name: unknown): string | null {
	if (typeof name !== "string") return null;
	const normalized = normalizeText(name);
	if (!normalized.ok || normalized.value === "") return null;
	return codePointLength(normalized.value) > MAX_NAME ? null : normalized.value;
}

/** Whether `body` is a JSON object, the only body F01's rules read. Anything else goes to
 * Better Auth unchanged, and its body validation refuses it. */
export function isBody(body: unknown): body is Record<string, unknown> {
	return typeof body === "object" && body !== null && !Array.isArray(body);
}
