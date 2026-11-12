import { codePointLength, lowercase, normalizeText } from "@/lib/text";
import { payeeMatches } from "@/lib/transactions/payees";
import type { PayeesAnswer } from "./types";

export type PayeeItem = PayeesAnswer["items"][number];

/** At most this many suggestions while typing (BR-F03-45, BR-F03-61). */
export const MAX_SUGGESTIONS = 8;

/** Suggestions shown while the field is empty: "Recent and frequent" (BR-F03-45). */
export const RECENT_COUNT = 5;

/** A payee is at most 80 code points (BR-F03-12), and so is a search for one (BR-F03-61). */
const PAYEE_MAX = 80;

/**
 * Typed payee text as a search, by BR-F03-12's rules: trimmed and in NFC. `null` when there is
 * nothing to search for, or when the server would refuse it (BR-F03-61): empty or invisible
 * only, a control character, or over 80 code points.
 */
export function payeeQueryText(text: string): string | null {
	const normalized = normalizeText(text);
	if (!normalized.ok || normalized.value === "") return null;
	return codePointLength(normalized.value) > PAYEE_MAX ? null : normalized.value;
}

/** The device's list filtered by `payeeMatches`, in BR-F03-44's order, which the list already
 * has, up to 8 (BR-F03-45). */
export function deviceSuggestions(
	items: readonly PayeeItem[],
	q: string,
): PayeeItem[] {
	const found: PayeeItem[] = [];
	for (const item of items) {
		if (found.length === MAX_SUGGESTIONS) break;
		if (payeeMatches(item.payee, q)) found.push(item);
	}
	return found;
}

/** Device suggestions first, then the server's whose payee, lowered as Postgres lowers it, is
 * not already listed, up to 8 in all (BR-F03-61, D-497). */
export function mergeSuggestions(
	device: readonly PayeeItem[],
	server: readonly PayeeItem[],
): PayeeItem[] {
	const merged = device.slice(0, MAX_SUGGESTIONS);
	const seen = new Set(merged.map((item) => lowercase(item.payee)));
	for (const item of server) {
		if (merged.length === MAX_SUGGESTIONS) break;
		const key = lowercase(item.payee);
		if (seen.has(key)) continue;
		seen.add(key);
		merged.push(item);
	}
	return merged;
}

/** Whether a suggestion equals the typed text as `lower()` compares, so "Use “X” as a new
 * payee" is left out (BR-F03-45). */
export function hasExactPayee(items: readonly PayeeItem[], q: string): boolean {
	const typed = lowercase(q);
	return items.some((item) => lowercase(item.payee) === typed);
}
