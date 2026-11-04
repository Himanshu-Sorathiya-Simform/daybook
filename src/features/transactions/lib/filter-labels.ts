import { categoryLabel } from "@/lib/categories";
import type { CurrencyCode } from "@/lib/currency";
import { formatShortDate } from "@/lib/date-format";
import { formatMoneyShort } from "@/lib/money";
import type { DatePreset, Source, TxnType } from "@/lib/transactions/model";
import { presetOf } from "@/lib/transactions/presets";
import type { TransactionFilter } from "@/lib/transactions/url";

import type { AmountBounds, QuickRange } from "./quick-ranges";

/** What filter labels need from the profile: its today (TIME-5) and its formats. */
export type FilterLocale = {
	today: string;
	dateLocale: string;
	numberLocale: string;
	currency: CurrencyCode;
};

/** The types the Type filter offers. Until M2 brings Goals, it hides To Goal and From Goal
 * (F03 section 2). */
export const FILTER_TYPES = [
	"expense",
	"income",
	"refund",
] as const satisfies readonly TxnType[];

export const TYPE_LABELS: Record<TxnType, string> = {
	expense: "Expense",
	income: "Income",
	refund: "Refund",
	goal_contribution: "To Goal",
	goal_withdrawal: "From Goal",
};

/** The date presets' names (F03 section 3). */
export const PRESET_LABELS: Record<DatePreset, string> = {
	all: "All time",
	this_month: "This month",
	last_month: "Last month",
	last_3_months: "Last 3 months",
	year_to_date: "Year to date",
	last_12_months: "Last 12 months",
	custom: "Custom range",
};

/** The More control's sources (BR-F03-39). */
export const SOURCE_LABELS: Record<Source | "any", string> = {
	any: "Any source",
	manual: "Added by you",
	subscription: "Subscription charges",
};

/** The filter's date preset on the profile's today: `all` without dates, `custom` for dates no
 * preset has today (D-227). */
export function presetOfFilter(
	filter: TransactionFilter,
	today: string,
): DatePreset {
	return presetOf(filter.from, filter.to, today);
}

/** The date filter as words: a preset's name, or "5 Oct to 20 Oct" for a custom range in F02's
 * short date (BR-F03-39). */
export function dateLabel(filter: TransactionFilter, locale: FilterLocale): string {
	const preset = presetOfFilter(filter, locale.today);
	if (preset !== "custom") return PRESET_LABELS[preset];
	const short = (date: string) => formatShortDate(date, locale);
	return `${short(filter.from!)} to ${short(filter.to!)}`;
}

/** Whether two sets of bounds are the same range. */
export function sameBounds(a: AmountBounds, b: AmountBounds): boolean {
	return a.minMinor === b.minMinor && a.maxMinor === b.maxMinor;
}

/** A quick range's name (BR-F03-74): "Under ₹400", "₹400 to ₹800", "₹2,500 and over". Each
 * names the edges, so a range up to 799.99 reads "to ₹800". */
export function quickRangeLabel(
	{ minMinor, maxMinor }: AmountBounds,
	{ currency, numberLocale }: FilterLocale,
): string {
	const money = (minor: number) => formatMoneyShort(minor, currency, numberLocale);
	if (minMinor === undefined) return `Under ${money(maxMinor! + 1)}`;
	if (maxMinor === undefined) return `${money(minMinor)} and over`;
	return `${money(minMinor)} to ${money(maxMinor + 1)}`;
}

/** The amount filter as words (BR-F03-39): a quick range's own name when the bounds are one,
 * otherwise "₹1,000 to ₹2,500", "From ₹1,000" or "Up to ₹2,500"; `null` without bounds. */
export function amountLabel(
	bounds: AmountBounds,
	locale: FilterLocale,
	quick: readonly QuickRange[] = [],
): string | null {
	const { minMinor, maxMinor } = bounds;
	if (minMinor === undefined && maxMinor === undefined) return null;
	if (quick.some((range) => sameBounds(range, bounds))) {
		return quickRangeLabel(bounds, locale);
	}
	const money = (minor: number) =>
		formatMoneyShort(minor, locale.currency, locale.numberLocale);
	if (minMinor === undefined) return `Up to ${money(maxMinor!)}`;
	if (maxMinor === undefined) return `From ${money(minMinor)}`;
	return `${money(minMinor)} to ${money(maxMinor)}`;
}

/** A choice list's value on its trigger: "Any" with nothing chosen, the label of one, or how
 * many are chosen. */
export function choiceSummary<T extends string>(
	chosen: readonly T[] | undefined,
	label: (value: T) => string,
): string {
	if (!chosen || chosen.length === 0) return "Any";
	return chosen.length === 1 ? label(chosen[0]!) : String(chosen.length);
}

export type ActiveChip = {
	id: string;
	label: string;
	/** The filter with this one removed. */
	without: TransactionFilter;
};

/** The filter without some of its fields. */
export function omitFields(
	filter: TransactionFilter,
	...keys: (keyof TransactionFilter)[]
): TransactionFilter {
	const rest = { ...filter };
	for (const key of keys) delete rest[key];
	return rest;
}

/** The filter with one value taken out of a list, dropping the list when it empties. */
function withoutValue<K extends "type" | "cat">(
	filter: TransactionFilter,
	key: K,
	value: string,
): TransactionFilter {
	const left = (filter[key] as string[]).filter((other) => other !== value);
	return left.length ? { ...filter, [key]: left } : omitFields(filter, key);
}

/** Every active filter as a removable chip (BR-F03-39), in the order of the controls: the
 * date, each type, each category, the amount, the source, a Subscription or a Goal, and the
 * search. Until F05 and F06 bring their names, a Subscription's chip reads "Subscription
 * charges" and a Goal's "Goal" (D-541). */
export function activeChips(
	filter: TransactionFilter,
	locale: FilterLocale,
	quick: readonly QuickRange[] = [],
): ActiveChip[] {
	const chips: ActiveChip[] = [];
	const add = (id: string, label: string, without: TransactionFilter) =>
		chips.push({ id, label, without });

	if (filter.from !== undefined) {
		add("date", dateLabel(filter, locale), omitFields(filter, "from", "to"));
	}
	for (const type of filter.type ?? []) {
		add(`type:${type}`, TYPE_LABELS[type], withoutValue(filter, "type", type));
	}
	for (const category of filter.cat ?? []) {
		add(
			`cat:${category}`,
			categoryLabel(category),
			withoutValue(filter, "cat", category),
		);
	}
	const amount = amountLabel(filter, locale, quick);
	if (amount !== null)
		add("amount", amount, omitFields(filter, "minMinor", "maxMinor"));
	if (filter.src !== undefined) {
		add("src", SOURCE_LABELS[filter.src], omitFields(filter, "src"));
	}
	if (filter.sub !== undefined) {
		add("sub", SOURCE_LABELS.subscription, omitFields(filter, "sub"));
	}
	if (filter.goal !== undefined) add("goal", "Goal", omitFields(filter, "goal"));
	if (filter.q !== undefined) add("q", `“${filter.q}”`, omitFields(filter, "q"));
	return chips;
}
