import { z } from "zod";

import { CURRENCY_EXPONENTS, maxMinor, type CurrencyCode } from "@/lib/currency";
import { isUuid, isUuidV7 } from "@/lib/ids";
import { textSchema } from "@/lib/text";
import { isIsoDate } from "@/lib/time";

import {
	CATEGORY_KEYS,
	DIRS,
	GROUPS,
	RANGE_PRESETS,
	SORTS,
	SOURCES,
	TXN_TYPES,
	type Dir,
	type Group,
	type RangePreset,
	type Sort,
} from "./model";
import { presetOf, presetRange } from "./presets";
import { TRANSACTION_MESSAGES, largestAmountMessage } from "./schemas";
import {
	checkQuery,
	writeFilterQuery,
	type ListParams,
	type TransactionFilter,
} from "./url";

/** A saved view's filter (F03 section 3): the filter object with a date preset stored by its
 * key in `range`, or explicit custom dates, or neither for all time (D-453). */
export type ViewFilter = TransactionFilter & { range?: RangePreset };

/** A saved Transactions view, as the API returns it (D-452). */
export type SavedView = {
	id: string;
	name: string;
	filter: ViewFilter;
	sort: Sort;
	dir: Dir;
	group: Group;
	version: number;
	createdAt: string;
	updatedAt: string;
};

/** The built-in view: defined in code, never stored, renamed, updated or deleted (BR-F03-63). */
export const ALL_TRANSACTIONS = {
	id: "all",
	name: "All Transactions",
	filter: {} as ViewFilter,
	sort: "date" as Sort,
	dir: "desc" as Dir,
	group: "day" as Group,
} as const;

/** Saved views per user, beside All Transactions (BR-F03-63). */
export const VIEW_LIMIT = 20;
const NAME_MAX = 40;

/** F03 section 8's view messages, and the API-only ones. */
export const VIEW_MESSAGES = {
	nameRequired: "Enter a name.",
	nameTaken: "You already have a view with this name.",
	limit: "You have 20 views. Delete one to save another.",
	range: "Use a preset other than All time or Custom.",
	rangeAndDates: "Send a preset or dates, not both.",
	dates: "Send both dates, the first on or before the second.",
	date: TRANSACTION_MESSAGES.date,
	type: TRANSACTION_MESSAGES.typeRequired,
	category: TRANSACTION_MESSAGES.categoryRequired,
	uuid: "Use a UUID.",
	source: "Choose a source.",
	minAboveMax: "The lowest amount can't be above the highest.",
	queryShort: "Type at least 3 characters, or an amount.",
	queryLong: "Use 100 characters or fewer.",
	queryCharacters: "Remove unsupported characters.",
	sort: "Choose a sort.",
	dir: "Choose a direction.",
	group: "Choose a grouping.",
	dayNeedsDateSort: "Day grouping needs the date sort.",
	listTogether: "Send the filter, sort, direction and group together.",
	nothingToChange: TRANSACTION_MESSAGES.nothingToChange,
	currency: TRANSACTION_MESSAGES.currency,
	currencyWithAmount: TRANSACTION_MESSAGES.currencyWithAmount,
} as const;

const V = VIEW_MESSAGES;
const BUILT_IN = ALL_TRANSACTIONS.name.toLowerCase();
const CURRENCIES = Object.keys(CURRENCY_EXPONENTS) as CurrencyCode[];

const QUERY_MESSAGES = {
	characters: V.queryCharacters,
	too_long: V.queryLong,
	too_short: V.queryShort,
} as const;

function sortedUnique<T extends string>(items: readonly T[]): T[] {
	return [...new Set(items)].sort();
}

/** The keys of a view filter after its dates, in the URL's order. */
const OTHER_KEYS = [
	"type",
	"cat",
	"goal",
	"sub",
	"src",
	"minMinor",
	"maxMinor",
	"q",
] as const;

/** Copies the filter fields after the dates, in order, leaving out absent fields and empty lists. */
function copyRest(
	source: { [K in keyof TransactionFilter]?: TransactionFilter[K] | undefined },
	target: TransactionFilter,
) {
	for (const key of OTHER_KEYS) {
		const value = source[key];
		if (value === undefined || (Array.isArray(value) && value.length === 0))
			continue;
		Object.assign(target, { [key]: value });
	}
}

/**
 * A view's filter (BR-F03-64), checked by the URL's rules but refused instead of dropped, with
 * the field path. `currency` is the profile's: it bounds amounts and decides whether a short
 * search is an amount. Lists are stored sorted and deduplicated, an empty list or blank search
 * as absent, and ids in lowercase.
 */
export function viewFilterSchema(currency: CurrencyCode) {
	const list = <T extends string>(values: readonly T[], message: string) =>
		z
			.array(z.enum(values as [T, ...T[]], { error: message }), {
				error: message,
			})
			.transform(sortedUnique);
	const uuid = z
		.string({ error: V.uuid })
		.refine(isUuid, { error: V.uuid })
		.transform((value) => value.toLowerCase());
	const amount = z
		.number({ error: TRANSACTION_MESSAGES.amountWhole })
		.int({ error: TRANSACTION_MESSAGES.amountWhole })
		.min(1, { error: TRANSACTION_MESSAGES.amountZero })
		.max(maxMinor(currency), { error: largestAmountMessage(currency) });
	const date = z.string({ error: V.date }).refine(isIsoDate, { error: V.date });
	const query = z.string({ error: V.queryCharacters }).transform((raw, ctx) => {
		const checked = checkQuery(raw, currency);
		if (checked.ok) return checked.q;
		ctx.addIssue({ code: "custom", message: QUERY_MESSAGES[checked.reason] });
		return z.NEVER;
	});

	return z
		.strictObject({
			range: z.enum(RANGE_PRESETS, { error: V.range }).optional(),
			from: date.optional(),
			to: date.optional(),
			type: list(TXN_TYPES, V.type).optional(),
			cat: list(CATEGORY_KEYS, V.category).optional(),
			goal: uuid.optional(),
			sub: uuid.optional(),
			src: z.enum(SOURCES, { error: V.source }).optional(),
			minMinor: amount.optional(),
			maxMinor: amount.optional(),
			q: query.optional(),
		})
		.superRefine((filter, ctx) => {
			// Object checks run even when a field failed, so each reads only fields that passed.
			const { range, from, to, minMinor, maxMinor } = filter;
			if (range !== undefined && (from !== undefined || to !== undefined)) {
				ctx.addIssue({
					code: "custom",
					message: V.rangeAndDates,
					path: ["range"],
				});
			} else if ((from === undefined) !== (to === undefined)) {
				ctx.addIssue({ code: "custom", message: V.dates, path: ["from"] });
			} else if (
				from !== undefined
				&& to !== undefined
				&& isIsoDate(from)
				&& isIsoDate(to)
				&& from > to
			) {
				ctx.addIssue({ code: "custom", message: V.dates, path: ["from"] });
			}
			if (
				Number.isSafeInteger(minMinor)
				&& Number.isSafeInteger(maxMinor)
				&& (minMinor as number) > (maxMinor as number)
			) {
				ctx.addIssue({
					code: "custom",
					message: V.minAboveMax,
					path: ["minMinor"],
				});
			}
		})
		.transform((filter): ViewFilter => {
			const view: ViewFilter = {};
			if (filter.range !== undefined) view.range = filter.range;
			if (filter.from !== undefined && filter.to !== undefined) {
				view.from = filter.from;
				view.to = filter.to;
			}
			copyRest(filter, view);
			return view;
		});
}

const name = textSchema({
	max: NAME_MAX,
	messages: { required: V.nameRequired },
}).refine((value) => typeof value !== "string" || value.toLowerCase() !== BUILT_IN, {
	error: V.nameTaken,
});
const sort = z.enum(SORTS, { error: V.sort });
const dir = z.enum(DIRS, { error: V.dir });
const group = z.enum(GROUPS, { error: V.group });
const viewCurrency = z.enum(CURRENCIES, { error: V.currency });

type ListBody = {
	filter?: ViewFilter | undefined;
	sort?: Sort | undefined;
	group?: Group | undefined;
	currency?: CurrencyCode | undefined;
};

/** Day grouping needs the date sort (BR-F03-55), and amounts bring the currency (BR-F03-64). */
function checkList<T extends ListBody>(body: T, ctx: z.RefinementCtx<T>) {
	if (body.sort === "amount" && body.group === "day") {
		ctx.addIssue({
			code: "custom",
			message: V.dayNeedsDateSort,
			path: ["group"],
		});
	}
	const filter = body.filter;
	const hasAmount =
		typeof filter === "object"
		&& (filter.minMinor !== undefined || filter.maxMinor !== undefined);
	if (hasAmount && body.currency === undefined) {
		ctx.addIssue({
			code: "custom",
			message: V.currencyWithAmount,
			path: ["currency"],
		});
	}
}

/** `POST /api/transaction-views` for a profile in `currency` (F03 section 11). The name's
 * uniqueness, the limit of 20 and the currency match need the database (BR-F03-63). */
export function viewCreateSchema(currency: CurrencyCode) {
	return z
		.strictObject({
			id: z
				.string({ error: TRANSACTION_MESSAGES.id })
				.refine(isUuidV7, { error: TRANSACTION_MESSAGES.id })
				.transform((value) => value.toLowerCase()),
			name,
			filter: viewFilterSchema(currency),
			sort,
			dir,
			group,
			currency: viewCurrency.optional(),
		})
		.superRefine(checkList);
}

/** `PATCH /api/transaction-views/[id]`: a name, or the filter, sort, direction and group
 * together, or both; never part of the four and never nothing (BR-F03-68). */
export function viewEditSchema(currency: CurrencyCode) {
	return z
		.strictObject({
			name: name.optional(),
			filter: viewFilterSchema(currency).optional(),
			sort: sort.optional(),
			dir: dir.optional(),
			group: group.optional(),
			currency: viewCurrency.optional(),
		})
		.superRefine((body, ctx) => {
			const sent = [body.filter, body.sort, body.dir, body.group].filter(
				(value) => value !== undefined,
			).length;
			if (body.name === undefined && sent === 0) {
				ctx.addIssue({
					code: "custom",
					message: V.nothingToChange,
					path: [],
				});
			} else if (sent > 0 && sent < 4) {
				ctx.addIssue({ code: "custom", message: V.listTogether, path: [] });
			} else if (sent === 4) {
				checkList(body, ctx);
			}
		});
}

/** `DELETE /api/transaction-views/[id]`: an empty body; any field is refused. */
export const viewDeleteSchema = z.strictObject({});

/** The filter as a view stores it: dates equal to a preset's dates for `today` become that
 * preset (D-453), other dates stay as they are, and all time stores neither. */
export function toViewFilter(filter: TransactionFilter, today: string): ViewFilter {
	const { from, to } = filter;
	const preset = presetOf(from, to, today);
	const view: ViewFilter = {};
	if (preset !== "all" && preset !== "custom") view.range = preset;
	else if (from !== undefined && to !== undefined) {
		view.from = from;
		view.to = to;
	}
	copyRest(filter, view);
	return view;
}

/** A view's filter as the URL's filter: a preset becomes its explicit dates for `today`
 * (BR-F03-65), so "Last month" always shows the month before the current one. */
export function fromViewFilter(view: ViewFilter, today: string): TransactionFilter {
	const dates = view.range ? presetRange(view.range, today) : view;
	const filter: TransactionFilter = {};
	if (dates.from !== undefined && dates.to !== undefined) {
		filter.from = dates.from;
		filter.to = dates.to;
	}
	copyRest(view, filter);
	return filter;
}

/**
 * Whether the URL's filter and list differ from the view, with the view's preset resolved for
 * `today` (BR-F03-66). Both sides are compared as normalized URLs, so the same filter written
 * another way is not an edit.
 */
export function isEdited(
	view: { filter: ViewFilter; sort: Sort; dir: Dir; group: Group },
	current: { filter: TransactionFilter; list: ListParams },
	{ today, currency }: { today: string; currency: CurrencyCode },
): boolean {
	const saved = writeFilterQuery(
		fromViewFilter(view.filter, today),
		{ sort: view.sort, dir: view.dir, group: view.group },
		{ currency },
	);
	return saved !== writeFilterQuery(current.filter, current.list, { currency });
}

/** The first `length` code points of `text`, without a trailing comma or space. */
function cut(text: string, length: number): string {
	return [...text]
		.slice(0, length)
		.join("")
		.replace(/[\s,]+$/, "");
}

/**
 * A new view's name (BR-F03-67): the active filter chips' labels joined by ", ", or "My view"
 * with none. A taken name, compared without case and including "All Transactions", gets
 * " 2", " 3" and so on, the first free one. The whole name fits 40 characters.
 */
export function viewName(
	chipLabels: readonly string[],
	takenNames: readonly string[],
): string {
	const taken = new Set([
		BUILT_IN,
		...takenNames.map((taken) => taken.toLowerCase()),
	]);
	const base = chipLabels.join(", ") || "My view";
	const plain = cut(base, NAME_MAX);
	if (!taken.has(plain.toLowerCase())) return plain;
	for (let n = 2; ; n++) {
		const suffix = ` ${n}`;
		const candidate = `${cut(base, NAME_MAX - suffix.length)}${suffix}`;
		if (!taken.has(candidate.toLowerCase())) return candidate;
	}
}
