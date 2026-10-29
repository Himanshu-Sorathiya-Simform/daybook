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
/** Whether `at` is a real instant, written as `Date.toISOString()` writes it. An impossible
 * date such as month 13 makes an invalid Date, whose `toISOString()` throws. */
function isInstant(at: string): boolean {
	const date = new Date(at);
	return !Number.isNaN(date.getTime()) && date.toISOString() === at;
}

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
		groupKey: z.string().min(1).max(320).optional(),
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

const refused = () =>
	new ApiError("bad_request", { details: { params: ["cursor"] } });

/**
 * The cursor in `text`, made under the same `sort`, `dir` and `group` as this request. Anything
 * else gets 400 `bad_request` naming `cursor` (AC-F03-38): text that is not base64url JSON,
 * contents that fail the schema, or a cursor made under other list parameters.
 */
export function decodeCursor(
	text: string,
	list: { sort: Sort; dir: Dir; group: Group },
): Cursor {
	if (text.length > MAX_LENGTH || !/^[A-Za-z0-9_-]+$/.test(text)) throw refused();
	let json: unknown;
	try {
		json = JSON.parse(Buffer.from(text, "base64url").toString("utf8"));
	} catch {
		throw refused();
	}
	const parsed = CURSOR.safeParse(json);
	if (!parsed.success) throw refused();
	const cursor = parsed.data as Cursor;
	if (
		cursor.sort !== list.sort
		|| cursor.dir !== list.dir
		|| cursor.group !== list.group
	) {
		throw refused();
	}
	return cursor;
}
