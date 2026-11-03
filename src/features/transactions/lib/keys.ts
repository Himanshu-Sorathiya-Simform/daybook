import { QUERY_ROOTS } from "@/lib/api/query-keys";
import { compareCodeUnits } from "@/lib/compare";
import { lowercase } from "@/lib/text";
import type { ListParams, TransactionFilter } from "@/lib/transactions/url";
import type { Breakdown } from "./types";

/** The filter without its amount bounds, which the histogram ignores (BR-F03-60). */
export function withoutAmounts(filter: TransactionFilter): TransactionFilter {
	const rest = { ...filter };
	delete rest.minMinor;
	delete rest.maxMinor;
	return rest;
}

const TRANSACTIONS = [QUERY_ROOTS.transactions] as const;
const PAYEES = [QUERY_ROOTS.payees] as const;
const VIEWS = [QUERY_ROOTS.transactionViews] as const;

/**
 * The Transactions area's keys (STATE-5): the root, the kind of read, then its parameters. A
 * filter is the normalized object `readFilterParams` answers (BR-F03-33), so equivalent URLs
 * share one entry. A key holds only what selects data: the summary, counts and histogram
 * leave out the list parameters, and the histogram the amount bounds too (BR-F03-59,
 * BR-F03-60), so changing them reuses the cached answer.
 */
export const transactionKeys = {
	all: TRANSACTIONS,
	list: (filter: TransactionFilter, list: ListParams) =>
		[...TRANSACTIONS, "list", filter, list] as const,
	summary: (filter: TransactionFilter, by: readonly Breakdown[]) =>
		[
			...TRANSACTIONS,
			"summary",
			filter,
			[...new Set(by)].sort(compareCodeUnits),
		] as const,
	facets: (filter: TransactionFilter) =>
		[...TRANSACTIONS, "facets", filter] as const,
	histogram: (filter: TransactionFilter) =>
		[...TRANSACTIONS, "histogram", withoutAmounts(filter)] as const,
	detail: (id: string) => [...TRANSACTIONS, "detail", id.toLowerCase()] as const,
};

/** The payees area's keys. Payee text is matched without case on the server (BR-F03-61,
 * BR-F03-62), so its keys hold it lowered as Postgres lowers it (D-497). */
export const payeeKeys = {
	all: PAYEES,
	list: () => [...PAYEES, "list"] as const,
	search: (q: string) => [...PAYEES, "search", lowercase(q)] as const,
	history: (payee: string, months: number) =>
		[...PAYEES, "history", lowercase(payee), months] as const,
};

/** The saved views area's keys (BR-F03-63). */
export const viewKeys = {
	all: VIEWS,
	list: () => [...VIEWS, "list"] as const,
};
