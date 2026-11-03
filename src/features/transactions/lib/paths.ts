import type { CurrencyCode } from "@/lib/currency";
import { DEFAULT_DIR, DEFAULT_SORT, defaultGroup } from "@/lib/transactions/model";
import {
	type ListParams,
	type TransactionFilter,
	writeFilterQuery,
} from "@/lib/transactions/url";
import { withoutAmounts } from "./keys";
import type { Breakdown } from "./types";

/** The list parameters a read that ignores them is written with: all defaults, so none of them
 * reaches the URL (BR-F03-33). */
const NO_LIST: ListParams = {
	sort: DEFAULT_SORT,
	dir: DEFAULT_DIR,
	group: defaultGroup(DEFAULT_SORT),
};

function withQuery(path: string, ...parts: (string | undefined)[]): string {
	const query = parts
		.filter((part) => part !== undefined && part !== "")
		.join("&");
	return query === "" ? path : `${path}?${query}`;
}

const param = (name: string, value: string) =>
	`${name}=${encodeURIComponent(value)}`;

/** A page of the list (F03 section 11): the filter and list parameters in BR-F03-33's order,
 * then the cursor, which is base64url and so passes unchanged. The limit is the server's
 * default page of 50 (BR-F03-30). */
export function listPath(
	filter: TransactionFilter,
	list: ListParams,
	{ currency, cursor }: { currency: CurrencyCode; cursor: string | null },
): string {
	return withQuery(
		"/api/transactions",
		writeFilterQuery(filter, list, { currency }),
		cursor === null ? undefined : param("cursor", cursor),
	);
}

/** The summary of a filter, with `by` last (D-500). No `by` asks for no breakdowns. */
export function summaryPath(
	filter: TransactionFilter,
	by: readonly Breakdown[],
	currency: CurrencyCode,
): string {
	return withQuery(
		"/api/transactions/summary",
		writeFilterQuery(filter, NO_LIST, { currency }),
		by.length === 0 ? undefined : `by=${[...new Set(by)].join(",")}`,
	);
}

/** The filter counts of a filter (BR-F03-59). */
export function facetsPath(
	filter: TransactionFilter,
	currency: CurrencyCode,
): string {
	return withQuery(
		"/api/transactions/facets",
		writeFilterQuery(filter, NO_LIST, { currency }),
	);
}

/** The amount histogram of a filter, whose amount bounds it ignores (BR-F03-60). */
export function histogramPath(
	filter: TransactionFilter,
	currency: CurrencyCode,
): string {
	return withQuery(
		"/api/transactions/amount-histogram",
		writeFilterQuery(withoutAmounts(filter), NO_LIST, { currency }),
	);
}

/** One Transaction, its edit and its delete (F03 section 11). */
export function transactionPath(id: string): string {
	return `/api/transactions/${encodeURIComponent(id)}`;
}

/** The payee suggestions, or a server search of them (BR-F03-44, BR-F03-61). */
export function payeesPath(q?: string): string {
	return withQuery("/api/payees", q === undefined ? undefined : param("q", q));
}

/** One payee's recent rows (BR-F03-62). The payee travels as a query parameter, so `/`, `?`,
 * `#` and `%` in it are safe (section 13). */
export function payeeHistoryPath(payee: string, months: number): string {
	return withQuery(
		"/api/payees/history",
		param("payee", payee),
		`months=${months}`,
	);
}

/** The saved views, and one of them (F03 section 11). */
export const VIEWS_PATH = "/api/transaction-views";

export function viewPath(id: string): string {
	return `${VIEWS_PATH}/${encodeURIComponent(id)}`;
}
