import { parseNumericQuery } from "@/lib/amount";
import type { CurrencyCode } from "@/lib/currency";
import { lowercase } from "@/lib/text";
import type { Transaction } from "@/lib/transactions/model";
import { checkQuery } from "@/lib/transactions/url";

/**
 * The name as F03 searches it for Add's duplicate note (BR-F05-48, D-617), or `null` when no
 * note can show. The name is trimmed and in NFC, as it is stored. F03 refuses text under 3
 * characters unless it is a number (BR-F03-34, `checkQuery`), and a number reads no duplicates,
 * since it also matches amounts (BR-F03-35): so every name under 3 characters, and every
 * number, gives `null`. The name is at most 60 characters, so F03's upper limit never applies.
 */
export function duplicateSearchText(
	name: string,
	currency: CurrencyCode,
): string | null {
	const checked = checkQuery(name, currency);
	if (!checked.ok || checked.q === undefined) return null;
	return parseNumericQuery(checked.q, currency) === null ? checked.q : null;
}

/** The rows whose payee equals `name` as Postgres's `lower()` compares (D-497): `q` also finds
 * a name inside a payee, a description or a note, which are no duplicates. */
export function sameNameExpenses(
	rows: readonly Transaction[],
	name: string,
): Transaction[] {
	const wanted = lowercase(name);
	return rows.filter(
		(row) =>
			row.type === "expense"
			&& row.payee !== null
			&& lowercase(row.payee) === wanted,
	);
}
