import type { CurrencyCode } from "@/lib/currency";
import type { Transaction } from "@/lib/transactions/model";
import type { SavedView } from "@/lib/transactions/views";
import type { FacetCounts } from "@/server/dal/transactions/facets";
import type {
	ListAnswer,
	SummaryAnswer as Summarized,
} from "@/server/dal/transactions/answers";
import type { PayeeHistory, PayeeList } from "@/server/dal/transactions/payees";
import type { Breakdown } from "@/server/dal/transactions/query";

export type { Breakdown } from "@/server/dal/transactions/query";
export type { BreakdownGroup } from "@/server/dal/transactions/summary";

/** The answers of F03 section 11's reads and writes, as the routes send them. The types come
 * from the data access layer that builds each answer, so the two cannot drift. */
type WithCurrency<T> = T & { currency: CurrencyCode };

export type TransactionPageAnswer = ListAnswer;
export type SummaryAnswer = Summarized;
export type FacetsAnswer = FacetCounts;
export type HistogramAnswer = WithCurrency<{ edges: number[]; counts: number[] }>;
export type TransactionAnswer = WithCurrency<Transaction>;
export type PayeesAnswer = PayeeList;
export type PayeeHistoryAnswer = WithCurrency<PayeeHistory>;
export type { ViewsAnswer } from "@/server/dal/transaction-views/list";
export type ViewAnswer = WithCurrency<SavedView>;

/** The breakdowns the Transactions page asks with its summary: the header and the panel share
 * one request (BR-F03-71). */
export const PAGE_BREAKDOWNS: readonly Breakdown[] = ["category", "payee"];
