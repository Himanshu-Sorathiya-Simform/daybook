import { parseNumericQuery, parseUrlAmount, writeUrlAmount } from "@/lib/amount";
import type { CategoryKey } from "@/lib/categories";
import type { CurrencyCode } from "@/lib/currency";
import { codePointLength, normalizeText } from "@/lib/text";
import { isUuid } from "@/lib/ids";
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

const Q_MIN = 3;
const Q_MAX = 100;

function oneOf<T extends string>(allowed: readonly T[], value: string): value is T {
	return (allowed as readonly string[]).includes(value);
}

/** A comma list sorted by UTF-16 code unit, which is what `sort()` does and never varies with
 * the locale, and deduplicated, so equivalent lists compare equal. */
export function sortedUnique<T extends string>(items: readonly T[]): T[] {
	return [...new Set(items)].sort((a, b) => {
		if (a < b) return -1;
		return a > b ? 1 : 0;
	});
}

type Reader = ReturnType<typeof createReader>;

/** Reads single parameters of a URL and records the invalid ones. */
function createReader(params: URLSearchParams) {
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
	const items = <T extends string>(name: FilterParam, allowed: readonly T[]) => {
		const raw = one(name);
		if (raw === undefined) return undefined;
		const parts = raw.split(",").filter((item) => item !== "");
		if (!parts.every((item) => oneOf(allowed, item))) return drop(name);
		return parts.length === 0 ? undefined : sortedUnique(parts as T[]);
	};
	const value = <T>(name: FilterParam, check: (raw: string) => T | null) => {
		const raw = one(name);
		if (raw === undefined) return undefined;
		return check(raw) ?? drop(name);
	};
	return { invalid, drop, one, items, value };
}

/** A range needs both ends, in order (D-458, BR-F03-34). Otherwise every end given is dropped. */
function readRange({
	value,
	drop,
}: Reader): { from: string; to: string } | undefined {
	const date = (raw: string) => (isIsoDate(raw) ? raw : null);
	const from = value("from", date);
	const to = value("to", date);
	if (from !== undefined && to !== undefined && from <= to) return { from, to };
	if (from !== undefined) drop("from");
	if (to !== undefined) drop("to");
	return undefined;
}

/** The amount bounds in minor units. A bound pair out of order is dropped together. */
function readAmounts(
	{ value, drop }: Reader,
	currency: CurrencyCode,
): { minMinor: number | undefined; maxMinor: number | undefined } {
	const minMinor = value("min", (raw) => parseUrlAmount(raw, currency));
	const maxMinor = value("max", (raw) => parseUrlAmount(raw, currency));
	if (minMinor !== undefined && maxMinor !== undefined && minMinor > maxMinor) {
		drop("min");
		drop("max");
		return { minMinor: undefined, maxMinor: undefined };
	}
	return { minMinor, maxMinor };
}

function readListParams({ value }: Reader): ListParams {
	const sort =
		value("sort", (raw) => (oneOf(SORTS, raw) ? raw : null)) ?? DEFAULT_SORT;
	const dir =
		value("dir", (raw) => (oneOf(DIRS, raw) ? raw : null)) ?? DEFAULT_DIR;
	// Day grouping needs the date sort (BR-F03-55).
	const group =
		value("group", (raw) =>
			oneOf(GROUPS, raw) && !(raw === "day" && sort === "amount") ? raw : null,
		) ?? defaultGroup(sort);
	return { sort, dir, group };
}

type FilterParts = {
	range: { from: string; to: string } | undefined;
} & {
	[K in Exclude<keyof TransactionFilter, "from" | "to">]:
		TransactionFilter[K] | undefined;
};

/** The filter object from what was read, with the keys in the URL's order and absent fields
 * left out. */
function assembleFilter(parts: FilterParts): TransactionFilter {
	const { range, type, cat, goal, sub, src, minMinor, maxMinor, q } = parts;
	const filter: TransactionFilter = {};
	if (range) {
		filter.from = range.from;
		filter.to = range.to;
	}
	if (type) filter.type = type;
	if (cat) filter.cat = cat;
	if (goal) filter.goal = goal;
	if (sub) filter.sub = sub;
	if (src) filter.src = src;
	if (minMinor !== undefined) filter.minMinor = minMinor;
	if (maxMinor !== undefined) filter.maxMinor = maxMinor;
	if (typeof q === "string") filter.q = q;
	return filter;
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
	const reader = createReader(params);
	const { invalid, drop, one, items, value } = reader;

	const uuid = (raw: string) => (isUuid(raw) ? raw.toLowerCase() : null);
	const query = checkQuery(one("q"), currency);
	const filter = assembleFilter({
		range: readRange(reader),
		type: items("type", TXN_TYPES),
		cat: items("cat", CATEGORY_KEYS),
		goal: value("goal", uuid),
		sub: value("sub", uuid),
		src: value("src", (raw) => (oneOf(SOURCES, raw) ? raw : null)),
		...readAmounts(reader, currency),
		q: query.ok ? query.q : drop("q"),
	});

	return {
		filter,
		list: readListParams(reader),
		invalid: FILTER_PARAMS.filter((name) => invalid.has(name)),
	};
}

export type QueryCheck =
	| { ok: true; q: string | undefined }
	| { ok: false; reason: "characters" | "too_long" | "too_short" };

/** The search text, trimmed and in NFC (root 6.7), or `undefined` when absent or blank. It is
 * refused for control characters, over 100 characters, or under 3 unless numeric
 * (BR-F03-34); `reason` says which, for a saved view's message (BR-F03-64). */
export function checkQuery(
	raw: string | undefined,
	currency: CurrencyCode,
): QueryCheck {
	if (raw === undefined) return { ok: true, q: undefined };
	const normalized = normalizeText(raw);
	if (!normalized.ok) return { ok: false, reason: "characters" };
	const q = normalized.value;
	if (q === "") return { ok: true, q: undefined };
	const length = codePointLength(q);
	if (length > Q_MAX) return { ok: false, reason: "too_long" };
	if (length < Q_MIN && parseNumericQuery(q, currency) === null) {
		return { ok: false, reason: "too_short" };
	}
	return { ok: true, q };
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
