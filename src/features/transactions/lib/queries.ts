import { infiniteQueryOptions, queryOptions } from "@tanstack/react-query";

import { apiFetch } from "@/lib/api/client";
import type { CurrencyCode } from "@/lib/currency";
import type { ListParams, TransactionFilter } from "@/lib/transactions/url";
import { payeeKeys, transactionKeys, viewKeys } from "./keys";
import {
	facetsPath,
	histogramPath,
	listPath,
	payeeHistoryPath,
	payeesPath,
	summaryPath,
	transactionPath,
	VIEWS_PATH,
} from "./paths";
import type {
	Breakdown,
	FacetsAnswer,
	HistogramAnswer,
	PayeeHistoryAnswer,
	PayeesAnswer,
	SummaryAnswer,
	TransactionAnswer,
	TransactionPageAnswer,
	ViewsAnswer,
} from "./types";

/** The list keeps at most this many pages in memory and reloads trimmed ones through their
 * cursors (BR-F03-30, D-36). */
export const MAX_PAGES = 5;

/** The payee list changes only with a write, which refreshes it, or on another device. */
export const PAYEES_STALE_MS = 5 * 60_000;

/** The panel's payee history covers this many months (BR-F03-72). */
export const HISTORY_MONTHS = 3;

type FilterRead = { filter: TransactionFilter; currency: CurrencyCode };

/**
 * The infinite list (BR-F03-29, BR-F03-30): pages of 50 through next and previous cursors, at
 * most 5 kept. A cursor's page whose `order` differs from the others is the server saying the
 * groups moved (BR-F03-57); `useTransactionList` then reloads from the first page.
 */
export function transactionListOptions({
	filter,
	list,
	currency,
}: FilterRead & { list: ListParams }) {
	return infiniteQueryOptions({
		queryKey: transactionKeys.list(filter, list),
		queryFn: ({ pageParam, signal }) =>
			apiFetch<TransactionPageAnswer>(
				listPath(filter, list, { currency, cursor: pageParam }),
				{ signal },
			),
		initialPageParam: null as string | null,
		getNextPageParam: (last) => last.nextCursor,
		getPreviousPageParam: (first) => first.prevCursor,
		maxPages: MAX_PAGES,
	});
}

/** Whether the loaded pages disagree on the group order, which only a page fetched after a
 * reorder does (BR-F03-57). Day and no grouping have no order, so they never disagree. */
export function orderChanged(pages: readonly TransactionPageAnswer[]): boolean {
	const first = pages[0];
	return first !== undefined && pages.some((page) => page.order !== first.order);
}

/** The header totals and, with `by`, the breakdowns (BR-F03-41, BR-F03-58). */
export function transactionSummaryOptions({
	filter,
	by,
	currency,
}: FilterRead & { by: readonly Breakdown[] }) {
	return queryOptions({
		queryKey: transactionKeys.summary(filter, by),
		queryFn: ({ signal }) =>
			apiFetch<SummaryAnswer>(summaryPath(filter, by, currency), { signal }),
	});
}

/** The filter counts (BR-F03-59). */
export function facetsOptions({ filter, currency }: FilterRead) {
	return queryOptions({
		queryKey: transactionKeys.facets(filter),
		queryFn: ({ signal }) =>
			apiFetch<FacetsAnswer>(facetsPath(filter, currency), { signal }),
	});
}

/** The amount histogram, for every filter but the amount bounds (BR-F03-60). */
export function histogramOptions({ filter, currency }: FilterRead) {
	return queryOptions({
		queryKey: transactionKeys.histogram(filter),
		queryFn: ({ signal }) =>
			apiFetch<HistogramAnswer>(histogramPath(filter, currency), { signal }),
	});
}

/** One Transaction, for a row the loaded pages do not hold (BR-F03-53). */
export function transactionOptions(id: string) {
	return queryOptions({
		queryKey: transactionKeys.detail(id),
		queryFn: ({ signal }) =>
			apiFetch<TransactionAnswer>(transactionPath(id), { signal }),
	});
}

/** The 200 payee suggestions and the category counts (BR-F03-44). */
export function payeesOptions() {
	return queryOptions({
		queryKey: payeeKeys.list(),
		queryFn: ({ signal }) => apiFetch<PayeesAnswer>(payeesPath(), { signal }),
		staleTime: PAYEES_STALE_MS,
	});
}

/** The server's payee search, for `q` as `payeeQueryText` gives it (BR-F03-61). */
export function payeeSearchOptions(q: string) {
	return queryOptions({
		queryKey: payeeKeys.search(q),
		queryFn: ({ signal }) => apiFetch<PayeesAnswer>(payeesPath(q), { signal }),
	});
}

/** One payee's recent rows (BR-F03-62, BR-F03-72). */
export function payeeHistoryOptions(payee: string, months = HISTORY_MONTHS) {
	return queryOptions({
		queryKey: payeeKeys.history(payee, months),
		queryFn: ({ signal }) =>
			apiFetch<PayeeHistoryAnswer>(payeeHistoryPath(payee, months), {
				signal,
			}),
	});
}

/** The saved views, in BR-F03-63's order. */
export function viewsOptions() {
	return queryOptions({
		queryKey: viewKeys.list(),
		queryFn: ({ signal }) => apiFetch<ViewsAnswer>(VIEWS_PATH, { signal }),
	});
}
