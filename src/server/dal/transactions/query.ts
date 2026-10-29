import "server-only";
import type { CurrencyCode } from "@/lib/currency";
import { MAX_LIMIT, PAGE_SIZE } from "@/lib/transactions/model";
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
