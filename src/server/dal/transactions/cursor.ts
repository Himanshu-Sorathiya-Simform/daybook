import "server-only";
import { z } from "zod";
import { isUuid } from "@/lib/ids";
import {
	DIRS,
	GROUPS,
	SORTS,
	type Dir,
	type Group,
	type Sort,
} from "@/lib/transactions/model";
import { isIsoDate } from "@/lib/time";
import { ApiError } from "../../api/errors";

/** Which way a cursor moves through the list: toward later pages or earlier ones. */
export type Travel = "next" | "prev";

/**
 * A list cursor's contents (F03 section 3, D-474): the list parameters it was made under, the
 * way it moves, and the boundary row's sort keys and id. Under category or payee grouping it
 * also holds the boundary row's group key and the page's order fingerprint (BR-F03-57).
 */
export type Cursor = {
	v: 1;
	sort: Sort;
	dir: Dir;
	group: Group;
	travel: Travel;
	on: string;
	at: string;
	id: string;
	amount?: number;
	groupKey?: string;
	order?: string;
};

/** An instant as `Date.toISOString()` writes it, which `ROW_JSON` also writes. */
const INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
/** Whether `at` is a real instant, written as `Date.toISOString()` writes it, on a date
 * Postgres can read: it has no year 0000 (D-490). An impossible date such as month 13 makes an
 * invalid Date, whose `toISOString()` throws. */
function isInstant(at: string): boolean {
	const date = new Date(at);
	return (
		!Number.isNaN(date.getTime())
		&& date.toISOString() === at
		&& isIsoDate(at.slice(0, 10))
	);
}

/** C0 and C1 control characters. Postgres refuses a NUL in text, and no payee key holds any. */
const CONTROL = /[\u0000-\u001f\u007f-\u009f]/;
/** Whether `key` could be a group key: no control character and no lone surrogate (D-490). */
const isGroupKey = (key: string) => key.isWellFormed() && !CONTROL.test(key);

const FINGERPRINT = /^[0-9a-f]{16}$/;
/** Generous for a payee key of 80 code points, short enough to refuse junk early. */
const MAX_LENGTH = 2048;

const CURSOR = z
	.strictObject({
		v: z.literal(1),
		sort: z.enum(SORTS),
		dir: z.enum(DIRS),
		group: z.enum(GROUPS),
		travel: z.enum(["next", "prev"]),
		on: z.string().refine(isIsoDate),
		at: z.string().regex(INSTANT).refine(isInstant),
		id: z.string().refine(isUuid),
		amount: z.number().int().min(1).max(999_999_999_999).optional(),
		groupKey: z.string().min(1).max(320).refine(isGroupKey).optional(),
		order: z.string().regex(FINGERPRINT).optional(),
	})
	.refine(({ sort, amount }) => (sort === "amount") === (amount !== undefined))
	.refine(({ group, groupKey, order }) => {
		const ranked = group === "category" || group === "payee";
		return (
			ranked === (groupKey !== undefined) && ranked === (order !== undefined)
		);
	});

/** A cursor as opaque base64url JSON. */
export function encodeCursor(cursor: Cursor): string {
	return Buffer.from(JSON.stringify(cursor)).toString("base64url");
}

/**
 * The cursor in `text`, or `null` when it is not one (AC-F03-38, D-490): text that is not
 * base64url JSON, contents that fail the schema, or, when `list` is given, a cursor made under
 * another `sort`, `dir` or `group`. Without `list`, the request's own list parameters were
 * invalid, so only the contents count.
 */
export function readCursor(
	text: string,
	list?: { sort: Sort; dir: Dir; group: Group },
): Cursor | null {
	if (text.length > MAX_LENGTH || !/^[A-Za-z0-9_-]+$/.test(text)) return null;
	let json: unknown;
	try {
		json = JSON.parse(Buffer.from(text, "base64url").toString("utf8"));
	} catch {
		return null;
	}
	const parsed = CURSOR.safeParse(json);
	if (!parsed.success) return null;
	const cursor = parsed.data as Cursor;
	if (
		list
		&& (cursor.sort !== list.sort
			|| cursor.dir !== list.dir
			|| cursor.group !== list.group)
	) {
		return null;
	}
	return cursor;
}

/** The cursor in `text`, made under the same `sort`, `dir` and `group` as this request; anything
 * else gets 400 `bad_request` naming `cursor` (AC-F03-38). */
export function decodeCursor(
	text: string,
	list: { sort: Sort; dir: Dir; group: Group },
): Cursor {
	const cursor = readCursor(text, list);
	if (!cursor)
		throw new ApiError("bad_request", { details: { params: ["cursor"] } });
	return cursor;
}
