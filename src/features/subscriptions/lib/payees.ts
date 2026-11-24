import { queryOptions } from "@tanstack/react-query";

import { apiFetch } from "@/lib/api/client";
import { QUERY_ROOTS } from "@/lib/api/query-keys";
import { codePointLength, normalizeText } from "@/lib/text";
import type { PayeeItem, PayeesAnswer } from "@/lib/transactions/answers";
import { payeeMatches } from "@/lib/transactions/payees";

/**
 * The payees Add offers (BR-F05-24, BR-F03-44, D-451), read from `GET /api/payees`. The key is
 * the Transactions page's own payee list key, `["payees", "list"]`, so both share one cache
 * entry and a write that changes charges refreshes both. A feature never imports another's
 * keys, so the key is spelled out here, and each side's tests pin it.
 */
export const PAYEES_KEY = [QUERY_ROOTS.payees, "list"] as const;

export const PAYEES_PATH = "/api/payees";

/** The list stays fresh this long, as on the Transactions side (BR-F03-44). */
export const PAYEES_STALE_MS = 5 * 60_000;

/** Suggestions while the field is empty, and the most while typing (BR-F03-45). */
export const RECENT_COUNT = 5;
export const MAX_CHOICES = 8;

/** A payee is at most 80 code points, and so is a search for one (BR-F03-12). */
const PAYEE_MAX = 80;

/** The payees that have an expense, newest spelling first, as the list orders them: those a
 * Subscription can be filled from (D-451). */
export function paidPayees(answer: PayeesAnswer): PayeeItem[] {
	return answer.items.filter((item) => item.lastExpense !== null);
}

export function payeesOptions() {
	return queryOptions({
		queryKey: PAYEES_KEY,
		queryFn: ({ signal }) => apiFetch<PayeesAnswer>(PAYEES_PATH, { signal }),
		staleTime: PAYEES_STALE_MS,
		select: paidPayees,
	});
}

/**
 * What the Name combobox lists (BR-F05-24): from the device's list only, with no server search
 * and no "Use … as a new payee". Empty, or only spaces and invisible characters, the first 5;
 * typing, up to 8 whose name matches as F03's payee field matches (BR-F03-45). Text no payee
 * can hold, with a control character or over 80 code points, matches nothing.
 */
export function payeeChoices(
	items: readonly PayeeItem[],
	text: string,
): PayeeItem[] {
	const normalized = normalizeText(text);
	if (!normalized.ok) return [];
	if (normalized.value === "") return items.slice(0, RECENT_COUNT);
	if (codePointLength(normalized.value) > PAYEE_MAX) return [];
	const found: PayeeItem[] = [];
	for (const item of items) {
		if (found.length === MAX_CHOICES) break;
		if (payeeMatches(item.payee, normalized.value)) found.push(item);
	}
	return found;
}
