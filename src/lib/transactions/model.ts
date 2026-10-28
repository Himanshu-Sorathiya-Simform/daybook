import {
	EXPENSE_CATEGORIES,
	INCOME_CATEGORIES,
	type CategoryKey,
} from "@/lib/categories";

/** Transaction types (TXN-1). */
export const TXN_TYPES = [
	"income",
	"expense",
	"refund",
	"goal_contribution",
	"goal_withdrawal",
] as const;
export type TxnType = (typeof TXN_TYPES)[number];

/** The types that move money into or out of a Goal (D-21). */
export const GOAL_TYPES = [
	"goal_contribution",
	"goal_withdrawal",
] as const satisfies readonly TxnType[];

/** An edit may change the type only within its group (BR-F03-02, D-222). */
export const TYPE_GROUPS = [["income", "expense", "refund"], GOAL_TYPES] as const;

export function isGoalType(type: TxnType): boolean {
	return (GOAL_TYPES as readonly TxnType[]).includes(type);
}

/** Every category key: the expense list, then the income list (CAT-2, CAT-3). */
export const CATEGORY_KEYS = [...EXPENSE_CATEGORIES, ...INCOME_CATEGORIES] as const;

/** The categories a type takes (TXN-3): income categories for income, expense categories for
 * expenses and refunds, none for Goal types. */
export function categoriesFor(type: TxnType): readonly CategoryKey[] {
	if (type === "income") return INCOME_CATEGORIES;
	if (type === "expense" || type === "refund") return EXPENSE_CATEGORIES;
	return [];
}

/** Where a Transaction came from (TXN-8). */
export const SOURCES = ["manual", "subscription"] as const;
export type Source = (typeof SOURCES)[number];

export const SORTS = ["date", "amount"] as const;
export type Sort = (typeof SORTS)[number];

export const DIRS = ["desc", "asc"] as const;
export type Dir = (typeof DIRS)[number];

/** How the list is grouped (BR-F03-55). */
export const GROUPS = ["day", "category", "payee", "none"] as const;
export type Group = (typeof GROUPS)[number];

/** Newest first (BR-F03-40). */
export const DEFAULT_SORT: Sort = "date";
export const DEFAULT_DIR: Dir = "desc";

/** Day grouping under the date sort, none under the amount sort (BR-F03-55). */
export function defaultGroup(sort: Sort): Group {
	return sort === "date" ? "day" : "none";
}

/** The date presets and their keys, in F03 section 3's order (D-227). */
export const DATE_PRESETS = [
	"all",
	"this_month",
	"last_month",
	"last_3_months",
	"year_to_date",
	"last_12_months",
	"custom",
] as const;
export type DatePreset = (typeof DATE_PRESETS)[number];

/** The presets that stand for a range of dates. */
export const RANGE_PRESETS = [
	"this_month",
	"last_month",
	"last_3_months",
	"year_to_date",
	"last_12_months",
] as const satisfies readonly DatePreset[];
export type RangePreset = (typeof RANGE_PRESETS)[number];

/** The URL's filter and list parameters, in their fixed order (BR-F03-33). */
export const FILTER_PARAMS = [
	"from",
	"to",
	"type",
	"cat",
	"goal",
	"sub",
	"src",
	"min",
	"max",
	"q",
	"sort",
	"dir",
	"group",
] as const;
export type FilterParam = (typeof FILTER_PARAMS)[number];

/** Rows per page, and the most a request may ask for (BR-F03-30, API-7). */
export const PAGE_SIZE = 50;
export const MAX_LIMIT = 100;
