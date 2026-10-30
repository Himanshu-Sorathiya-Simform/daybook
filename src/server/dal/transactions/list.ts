import "server-only";
import { type SQL, sql } from "drizzle-orm";
import {
	MAX_LIMIT,
	type Dir,
	type Group,
	type Sort,
	type Transaction,
} from "@/lib/transactions/model";
import type { TransactionFilter } from "@/lib/transactions/url";
import { safeInt } from "../../db/safe-int";
import type { ProfiledContext } from "../context";
import type { Tx } from "../with-user";
import { type Cursor, decodeCursor, encodeCursor, type Travel } from "./cursor";
import { filterSql } from "./filter";
import { readRow, ROW_JSON, type RowJson } from "./row";
import { GROUP_JSON, PAYEE_KEY, PAYEE_LABEL, WEIGHT } from "./totals";

export type ListOptions = {
	sort: Sort;
	dir: Dir;
	group: Group;
	limit: number;
	cursor?: string | undefined;
};

/** A group's totals over the whole filter (BR-F03-56). `label` names a payee group. */
export type GroupTotal = {
	key: string;
	label: string | null;
	count: number;
	inMinor: number;
	outMinor: number;
	toGoalsMinor: number;
};

/** One page of the list (F03 section 11); the endpoint adds `currency`. */
export type TransactionPage = {
	items: Transaction[];
	nextCursor: string | null;
	prevCursor: string | null;
	/** One entry per group with a row on the page, in page order; empty under no grouping. */
	groups: GroupTotal[];
	/** The order fingerprint under category or payee grouping (BR-F03-57), else null. */
	order: string | null;
};

type GroupJson = Omit<GroupTotal, "count" | "inMinor" | "outMinor" | "toGoalsMinor">
	& Record<"count" | "inMinor" | "outMinor" | "toGoalsMinor", string>;

type Result = {
	order: string | null;
	rows: { key: string; row: RowJson }[];
	groups: GroupJson[];
};

/** Each sort's order keys, ending in `id` so no two rows tie (BR-F03-29). */
const SORT_KEYS: Record<Sort, string> = {
	date: "occurred_on, occurred_at, id",
	amount: "amount_minor, occurred_on, occurred_at, id",
};

/** Whether rows run toward the end of the list: forward travel in display order. */
const descending = (dir: Dir, travel: Travel) =>
	(dir === "desc") === (travel === "next");

/** `ORDER BY` for a page: the group's rank first when ranked (never reversed by `dir`, only by
 * travel), then the sort's keys in `dir`. A previous page runs backward from its boundary. */
function orderBy(sort: Sort, dir: Dir, travel: Travel, ranked: boolean): SQL {
	const rows = descending(dir, travel) ? "DESC" : "ASC";
	const keys = SORT_KEYS[sort]
		.split(", ")
		.map((key) => `${key} ${rows}`)
		.join(", ");
	const rankOrder = travel === "next" ? "ASC" : "DESC";
	return sql.raw(ranked ? `rank ${rankOrder}, ${keys}` : keys);
}

/** Rows past the cursor's boundary row in its direction of travel, by a row comparison over
 * the sort's keys, which the order indexes serve (API-7). */
function pastBoundary(cursor: Cursor): SQL {
	const values = [
		sql`${cursor.on}::date`,
		sql`${cursor.at}::timestamptz`,
		sql`${cursor.id}::uuid`,
	];
	if (cursor.sort === "amount") values.unshift(sql`${cursor.amount}::bigint`);
	const op = descending(cursor.dir, cursor.travel) ? "<" : ">";
	const bounds = sql.join(values, sql`, `);
	return sql`(${sql.raw(SORT_KEYS[cursor.sort])}) ${sql.raw(op)} (${bounds})`;
}

/** Category or payee grouping: every group of the filter ranked by weight, then key
 * (BR-F03-55); the fingerprint of that order (BR-F03-57); and the page in group order. A
 * cursor from another order matches no row. */
function rankedStatement(
	where: SQL,
	group: "category" | "payee",
	order: SQL,
	limit: number,
	cursor: Cursor | undefined,
): SQL {
	const key = group === "category" ? sql`category` : PAYEE_KEY;
	const label = group === "payee" ? PAYEE_LABEL : sql`NULL::text`;
	let after = sql`true`;
	if (cursor) {
		const rank = sql`(SELECT rank FROM g WHERE key = ${cursor.groupKey})`;
		const later = cursor.travel === "next" ? sql`>` : sql`<`;
		after = sql`(SELECT fingerprint FROM fp) = ${cursor.order}
			AND (rank ${later} ${rank} OR (rank = ${rank} AND ${pastBoundary(cursor)}))`;
	}
	return sql`WITH f AS (SELECT *, ${key} AS key FROM app.transactions WHERE ${where}),
	g AS (
		SELECT key, row_number() OVER (ORDER BY ${WEIGHT} DESC, key COLLATE "C") AS rank,
			json_build_object('key', key, 'label', ${label}, ${GROUP_JSON}) AS totals
		FROM f GROUP BY key),
	fp AS (
		SELECT left(encode(sha256(convert_to(
			coalesce(string_agg(key, E'\\x1f' ORDER BY rank), ''), 'UTF8')), 'hex'), 16) AS fingerprint
		FROM g),
	page AS (
		SELECT f.*, g.rank FROM f JOIN g USING (key)
		WHERE ${after} ORDER BY ${order} LIMIT ${limit + 1})
	SELECT (SELECT fingerprint FROM fp) AS "order",
		(SELECT coalesce(json_agg(json_build_object('key', key, 'row', ${ROW_JSON}) ORDER BY ${order}),
			'[]'::json) FROM page) AS rows,
		(SELECT coalesce(json_agg(totals), '[]'::json) FROM g WHERE key IN (SELECT key FROM page)) AS groups`;
}

/** Day or no grouping: the page straight from an order index. Day totals cover only the
 * page's days, so a page never adds up the whole filter. */
function plainStatement(
	where: SQL,
	group: "day" | "none",
	order: SQL,
	limit: number,
	cursor: Cursor | undefined,
): SQL {
	const after = cursor ? pastBoundary(cursor) : sql`true`;
	const groups =
		group === "day" ?
			sql`(SELECT coalesce(json_agg(totals), '[]'::json) FROM (
				SELECT json_build_object('key', occurred_on::text, 'label', NULL::text, ${GROUP_JSON}) AS totals
				FROM app.transactions
				WHERE ${where} AND occurred_on IN (SELECT occurred_on FROM page)
				GROUP BY occurred_on) AS d)`
		:	sql`'[]'::json`;
	return sql`WITH page AS (
		SELECT * FROM app.transactions WHERE ${where} AND ${after} ORDER BY ${order} LIMIT ${limit + 1})
	SELECT NULL::text AS "order",
		(SELECT coalesce(json_agg(json_build_object('key', occurred_on::text, 'row', ${ROW_JSON})
			ORDER BY ${order}), '[]'::json) FROM page) AS rows,
		${groups} AS groups`;
}

function readGroup({
	count,
	inMinor,
	outMinor,
	toGoalsMinor,
	...rest
}: GroupJson): GroupTotal {
	return {
		...rest,
		count: safeInt(count),
		inMinor: safeInt(inMinor),
		outMinor: safeInt(outMinor),
		toGoalsMinor: safeInt(toGoalsMinor),
	};
}

/**
 * One page of the filter's confirmed rows (TXN-6) in one statement (F03 section 11):
 * - order: BR-F03-29, grouped first by category or payee rank when asked (BR-F03-55);
 * - `groups`: whole-filter totals for each group on the page (BR-F03-56);
 * - `order`: the group order's fingerprint, and an empty page when a cursor's order is stale
 *   (BR-F03-57, D-446);
 * - cursors: `nextCursor` while rows remain, `prevCursor` on any page reached by a cursor
 *   while rows remain before it (D-474).
 * A bad cursor, or one made under another sort, direction or grouping, gets 400 `bad_request`.
 */
export async function listTransactions(
	tx: Tx,
	ctx: ProfiledContext,
	filter: TransactionFilter,
	{ sort, dir, group, limit, cursor: text }: ListOptions,
): Promise<TransactionPage> {
	if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
		throw new RangeError(`A page holds 1 to ${MAX_LIMIT} rows, not ${limit}.`);
	}
	if (group === "day" && sort !== "date") {
		throw new RangeError("Day grouping needs the date sort (BR-F03-55).");
	}
	const cursor =
		text === undefined ? undefined : decodeCursor(text, { sort, dir, group });
	const travel = cursor?.travel ?? "next";
	const ranked = group === "category" || group === "payee";
	const where = filterSql(filter, ctx.profile.currency);
	const order = orderBy(sort, dir, travel, ranked);
	const statement =
		ranked ?
			rankedStatement(where, group, order, limit, cursor)
		:	plainStatement(where, group, order, limit, cursor);

	const { rows } = await tx.execute<Result>(statement);
	// A SELECT without FROM returns exactly one row.
	const result = rows[0] as Result;
	// A stale cursor matched no row, so its page is empty, with no cursors and the new order.
	const more = result.rows.length > limit;
	const page = result.rows.slice(0, limit);
	if (travel === "prev") page.reverse();

	const cursorAt = (entry: (typeof page)[number], toward: Travel) =>
		encodeCursor({
			v: 1,
			sort,
			dir,
			group,
			travel: toward,
			on: entry.row.occurredOn,
			at: entry.row.occurredAt,
			id: entry.row.id,
			...(sort === "amount" && { amount: safeInt(entry.row.amountMinor) }),
			...(ranked && { groupKey: entry.key, order: result.order as string }),
		});
	const first = page[0];
	const last = page.at(-1);
	const hasNext = travel === "next" ? more : true;
	const hasPrev = travel === "prev" ? more : cursor !== undefined;

	const totals = new Map(result.groups.map((entry) => [entry.key, entry]));
	const keys = [...new Set(page.map((entry) => entry.key))];
	return {
		items: page.map((entry) => readRow(entry.row)),
		nextCursor: last && hasNext ? cursorAt(last, "next") : null,
		prevCursor: first && hasPrev ? cursorAt(first, "prev") : null,
		groups:
			group === "none" ?
				[]
			:	keys.map((key) => readGroup(totals.get(key) as GroupJson)),
		order: result.order,
	};
}
