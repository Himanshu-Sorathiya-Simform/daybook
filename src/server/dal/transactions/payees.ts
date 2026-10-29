import "server-only";
import { type SQL, sql } from "drizzle-orm";
import type { CategoryKey } from "@/lib/categories";
import type { TxnType } from "@/lib/transactions/model";
import { payeeWindowStart } from "@/lib/transactions/payees";
import { monthsBefore } from "@/lib/time";
import { safeInt } from "../../db/safe-int";
import type { ProfiledContext } from "../context";
import type { Tx } from "../with-user";
import { escapeLike } from "./filter";
import { INCOME, SPENDING } from "./totals";

/** One payee in the suggestions (BR-F03-44): its newest spelling, type and category. */
export type PayeeItem = {
	payee: string;
	count: number;
	lastUsedOn: string;
	lastType: TxnType;
	lastCategory: CategoryKey;
};

/** The suggestions; `categories` only without a search (BR-F03-44, BR-F03-61). */
export type PayeeList = {
	items: PayeeItem[];
	categories?: { key: CategoryKey; count: number }[];
};

/** Up to this many payees in the list, and in an answer to a search. */
const LIST_SIZE = 200;
const SEARCH_SIZE = 8;

/** The types that carry a payee: Goal Transactions have none (TXN-4). */
const PAYEE_TYPES = sql.raw("type IN ('income', 'expense', 'refund')");

/** A group's newest row first, in BR-F03-29's date order. */
const NEWEST = sql.raw("ORDER BY occurred_on DESC, occurred_at DESC, id DESC");

/** BR-F03-61's match, as `payeeMatches` in `src/lib/transactions/payees.ts`: the lowercased
 * payee starts with `q`, or a word after a space does. `q` is lowered by Postgres too, so both
 * sides use the same `lower()`. */
function matchSql(q: string): SQL {
	const text = escapeLike(q);
	return sql`(lower(payee) LIKE (lower(${text}) || '%') OR lower(payee) LIKE ('% ' || lower(${text}) || '%'))`;
}

/**
 * The payee suggestions in one statement (BR-F03-44, BR-F03-61, D-481): the user's income,
 * expense and refund rows with `occurredOn` in the 365 days ending today, grouped by the
 * lowercased payee and ordered by count, then last use, then key in code point order.
 * - Without `q`: up to 200 payees, and `categories`, each category's row count, by count then
 *   key. Goal rows have no category, so they add nothing.
 * - With `q`: up to 8 matching payees, without `categories`.
 */
export async function listPayees(
	tx: Tx,
	ctx: ProfiledContext,
	{ q }: { q?: string } = {},
): Promise<PayeeList> {
	const match = q === undefined ? sql`true` : matchSql(q);
	const categories =
		q === undefined ?
			sql`(SELECT coalesce(json_agg(json_build_object('key', category, 'count', n::text)
				ORDER BY n DESC, category COLLATE "C"), '[]'::json)
				FROM (SELECT category, count(*) AS n FROM w GROUP BY category) AS c)`
		:	sql`NULL::json`;
	const { rows } = await tx.execute<{
		items: (Omit<PayeeItem, "count"> & { count: string })[];
		categories: { key: CategoryKey; count: string }[] | null;
	}>(sql`WITH w AS (
		SELECT * FROM app.transactions
		WHERE ${PAYEE_TYPES} AND occurred_on BETWEEN ${payeeWindowStart(ctx.today)}::date AND ${ctx.today}::date
	), p AS (
		SELECT lower(payee) AS key, count(*) AS n, max(occurred_on) AS last_on,
			(array_agg(payee ${NEWEST}))[1] AS payee,
			(array_agg(type ${NEWEST}))[1] AS last_type,
			(array_agg(category ${NEWEST}))[1] AS last_category
		FROM w WHERE ${match} GROUP BY 1
		-- An output name cannot carry COLLATE here, so the key is written out.
		ORDER BY n DESC, last_on DESC, lower(payee) COLLATE "C"
		LIMIT ${q === undefined ? LIST_SIZE : SEARCH_SIZE})
	SELECT
		(SELECT coalesce(json_agg(json_build_object('payee', payee, 'count', n::text,
			'lastUsedOn', last_on::text, 'lastType', last_type, 'lastCategory', last_category)
			ORDER BY n DESC, last_on DESC, key COLLATE "C"), '[]'::json) FROM p) AS items,
		${categories} AS categories`);
	// A SELECT without FROM returns exactly one row.
	const row = rows[0] as (typeof rows)[number];
	const items = row.items.map((item) => ({ ...item, count: safeInt(item.count) }));
	if (q !== undefined) return { items };
	return {
		items,
		// Without `q`, the statement always builds the array.
		categories: (row.categories as NonNullable<typeof row.categories>).map(
			({ key, count }) => ({
				key,
				count: safeInt(count),
			}),
		),
	};
}

/** One payee's recent rows (BR-F03-62); the endpoint adds `currency`. */
export type PayeeHistory = {
	count: number;
	inMinor: number;
	outMinor: number;
	usualDay: number | null;
};

/**
 * One payee's income, expense and refund rows from `months` calendar months before today to
 * today, both inclusive (BR-F03-62, D-482): matched as BR-F03-55 groups payees, by
 * `lower(payee)`. `usualDay` is the median day of the month, the lower middle for an even
 * count, and null with fewer than 2 rows. No rows give zeros.
 */
export async function payeeHistory(
	tx: Tx,
	ctx: ProfiledContext,
	payee: string,
	months: number,
): Promise<PayeeHistory> {
	const { rows } = await tx.execute<{
		count: string;
		in: string;
		out: string;
		usual_day: number | null;
	}>(sql`SELECT count(*)::text AS count, ${INCOME}::text AS in, ${SPENDING}::text AS out,
		CASE WHEN count(*) < 2 THEN NULL
			ELSE percentile_disc(0.5) WITHIN GROUP (ORDER BY extract(day FROM occurred_on)::int)
		END AS usual_day
	FROM app.transactions
	WHERE ${PAYEE_TYPES} AND lower(payee) = lower(${payee})
		AND occurred_on BETWEEN ${monthsBefore(ctx.today, months)}::date AND ${ctx.today}::date`);
	// An aggregate without GROUP BY returns exactly one row.
	const row = rows[0] as (typeof rows)[number];
	return {
		count: safeInt(row.count),
		inMinor: safeInt(row.in),
		outMinor: safeInt(row.out),
		usualDay: row.usual_day,
	};
}
