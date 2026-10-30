import "server-only";
import { type SQL, sql } from "drizzle-orm";
import type { TransactionFilter } from "@/lib/transactions/url";
import type { Profile, ProfiledContext } from "../context";
import type { Tx } from "../with-user";
import { filterSql } from "./filter";
import {
	PAYEE_KEY,
	PAYEE_LABEL,
	readTotals,
	TOTALS_JSON,
	type Totals,
	type TotalsJson,
	WEIGHT,
} from "./totals";

/** What a rollup groups by (F03 section 11). `subscription` arrives with F05. */
export type RollupBy =
	"total" | "category" | "payee" | "day" | "week" | "month" | "bounds";

export type RollupRequest = { filter: TransactionFilter; by: RollupBy };

/** One group's totals. `label` names a payee group; it is null for every other kind. */
export type RollupGroup = Totals & { key: string; label: string | null };

/** The earliest and latest `occurredOn` of the filter's rows, or null without rows. */
export type Bounds = { firstOn: string; lastOn: string } | null;

export type RollupResult<B extends RollupBy> =
	B extends "total" ? Totals
	: B extends "bounds" ? Bounds
	: RollupGroup[];

type Results<R extends readonly RollupRequest[]> = {
	-readonly [K in keyof R]: RollupResult<R[K]["by"]>;
};

/** Each week start as an ISO day of the week, Monday 1 to Sunday 7. */
const ISO_WEEK_START: Record<Profile["weekStart"], number> = {
	monday: 1,
	saturday: 6,
	sunday: 7,
};

/** A group's key (D-473): the category key, the lowercased payee (BR-F03-55), the date, the
 * date of the week's first day by the profile's week start, or the month as `YYYY-MM`. Every
 * kind is grouped by `occurredOn`, never the UTC instant (TIME-2). */
function groupKey(by: RollupBy, ctx: ProfiledContext): SQL {
	switch (by) {
		case "category":
			return sql`category`;
		case "payee":
			return PAYEE_KEY;
		case "day":
			return sql`occurred_on::text`;
		case "week": {
			const start = ISO_WEEK_START[ctx.profile.weekStart];
			return sql`(occurred_on - (extract(isodow FROM occurred_on)::int - ${start} + 7) % 7)::text`;
		}
		default:
			return sql`to_char(occurred_on, 'YYYY-MM')`;
	}
}

/** One request as a scalar subquery returning JSON. */
function requestSql(request: RollupRequest, ctx: ProfiledContext): SQL {
	const where = filterSql(request.filter, ctx.profile.currency);
	if (request.by === "total") {
		return sql`(SELECT json_build_object(${TOTALS_JSON}) FROM app.transactions WHERE ${where})`;
	}
	if (request.by === "bounds") {
		return sql`(SELECT CASE WHEN count(*) = 0 THEN NULL ELSE json_build_object(
			'firstOn', min(occurred_on)::text, 'lastOn', max(occurred_on)::text) END
			FROM app.transactions WHERE ${where})`;
	}
	const byWeight = request.by === "category" || request.by === "payee";
	const label = request.by === "payee" ? PAYEE_LABEL : sql`NULL::text`;
	// Category and payee groups run largest weight first, the list's group order; dates run
	// oldest first. Keys compare by code point on any server (D-472).
	const order =
		byWeight ? sql`weight DESC, key COLLATE "C"` : sql`key COLLATE "C"`;
	// The key is computed once, in the inner query, so the grouping never repeats its
	// parameters.
	return sql`(SELECT coalesce(json_agg(item ORDER BY ${order}), '[]'::json) FROM (
		SELECT key, ${WEIGHT} AS weight,
			json_build_object('key', key, 'label', ${label}, ${TOTALS_JSON}) AS item
		FROM (SELECT *, ${groupKey(request.by, ctx)} AS key FROM app.transactions WHERE ${where}) AS t
		GROUP BY key) AS g)`;
}

function readResult(by: RollupBy, value: unknown): RollupResult<RollupBy> {
	if (by === "total") return readTotals(value as TotalsJson);
	if (by === "bounds") return value as Bounds;
	return (value as (TotalsJson & { key: string; label: string | null })[]).map(
		({ key, label, ...totals }) => ({ key, label, ...readTotals(totals) }),
	);
}

/**
 * Answers every request in one SQL statement (D-293), each over the confirmed rows its filter
 * selects (TXN-6): totals, groups with their totals, or the date bounds (F03 section 11).
 * Each group carries count, income, spending (Out), To Goals and net (TXN-5); money is read
 * through `safeInt`. The summary, the list's group totals, the dashboard and the charts use it.
 */
export async function rollup<const R extends readonly RollupRequest[]>(
	tx: Tx,
	ctx: ProfiledContext,
	requests: R,
): Promise<Results<R>> {
	if (requests.length === 0) return [] as unknown as Results<R>;
	const alias = (index: number) => `r${index}`;
	const columns = requests.map(
		(request, index) =>
			sql`${requestSql(request, ctx)} AS ${sql.identifier(alias(index))}`,
	);
	const { rows } = await tx.execute<Record<string, unknown>>(
		sql`SELECT ${sql.join(columns, sql`, `)}`,
	);
	// A SELECT without FROM returns exactly one row.
	const row = rows[0] as Record<string, unknown>;
	return requests.map((request, index) =>
		readResult(request.by, row[alias(index)]),
	) as unknown as Results<R>;
}
