import type { CategoryKey } from "@/lib/categories";
import type { CurrencyCode } from "@/lib/currency";
import type { DatePreset, Source, Transaction, TxnType } from "./model";
import type { SavedView } from "./views";

/** An answer that carries the profile currency (API-6). */
export type WithCurrency<T> = T & { currency: CurrencyCode };

/** A group's totals over the whole filter (BR-F03-56). `label` names a payee group. */
export type GroupTotal = {
	key: string;
	label: string | null;
	count: number;
	inMinor: number;
	outMinor: number;
	toGoalsMinor: number;
};

/** One page of the list (F03 section 11); the endpoint adds `currency`. */
export type TransactionPage = {
	items: Transaction[];
	nextCursor: string | null;
	prevCursor: string | null;
	/** One entry per group with a row on the page, in page order; empty under no grouping. */
	groups: GroupTotal[];
	/** The order fingerprint under category or payee grouping (BR-F03-57), else null. */
	order: string | null;
};

/** What a summary can break Out down by (BR-F03-58). */
export const BREAKDOWNS = ["category", "payee"] as const;
export type Breakdown = (typeof BREAKDOWNS)[number];

/** One group of a summary breakdown (BR-F03-58): its expense and refund rows only. */
export type BreakdownGroup = {
	key: string;
	label: string | null;
	count: number;
	outMinor: number;
};

/** The header totals and date span (BR-F03-41, BR-F03-58); the endpoint adds `currency`. */
export type Summary = {
	count: number;
	incomeMinor: number;
	spendingMinor: number;
	toGoalsMinor: number;
	firstOn: string | null;
	lastOn: string | null;
	byCategory?: BreakdownGroup[];
	byPayee?: BreakdownGroup[];
};

/** The date options counted: every preset but `custom` (BR-F03-59). */
export type DateFacet = Exclude<DatePreset, "custom">;

/** How many confirmed rows each option of four filter fields would give (BR-F03-59). */
export type FacetCounts = {
	type: Record<TxnType, number>;
	category: Record<CategoryKey, number>;
	date: Record<DateFacet, number>;
	source: Record<Source, number>;
};

/** A payee's newest expense (BR-F03-44, D-451): what F05's Add fills in. */
export type LastExpense = { amountMinor: number; category: CategoryKey };

/** One payee in the suggestions (BR-F03-44): its newest spelling, type and category, and its
 * newest expense, or null when it has none. */
export type PayeeItem = {
	payee: string;
	count: number;
	lastUsedOn: string;
	lastType: TxnType;
	lastCategory: CategoryKey;
	lastExpense: LastExpense | null;
};

/** The suggestions; `categories` only without a search (BR-F03-44, BR-F03-61). */
export type PayeeList = {
	items: PayeeItem[];
	categories?: { key: CategoryKey; count: number }[];
};

/** `GET /api/payees`: the suggestions with the profile currency, since `lastExpense` holds
 * money (API-6). */
export type PayeesAnswer = WithCurrency<PayeeList>;

/** One payee's recent rows (BR-F03-62); the endpoint adds `currency`. */
export type PayeeHistory = {
	count: number;
	inMinor: number;
	outMinor: number;
	usualDay: number | null;
};

export type ViewsAnswer = { items: SavedView[]; currency: CurrencyCode };

export type ListAnswer = WithCurrency<TransactionPage>;
export type SummaryAnswer = WithCurrency<Summary>;
