import { parseNumericQuery } from "@/lib/amount";
import type { CategoryKey } from "@/lib/categories";
import type { CurrencyCode } from "@/lib/currency";
import { codePointLength } from "@/lib/text";

import type { Source, TxnType } from "./model";
import type { TransactionFilter } from "./url";

/** The fields of a Transaction that a filter reads. */
export type MatchableRow = {
	type: TxnType;
	amountMinor: number;
	occurredOn: string;
	category: CategoryKey | null;
	goalId: string | null;
	subscriptionId: string | null;
	source: Source;
	payee: string | null;
	description: string | null;
	note: string | null;
};

/** Under this many characters, a numeric search matches amounts only (BR-F03-35). */
const SHORT_QUERY = 3;

/**
 * The text a search reads: payee, description and note joined by U+001F, missing fields as
 * empty strings. Stored text never holds U+001F, so a match never spans two fields
 * (BR-F03-35). SQL builds the same expression.
 */
export function searchText(row: MatchableRow): string {
	return [row.payee ?? "", row.description ?? "", row.note ?? ""].join("\u001f");
}

/** What a search matches (BR-F03-35): `amountMinor` exactly, when `q` is numeric, and `text`
 * as a substring, unless `q` is a number under 3 characters. */
export type SearchTerms = { amountMinor: number | null; text: string | null };

/** The terms of `q`. `matchesFilter` and the SQL filter both read them, so the two always agree
 * on what counts as a number and when a number is too short for text. */
export function searchTerms(q: string, currency: CurrencyCode): SearchTerms {
	const amountMinor = parseNumericQuery(q, currency);
	const amountOnly = amountMinor !== null && codePointLength(q) < SHORT_QUERY;
	return { amountMinor, text: amountOnly ? null : q };
}

function matchesQuery(
	row: MatchableRow,
	q: string,
	currency: CurrencyCode,
): boolean {
	const { amountMinor, text } = searchTerms(q, currency);
	if (amountMinor !== null && row.amountMinor === amountMinor) return true;
	// A substring test takes %, _ and \ literally, as the SQL escapes them.
	return (
		text !== null && searchText(row).toLowerCase().includes(text.toLowerCase())
	);
}

/**
 * Whether a row matches the filter, rule for rule as the SQL predicate (BR-F03-43). Fields
 * combine with AND (FIL-1), a category filter excludes Goal rows (FIL-6), and dates are the
 * row's local `occurredOn`. Used only for pending rows, never for confirmed figures.
 */
export function matchesFilter(
	row: MatchableRow,
	filter: TransactionFilter,
	currency: CurrencyCode,
): boolean {
	const { from, to, type, cat, goal, sub, src, minMinor, maxMinor, q } = filter;
	if (from !== undefined && row.occurredOn < from) return false;
	if (to !== undefined && row.occurredOn > to) return false;
	if (type && !type.includes(row.type)) return false;
	if (cat && (row.category === null || !cat.includes(row.category))) return false;
	if (goal !== undefined && row.goalId !== goal) return false;
	if (sub !== undefined && row.subscriptionId !== sub) return false;
	if (src !== undefined && row.source !== src) return false;
	if (minMinor !== undefined && row.amountMinor < minMinor) return false;
	if (maxMinor !== undefined && row.amountMinor > maxMinor) return false;
	if (q !== undefined && !matchesQuery(row, q, currency)) return false;
	return true;
}
