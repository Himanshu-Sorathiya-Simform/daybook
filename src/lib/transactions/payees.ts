import { lowercase } from "@/lib/text";
import { shiftDays } from "@/lib/time";

/** The payee list and its search cover this many days, today included (BR-F03-44, D-481). */
export const PAYEE_WINDOW_DAYS = 365;

/** The first day of the payee window ending `today`: 2026-11-02 gives 2025-11-03. */
export function payeeWindowStart(today: string): string {
	return shiftDays(today, 1 - PAYEE_WINDOW_DAYS);
}

/**
 * Whether a payee suggestion matches the typed text (BR-F03-45, BR-F03-61, D-481): the payee
 * starts with `q`, or has a word that does, a word starting after a space; case-insensitive,
 * lowered as Postgres lowers (D-497). The device filters its list with this, and the server's
 * SQL mirrors it.
 */
export function payeeMatches(payee: string, q: string): boolean {
	const name = lowercase(payee);
	const text = lowercase(q);
	return name.startsWith(text) || name.includes(` ${text}`);
}
