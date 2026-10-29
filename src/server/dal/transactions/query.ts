import "server-only";
import type { CurrencyCode } from "@/lib/currency";
import { type FilterParam, MAX_LIMIT, PAGE_SIZE } from "@/lib/transactions/model";
import {
	type ListParams,
	readFilterParams,
	type TransactionFilter,
} from "@/lib/transactions/url";
import { ApiError } from "../../api/errors";

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

export type ListQuery = {
	filter: TransactionFilter;
	list: ListParams;
	limit: number;
	cursor: string | undefined;
};

/**
 * The list endpoint's query (F03 section 11): the filter and list parameters through the
 * shared URL reader (BR-F03-33), `limit` (default 50) and `cursor`. Every invalid parameter,
 * a repeated `limit` or `cursor` included, gets one 400 naming them all (D-478). The cursor's
 * contents are checked when the list decodes it. Unknown names are ignored (D-458).
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
		const parsed = LIMIT.test(rawLimit) ? Number.parseInt(rawLimit, 10) : NaN;
		if (parsed <= MAX_LIMIT) limit = parsed;
		else refused.push("limit");
	}

	const cursor = single(query, "cursor");
	if (cursor === null) refused.push("cursor");

	if (refused.length > 0) throw badParams(refused);
	return { filter, list, limit, cursor: cursor ?? undefined };
}

/** The list parameters, which select no rows: the summary, the filter counts and the histogram
 * ignore them, valid or not (F03 section 3, D-478). */
export const LIST_PARAMS = [
	"sort",
	"dir",
	"group",
] as const satisfies readonly FilterParam[];

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
