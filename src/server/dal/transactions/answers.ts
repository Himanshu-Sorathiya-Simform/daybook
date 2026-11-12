import "server-only";
import type { CurrencyCode } from "@/lib/currency";
import type { TransactionFilter } from "@/lib/transactions/url";
import type { ProfiledContext } from "../context";
import type { Tx } from "../with-user";
import { listTransactions, type TransactionPage } from "./list";
import type { Breakdown, ListQuery } from "./query";
import { type Summary, transactionSummary } from "./summary";

/** An answer that carries the profile currency (API-6). */
export type WithCurrency<T> = T & { currency: CurrencyCode };

export type ListAnswer = WithCurrency<TransactionPage>;
export type SummaryAnswer = WithCurrency<Summary>;

/**
 * `GET /api/transactions`'s answer for a read query: one page, its group totals and order
 * fingerprint, and the currency. The route and the page's server prefetch both call it, so
 * the two answers cannot differ (STATE-5).
 */
export async function listAnswer(
	tx: Tx,
	ctx: ProfiledContext,
	{ filter, list, limit, cursor }: ListQuery,
): Promise<ListAnswer> {
	const page = await listTransactions(tx, ctx, filter, { ...list, limit, cursor });
	return { ...page, currency: ctx.profile.currency };
}

/** `GET /api/transactions/summary`'s answer: the header totals, the date span, the asked
 * breakdowns and the currency. The route and the page's server prefetch both call it
 * (STATE-5). */
export async function summaryAnswer(
	tx: Tx,
	ctx: ProfiledContext,
	{ filter, by }: { filter: TransactionFilter; by: readonly Breakdown[] },
): Promise<SummaryAnswer> {
	const summary = await transactionSummary(tx, ctx, filter, by);
	return { ...summary, currency: ctx.profile.currency };
}
