import { parseNumericQuery, parseUrlAmount, writeUrlAmount } from "@/lib/amount";
import type { CategoryKey } from "@/lib/categories";
import type { CurrencyCode } from "@/lib/currency";
import { codePointLength, normalizeText } from "@/lib/text";
import { isIsoDate } from "@/lib/time";

import {
	CATEGORY_KEYS,
	DEFAULT_DIR,
	DEFAULT_SORT,
	DIRS,
	FILTER_PARAMS,
	GROUPS,
	SORTS,
	SOURCES,
	TXN_TYPES,
	defaultGroup,
	type Dir,
	type FilterParam,
	type Group,
	type Sort,
	type Source,
	type TxnType,
} from "./model";

/** The filter object (root 6.9) with amounts in minor units. Absent fields filter nothing. */
export type TransactionFilter = {
	from?: string;
	to?: string;
	type?: TxnType[];
	cat?: CategoryKey[];
	goal?: string;
	sub?: string;
	src?: Source;
	minMinor?: number;
	maxMinor?: number;
	q?: string;
};

/** The list parameters, which shape the list but select no rows (F03 section 3). */
export type ListParams = { sort: Sort; dir: Dir; group: Group };

export type ReadFilter = {
	filter: TransactionFilter;
	list: ListParams;
	/** Parameters that were present but invalid, in the URL's fixed order. A page drops them
	 * with the notice (FIL-5); an API route answers 400 (D-457). */
	invalid: FilterParam[];
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const Q_MIN = 3;
const Q_MAX = 100;

function oneOf<T extends string>(allowed: readonly T[], value: string): value is T {
	return (allowed as readonly string[]).includes(value);
}

/** A comma list sorted and deduplicated, so equivalent lists compare equal. */
function sortedUnique<T extends string>(items: readonly T[]): T[] {
	return [...new Set(items)].sort();
}

/**
 * Reads the filter and list parameters of a URL, normalized (BR-F03-33), and names the ones
 * that are invalid (BR-F03-34). Unknown names, `txn`, `new` and `view` included, are not this
 * reader's and are ignored. An empty value counts as absent; a repeated name is invalid
 * (D-458). The filter's keys follow the URL's order, so equal filters are equal objects.
 */
export function readFilterParams(
	params: URLSearchParams,
	{ currency }: { currency: CurrencyCode },
): ReadFilter {
	const invalid = new Set<FilterParam>();
	const drop = (name: FilterParam) => {
		invalid.add(name);
		return undefined;
	};
	const one = (name: FilterParam): string | undefined => {
		const values = params.getAll(name);
		if (values.length > 1) return drop(name);
		return values[0] === "" ? undefined : values[0];
	};
	const list = <T extends string>(name: FilterParam, allowed: readonly T[]) => {
		const raw = one(name);
		if (raw === undefined) return undefined;
		const items = raw.split(",").filter((item) => item !== "");
		if (!items.every((item) => oneOf(allowed, item))) return drop(name);
		return items.length === 0 ? undefined : sortedUnique(items as T[]);
	};
	const value = <T>(name: FilterParam, check: (raw: string) => T | null) => {
		const raw = one(name);
		if (raw === undefined) return undefined;
		return check(raw) ?? drop(name);
	};

	// A range needs both ends, in order (D-458, BR-F03-34). Otherwise every end given is dropped.
	let from = value("from", (raw) => (isIsoDate(raw) ? raw : null));
	let to = value("to", (raw) => (isIsoDate(raw) ? raw : null));
	if (from === undefined || to === undefined || from > to) {
		if (from !== undefined) from = drop("from");
		if (to !== undefined) to = drop("to");
	}

	const type = list("type", TXN_TYPES);
	const cat = list("cat", CATEGORY_KEYS);
	const uuid = (raw: string) => (UUID.test(raw) ? raw.toLowerCase() : null);
	const goal = value("goal", uuid);
	const sub = value("sub", uuid);
	const src = value("src", (raw) => (oneOf(SOURCES, raw) ? raw : null));
	let minMinor = value("min", (raw) => parseUrlAmount(raw, currency));
	let maxMinor = value("max", (raw) => parseUrlAmount(raw, currency));
	if (minMinor !== undefined && maxMinor !== undefined && minMinor > maxMinor) {
		minMinor = drop("min");
		maxMinor = drop("max");
	}
	const q = readQuery(one("q"), currency);
	if (q === null) drop("q");

	const sort =
		value("sort", (raw) => (oneOf(SORTS, raw) ? raw : null)) ?? DEFAULT_SORT;
	const dir =
		value("dir", (raw) => (oneOf(DIRS, raw) ? raw : null)) ?? DEFAULT_DIR;
	// Day grouping needs the date sort (BR-F03-55).
	const group =
		value("group", (raw) =>
			oneOf(GROUPS, raw) && !(raw === "day" && sort === "amount") ? raw : null,
		) ?? defaultGroup(sort);

	const filter: TransactionFilter = {};
	if (from !== undefined && to !== undefined) {
		filter.from = from;
		filter.to = to;
	}
	if (type) filter.type = type;
	if (cat) filter.cat = cat;
	if (goal) filter.goal = goal;
	if (sub) filter.sub = sub;
	if (src) filter.src = src;
	if (minMinor !== undefined) filter.minMinor = minMinor;
	if (maxMinor !== undefined) filter.maxMinor = maxMinor;
	if (typeof q === "string") filter.q = q;

	return {
		filter,
		list: { sort, dir, group },
		invalid: FILTER_PARAMS.filter((name) => invalid.has(name)),
	};
}

/** The search text, trimmed and in NFC (root 6.7), `undefined` when absent, or `null` when
 * invalid: control characters, over 100 characters, or under 3 unless numeric (BR-F03-34). */
function readQuery(
	raw: string | undefined,
	currency: CurrencyCode,
): string | null | undefined {
	if (raw === undefined) return undefined;
	const normalized = normalizeText(raw);
	if (!normalized.ok) return null;
	const q = normalized.value;
	if (q === "") return undefined;
	const length = codePointLength(q);
	if (length > Q_MAX) return null;
	if (length < Q_MIN && parseNumericQuery(q, currency) === null) return null;
	return q;
}

/**
 * The URL query for a filter and list, without `?`: parameters in the fixed order, lists
 * sorted and deduplicated with literal commas, amounts with the currency's full decimals, and
 * defaults omitted (BR-F03-33, D-458).
 */
export function writeFilterQuery(
	filter: TransactionFilter,
	{ sort, dir, group }: ListParams,
	{ currency }: { currency: CurrencyCode },
): string {
	const pairs: [FilterParam, string][] = [];
	const add = (name: FilterParam, value: string | undefined) => {
		if (value !== undefined && value !== "") pairs.push([name, value]);
	};
	const items = (values: readonly string[] | undefined) =>
		values && sortedUnique(values).map(encodeURIComponent).join(",");
	const amount = (minor: number | undefined) =>
		minor === undefined ? undefined : writeUrlAmount(minor, currency);

	add("from", filter.from);
	add("to", filter.to);
	add("type", items(filter.type));
	add("cat", items(filter.cat));
	add("goal", filter.goal);
	add("sub", filter.sub);
	add("src", filter.src);
	add("min", amount(filter.minMinor));
	add("max", amount(filter.maxMinor));
	add("q", filter.q === undefined ? undefined : encodeURIComponent(filter.q));
	if (sort !== DEFAULT_SORT) add("sort", sort);
	if (dir !== DEFAULT_DIR) add("dir", dir);
	if (group !== defaultGroup(sort)) add("group", group);

	return pairs.map(([name, value]) => `${name}=${value}`).join("&");
}
