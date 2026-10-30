import "server-only";
import { sql } from "drizzle-orm";
import { safeInt } from "../../db/safe-int";

/** TXN-5's figures for a set of rows, as SQL aggregates. Each is `numeric`, never a float. */
export const INCOME = sql.raw(
	"coalesce(sum(amount_minor) FILTER (WHERE type = 'income'), 0)",
);
/** Out: expenses minus refunds. */
export const SPENDING = sql.raw(
	"coalesce(sum(CASE type WHEN 'expense' THEN amount_minor WHEN 'refund' THEN -amount_minor END), 0)",
);
/** To Goals: contributions minus withdrawals. */
export const TO_GOALS = sql.raw(
	"coalesce(sum(CASE type WHEN 'goal_contribution' THEN amount_minor WHEN 'goal_withdrawal' THEN -amount_minor END), 0)",
);

/** A group's weight, which orders category and payee groups: In + |Out| + |To Goals|
 * (BR-F03-55). */
export const WEIGHT = sql`(${INCOME} + abs(${SPENDING}) + abs(${TO_GOALS}))`;

/** The pairs of a `json_build_object` holding the totals. Every figure is text, so none
 * passes through a JavaScript float before `safeInt` reads it (MON-6). */
export const TOTALS_JSON = sql`'count', count(*)::text, 'incomeMinor', ${INCOME}::text,
	'spendingMinor', ${SPENDING}::text, 'toGoalsMinor', ${TO_GOALS}::text,
	'netMinor', (${INCOME} - ${SPENDING})::text`;

/** The payee group key: the payee lowercased by Postgres (BR-F03-55). */
export const PAYEE_KEY = sql.raw("lower(payee)");

/** A payee group's label: the payee of its newest row, in BR-F03-29's date order. */
export const PAYEE_LABEL = sql.raw(
	"(array_agg(payee ORDER BY occurred_on DESC, occurred_at DESC, id DESC))[1]",
);

/** TXN-5's figures for a set of confirmed rows (TXN-6). Net is income minus spending. */
export type Totals = {
	count: number;
	incomeMinor: number;
	spendingMinor: number;
	toGoalsMinor: number;
	netMinor: number;
};

export type TotalsJson = Record<keyof Totals, string>;

/** Reads `TOTALS_JSON`'s text figures, each through `safeInt`, which throws past
 * `Number.MAX_SAFE_INTEGER` instead of rounding. */
export function readTotals(json: TotalsJson): Totals {
	return {
		count: safeInt(json.count),
		incomeMinor: safeInt(json.incomeMinor),
		spendingMinor: safeInt(json.spendingMinor),
		toGoalsMinor: safeInt(json.toGoalsMinor),
		netMinor: safeInt(json.netMinor),
	};
}

/** The pairs of a list group's totals (BR-F03-56), named as the list's `groups` names them.
 * Every figure is text, read through `safeInt`. */
export const GROUP_JSON = sql`'count', count(*)::text, 'inMinor', ${INCOME}::text,
	'outMinor', ${SPENDING}::text, 'toGoalsMinor', ${TO_GOALS}::text`;
