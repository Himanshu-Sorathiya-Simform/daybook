import "server-only";
import type { CurrencyCode } from "@/lib/currency";
import { codePointLength, normalizeText } from "@/lib/text";
import { type FilterParam, MAX_LIMIT, PAGE_SIZE } from "@/lib/transactions/model";
import {
	type ListParams,
	readFilterParams,
	type TransactionFilter,
} from "@/lib/transactions/url";
import { ApiError } from "../../api/errors";
import { readCursor } from "./cursor";

/** 400 `bad_request` naming every invalid parameter, in the URL's order (D-457, D-478). */
export function badParams(params: readonly string[]): ApiError {
	return new ApiError("bad_request", { details: { params: [...params] } });
}

/** One parameter as D-458 reads it: `undefined` when absent or empty, `null` when repeated. */
export function single(
	query: URLSearchParams,
	name: string,
): string | undefined | null {
	const values = query.getAll(name);
	if (values.length > 1) return null;
	return values[0] === "" ? undefined : values[0];
}

/** A page size: digits only, 1 to 100 (API-7). */
const LIMIT = /^[1-9]\d{0,2}$/;

/** The list parameters, which select no rows: the summary, the filter counts and the histogram
 * ignore them, valid or not (F03 section 3, D-478). */
export const LIST_PARAMS = [
	"sort",
	"dir",
	"group",
] as const satisfies readonly FilterParam[];

export type ListQuery = {
	filter: TransactionFilter;
	list: ListParams;
	limit: number;
	cursor: string | undefined;
};

/**
 * The list endpoint's query (F03 section 11): the filter and list parameters through the
 * shared URL reader (BR-F03-33), `limit` (default 50) and `cursor`. Every invalid parameter,
 * a repeated `limit` or `cursor` included, gets one 400 naming them all (D-478). A cursor that
 * does not decode, or was made under other list parameters, is named last; when a list
 * parameter is itself invalid, only the cursor's contents are checked (D-490). Unknown names
 * are ignored (D-458).
 */
export function readListQuery(
	query: URLSearchParams,
	currency: CurrencyCode,
): ListQuery {
	const { filter, list, invalid } = readFilterParams(query, { currency });
	const refused: string[] = [...invalid];

	let limit = PAGE_SIZE;
	const rawLimit = single(query, "limit");
	if (rawLimit === null) refused.push("limit");
	else if (rawLimit !== undefined) {
		const parsed =
			LIMIT.test(rawLimit) ? Number.parseInt(rawLimit, 10) : Number.NaN;
		if (parsed <= MAX_LIMIT) limit = parsed;
		else refused.push("limit");
	}

	const cursor = single(query, "cursor");
	const listValid = !LIST_PARAMS.some((name) => invalid.includes(name));
	if (
		cursor === null
		|| (cursor !== undefined
			&& readCursor(cursor, listValid ? list : undefined) === null)
	) {
		refused.push("cursor");
	}

	if (refused.length > 0) throw badParams(refused);
	return { filter, list, limit, cursor: cursor ?? undefined };
}

/** The histogram also ignores the amount bounds, valid or not (F03 section 11, D-478). */
export const HISTOGRAM_IGNORES = [...LIST_PARAMS, "min", "max"] as const;

/** Whether `name` is among the ignored parameters. */
const isIgnored = (ignore: readonly FilterParam[], name: FilterParam) =>
	ignore.includes(name);

/** The filter of a query, refusing every invalid parameter but the ignored ones (D-478). */
function filterOf(
	query: URLSearchParams,
	currency: CurrencyCode,
	ignore: readonly FilterParam[],
): { filter: TransactionFilter; refused: string[] } {
	const { filter, invalid } = readFilterParams(query, { currency });
	return { filter, refused: invalid.filter((name) => !isIgnored(ignore, name)) };
}

/** The filter of a query for an endpoint that reads no list parameters: 400 naming every
 * invalid parameter outside `ignore`. */
export function readFilterQuery(
	query: URLSearchParams,
	currency: CurrencyCode,
	ignore: readonly FilterParam[],
): TransactionFilter {
	const { filter, refused } = filterOf(query, currency, ignore);
	if (refused.length > 0) throw badParams(refused);
	return filter;
}

/** What a summary can break Out down by (BR-F03-58). */
export const BREAKDOWNS = ["category", "payee"] as const;
export type Breakdown = (typeof BREAKDOWNS)[number];

/** `by`: absent for no breakdowns, else a comma list of distinct breakdowns. An empty value,
 * an unknown or repeated value, or `by` given twice is invalid (BR-F03-58). */
function readBy(query: URLSearchParams): Breakdown[] | null {
	const values = query.getAll("by");
	if (values.length === 0) return [];
	if (values.length > 1) return null;
	const items = (values[0] as string).split(",");
	const known = items.every((item): item is Breakdown =>
		(BREAKDOWNS as readonly string[]).includes(item),
	);
	return known && new Set(items).size === items.length ?
			(items as Breakdown[])
		:	null;
}

/** The summary's query: the filter, ignoring the list parameters, and `by`. One 400 names
 * every invalid parameter, `by` last (D-478). */
export function readSummaryQuery(
	query: URLSearchParams,
	currency: CurrencyCode,
): { filter: TransactionFilter; by: Breakdown[] } {
	const { filter, refused } = filterOf(query, currency, LIST_PARAMS);
	const by = readBy(query);
	if (by === null) refused.push("by");
	if (refused.length > 0) throw badParams(refused);
	return { filter, by: by as Breakdown[] };
}

/** A payee is 1 to 80 code points (BR-F03-12). */
const PAYEE_MAX = 80;

/** Payee text in a query (BR-F03-61, BR-F03-62): BR-F03-12's trimming and NFC, then 1 to 80
 * code points without control characters. `undefined` when absent; `null` when empty,
 * repeated or otherwise invalid, since here an empty value is a mistake, not "no filter". */
function payeeText(query: URLSearchParams, name: string): string | undefined | null {
	const values = query.getAll(name);
	if (values.length === 0) return undefined;
	if (values.length > 1) return null;
	const text = normalizeText(values[0] as string);
	if (!text.ok) return null;
	const length = codePointLength(text.value);
	return length >= 1 && length <= PAYEE_MAX ? text.value : null;
}

/** `GET /api/payees`'s query: an optional search `q` (BR-F03-61). */
export function readPayeesQuery(query: URLSearchParams): { q?: string } {
	const q = payeeText(query, "q");
	if (q === null) throw badParams(["q"]);
	return q === undefined ? {} : { q };
}

/** `months` for payee history: `1` to `12`, digits only (BR-F03-62, D-482). */
const MONTHS = /^(?:[1-9]|1[0-2])$/;
const DEFAULT_MONTHS = 3;

/** `GET /api/payees/history`'s query: a required `payee` and `months`, default 3. One 400
 * names each invalid one (BR-F03-62). */
export function readHistoryQuery(query: URLSearchParams): {
	payee: string;
	months: number;
} {
	const refused: string[] = [];
	const payee = payeeText(query, "payee");
	if (payee === undefined || payee === null) refused.push("payee");
	const values = query.getAll("months");
	let months = DEFAULT_MONTHS;
	if (values.length > 0) {
		const [raw] = values;
		if (values.length === 1 && MONTHS.test(raw as string))
			months = Number.parseInt(raw as string, 10);
		else refused.push("months");
	}
	if (refused.length > 0) throw badParams(refused);
	return { payee: payee as string, months };
}
