import "server-only";
import { type SQL, sql } from "drizzle-orm";
import type { CurrencyCode } from "@/lib/currency";
import { searchTerms } from "@/lib/transactions/match";
import type { TransactionFilter } from "@/lib/transactions/url";

/** F03's search text (BR-F03-35): payee, description and note joined by U+001F, missing ones
 * as empty strings, exactly as `searchText` in `match.ts` builds it. */
export const SEARCH_TEXT = sql.raw(
	`(coalesce(payee, '') || E'\\x1f' || coalesce(description, '') || E'\\x1f' || coalesce(note, ''))`,
);

/** `text` for a `LIKE` pattern, with `\`, `%` and `_` taken literally (`\` escapes). */
export function escapeLike(text: string): string {
	return text.replace(/[\\%_]/g, (sign) => `\\${sign}`);
}

/** An `ILIKE` pattern matching `text` anywhere, with `\`, `%` and `_` taken literally. */
export function containsPattern(text: string): string {
	return `%${escapeLike(text)}%`;
}

function searchSql(q: string, currency: CurrencyCode): SQL {
	const { amountMinor, text } = searchTerms(q, currency);
	const parts: SQL[] = [];
	if (amountMinor !== null) parts.push(sql`amount_minor = ${amountMinor}`);
	if (text !== null)
		parts.push(sql`${SEARCH_TEXT} ILIKE ${containsPattern(text)}`);
	return sql`(${sql.join(parts, sql` OR `)})`;
}

/**
 * The filter's `WHERE` clause over `app.transactions` (FIL-2), rule for rule as `matchesFilter`
 * (BR-F03-43). Fields combine with AND (FIL-1); an absent field adds nothing, and an empty
 * list matches nothing. Column names are unqualified, so the clause fits any query whose
 * only Transactions relation is that table, aliased or not. RLS already limits the rows to
 * the user (SEC-2).
 *
 * Until M2 adds `goal_id` and `subscription_id`, a Goal or Subscription filter matches no
 * rows, as `matchesFilter` does for rows without them (D-470).
 */
export function filterSql(filter: TransactionFilter, currency: CurrencyCode): SQL {
	const { from, to, type, cat, goal, sub, src, minMinor, maxMinor, q } = filter;
	const clauses: SQL[] = [];
	if (from !== undefined) clauses.push(sql`occurred_on >= ${from}::date`);
	if (to !== undefined) clauses.push(sql`occurred_on <= ${to}::date`);
	// `sql.param` sends a list as one array; a bare list would become `($1, $2)`.
	if (type) clauses.push(sql`type = ANY(${sql.param(type)}::text[])`);
	if (cat) clauses.push(sql`category = ANY(${sql.param(cat)}::text[])`);
	if (goal !== undefined || sub !== undefined) clauses.push(sql`false`);
	if (src !== undefined) clauses.push(sql`source = ${src}`);
	if (minMinor !== undefined) clauses.push(sql`amount_minor >= ${minMinor}`);
	if (maxMinor !== undefined) clauses.push(sql`amount_minor <= ${maxMinor}`);
	if (q !== undefined) clauses.push(searchSql(q, currency));
	return clauses.length ? sql`(${sql.join(clauses, sql` AND `)})` : sql`true`;
}

/** The filter without the given fields: a filter count leaves out its own field (BR-F03-59),
 * and the histogram its amount bounds (BR-F03-60). */
export function withoutFields(
	filter: TransactionFilter,
	...fields: (keyof TransactionFilter)[]
): TransactionFilter {
	return Object.fromEntries(
		Object.entries(filter).filter(
			([field]) => !fields.includes(field as keyof TransactionFilter),
		),
	) as TransactionFilter;
}
