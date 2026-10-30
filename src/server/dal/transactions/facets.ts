import "server-only";
import { type SQL, sql } from "drizzle-orm";
import type { CategoryKey } from "@/lib/categories";
import {
	CATEGORY_KEYS,
	RANGE_PRESETS,
	SOURCES,
	TXN_TYPES,
	type DatePreset,
	type Source,
	type TxnType,
} from "@/lib/transactions/model";
import { presetRange } from "@/lib/transactions/presets";
import type { TransactionFilter } from "@/lib/transactions/url";
import { safeInt } from "../../db/safe-int";
import type { ProfiledContext } from "../context";
import type { Tx } from "../with-user";
import { filterSql, withoutFields } from "./filter";

/** The date options counted: every preset but `custom` (BR-F03-59). */
export type DateFacet = Exclude<DatePreset, "custom">;

/** How many confirmed rows each option of four filter fields would give (BR-F03-59). */
export type FacetCounts = {
	type: Record<TxnType, number>;
	category: Record<CategoryKey, number>;
	date: Record<DateFacet, number>;
	source: Record<Source, number>;
};

/** Counts per value of `column` over the rows `where` selects, as a JSON object of text. */
const countsBy = (column: string, where: SQL) =>
	sql`(SELECT coalesce(json_object_agg(value, n), '{}'::json) FROM (
		SELECT ${sql.raw(column)} AS value, count(*)::text AS n
		FROM app.transactions WHERE ${where} GROUP BY 1) AS c)`;

/** Every option with its count, zero when no row has it. */
function counted<K extends string>(
	options: readonly K[],
	counts: Record<string, string>,
): Record<K, number> {
	return Object.fromEntries(
		options.map((option) => [option, safeInt(counts[option] ?? "0")]),
	) as Record<K, number>;
}

/**
 * The filter counts in one statement (BR-F03-59), through the filter-to-SQL module (FIL-2):
 * - each field ignores its own filter: types count every filter but `type`, categories every
 *   filter but `cat`, dates every filter but `from` and `to`, and sources every filter but
 *   `src`;
 * - dates count each preset's range from `ctx.today` in the profile zone (TIME-5);
 * - every option appears, zero counts included. Goal rows have no category, so no category
 *   counts them.
 */
export async function facetCounts(
	tx: Tx,
	ctx: ProfiledContext,
	filter: TransactionFilter,
): Promise<FacetCounts> {
	const currency = ctx.profile.currency;
	const dateWhere = filterSql(withoutFields(filter, "from", "to"), currency);
	const presets = RANGE_PRESETS.map((preset) => {
		const { from, to } = presetRange(preset, ctx.today);
		return sql`${preset}::text, (count(*) FILTER (WHERE occurred_on BETWEEN ${from}::date AND ${to}::date))::text`;
	});
	const { rows } = await tx.execute<{
		type: Record<string, string>;
		category: Record<string, string>;
		date: Record<string, string>;
		source: Record<string, string>;
	}>(sql`SELECT
		${countsBy("type", filterSql(withoutFields(filter, "type"), currency))} AS type,
		${countsBy("category", filterSql(withoutFields(filter, "cat"), currency))} AS category,
		(SELECT json_build_object('all', count(*)::text, ${sql.join(presets, sql`, `)})
			FROM app.transactions WHERE ${dateWhere}) AS date,
		${countsBy("source", filterSql(withoutFields(filter, "src"), currency))} AS source`);
	// A SELECT without FROM returns exactly one row.
	const row = rows[0] as (typeof rows)[number];
	return {
		type: counted(TXN_TYPES, row.type),
		category: counted(CATEGORY_KEYS, row.category),
		date: counted(["all", ...RANGE_PRESETS], row.date),
		source: counted(SOURCES, row.source),
	};
}
