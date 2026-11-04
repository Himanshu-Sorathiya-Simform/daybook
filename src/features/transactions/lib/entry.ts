import type { z } from "zod";

import { amountMessage, formatAmountInput, parseAmount } from "@/lib/amount";
import type { CategoryKey } from "@/lib/categories";
import type { CurrencyCode } from "@/lib/currency";
import { formatDayHeader, formatShortDate } from "@/lib/date-format";
import { uuidV7 } from "@/lib/ids";
import { codePointLength, optionalTextSchema, textSchema } from "@/lib/text";
import { shiftDays, todayIn } from "@/lib/time";
import { categoriesFor } from "@/lib/transactions/model";
import { localTime, toOccurred } from "@/lib/transactions/occurred";
import {
	TRANSACTION_MESSAGES,
	type TransactionCreateInput,
} from "@/lib/transactions/schemas";
import type { DialogField } from "./write-errors";

/** The types a new Transaction can take at M1; To Goal and From Goal wait for M2 (D-241). */
export const ENTRY_TYPES = [
	{ value: "expense", label: "Expense" },
	{ value: "income", label: "Income" },
	{ value: "refund", label: "Refund" },
] as const;

export type EntryType = (typeof ENTRY_TYPES)[number]["value"];

/** The entry dialog's values as the user types them: the amount as text in their own format,
 * the date as `YYYY-MM-DD` and the time as `HH:mm` in the profile zone. */
export type EntryValues = {
	type: EntryType;
	amount: string;
	payee: string;
	category: CategoryKey | null;
	date: string;
	/** `null` once every part of the time field is cleared. */
	time: string | null;
	description: string;
	note: string;
};

export type EntryField = keyof EntryValues;

/** The profile's formats and zone, which the dialog reads and writes in (BR-F02-18). */
export type EntryLocale = {
	currency: CurrencyCode;
	numberLocale: string;
	dateLocale: string;
	timezone: string;
};

/** The entry window's ends on `today`: today and the 10 days before (BR-F03-08, TIME-7). */
export const WINDOW_DAYS = 10;

/** F03 section 8's entry dialog messages that the page writes itself. */
export const ENTRY_TEXT = {
	newTitle: "New Transaction",
	saved: "Transaction saved.",
	hidden: "Saved. It's hidden by your filters.",
	show: "Show",
	offline: "You are offline. Connect to save.",
	timeRequired: "Enter a time.",
	dateHint: "Today or one of the 10 days before.",
	calendarNote:
		"You can choose today or one of the 10 days before. Arrow keys move, Enter picks.",
	descriptionHint: "Shown under the payee in your list.",
	noteHint: "Only shown in the details. Line breaks are fine.",
	listHint: "Up and down to choose · Enter to select · Esc to close",
	discardTitle: "Discard changes?",
	discardBody: "What you've typed here won't be saved.",
} as const;

const M = TRANSACTION_MESSAGES;

/** A refused text's message; a refusal always carries one. */
const messageOf = (error: z.ZodError): string => error.issues[0]?.message ?? "";

/** A new Transaction's values (BR-F03-07): an expense on today's date at the current time,
 * rounded down to the minute, in the profile zone, with no category. */
export function startValues(timezone: string, now: Date): EntryValues {
	return {
		type: "expense",
		amount: "",
		payee: "",
		category: null,
		date: todayIn(timezone, now),
		time: localTime(now.toISOString(), timezone),
		description: "",
		note: "",
	};
}

/** After "Save and add another" (BR-F03-21): the type, date and time stay, the rest empties. */
export function nextValues(saved: EntryValues): EntryValues {
	return {
		...saved,
		amount: "",
		payee: "",
		category: null,
		description: "",
		note: "",
	};
}

/** Whether any field differs from where it started, the date and time included (D-551). */
export function isChanged(values: EntryValues, start: EntryValues): boolean {
	return (Object.keys(start) as EntryField[]).some(
		(field) => values[field] !== start[field],
	);
}

/** The first day a new Transaction can take on `today` (BR-F03-08). */
export function windowStart(today: string): string {
	return shiftDays(today, -WINDOW_DAYS);
}

/** The date button's words (BR-F03-75): "Today, 2 Nov", "Yesterday, 1 Nov", or F02's day
 * format, "Sat, 31 Oct". */
export function entryDateLabel(
	date: string,
	locale: { today: string; dateLocale: string },
): string {
	if (date === locale.today) return `Today, ${formatShortDate(date, locale)}`;
	if (date === shiftDays(locale.today, -1)) {
		return `Yesterday, ${formatShortDate(date, locale)}`;
	}
	return formatDayHeader(date, locale);
}

/** How many category tiles show before "+ N more" (BR-F03-75). */
const TOP_TILES = 7;

export type CategoryTiles = {
	tiles: CategoryKey[];
	/** How many the collapsed tiles leave out: "+ 8 more". Zero when every category shows
	 * at once. */
	rest: number;
};

/**
 * The category tiles (BR-F03-75, D-550): the type's 7 most used categories in the order of
 * `/api/payees`'s `categories`, filled up in CAT order. Expanded, the rest follow in CAT
 * order, and a choice among them stays where it is. Collapsed, a chosen category outside the
 * 7 shows after them.
 */
export function categoryTiles(
	type: EntryType,
	used: readonly { key: CategoryKey }[] | undefined,
	chosen: CategoryKey | null,
	expanded: boolean,
): CategoryTiles {
	const all = categoriesFor(type);
	const fromUse = (used ?? [])
		.map(({ key }) => key)
		.filter((key) => all.includes(key));
	const top = [...fromUse, ...all.filter((key) => !fromUse.includes(key))].slice(
		0,
		TOP_TILES,
	);
	const rest = all.filter((key) => !top.includes(key));
	if (expanded) return { tiles: [...top, ...rest], rest: rest.length };
	const extra = chosen !== null && rest.includes(chosen) ? [chosen] : [];
	return { tiles: [...top, ...extra], rest: rest.length - extra.length };
}

/** A field's running count (BR-F03-48): the payee's from 61 code points, the description's
 * from 91, the note's always. */
export function counterOf(
	field: "payee" | "description" | "note",
	text: string,
): string | undefined {
	const length = codePointLength(text);
	const { max, from } = COUNTERS[field];
	return length >= from ? `${length} / ${max}` : undefined;
}

const COUNTERS = {
	payee: { max: 80, from: 61 },
	description: { max: 120, from: 91 },
	note: { max: 500, from: 0 },
} as const;

const payeeSchema = textSchema({
	max: COUNTERS.payee.max,
	messages: { required: M.payeeRequired },
});
const descriptionSchema = optionalTextSchema({ max: COUNTERS.description.max });
const noteSchema = optionalTextSchema({ max: COUNTERS.note.max, multiline: true });

/** The entry's checks: the messages under its fields, or the body's parts once none is left. */
export type EntryCheck =
	| { ok: false; fields: Partial<Record<EntryField, string>> }
	| {
			ok: true;
			amountMinor: number;
			payee: string;
			category: CategoryKey;
			time: string;
			description: string | null;
			note: string | null;
	  };

/**
 * Checks a new Transaction as F03 section 8 words it: the amount in the user's format
 * (BR-F03-04), the payee, a category of the type, the date in today's window and a time no later
 * than now, both in the profile zone at `now` (BR-F03-08, BR-F03-09, D-540, D-551), and the text
 * limits (BR-F03-12). Each field gets its first message.
 */
export function checkEntry(
	values: EntryValues,
	locale: EntryLocale,
	now: Date,
): EntryCheck {
	const fields: Partial<Record<EntryField, string>> = {};
	const amount = parseAmount(values.amount, locale);
	if (!amount.ok) fields.amount = amountMessage(amount.error, locale);
	const payee = payeeSchema.safeParse(values.payee);
	if (!payee.success) fields.payee = messageOf(payee.error);
	const { category } = values;
	if (category === null || !categoriesFor(values.type).includes(category)) {
		fields.category = M.categoryRequired;
	}
	const today = todayIn(locale.timezone, now);
	if (values.date < windowStart(today) || values.date > today) {
		fields.date = M.dateOutOfWindow;
	}
	const { time } = values;
	if (time === null) fields.time = ENTRY_TEXT.timeRequired;
	else if (
		values.date === today
		&& time > localTime(now.toISOString(), locale.timezone)
	) {
		fields.time = M.timeInFuture;
	}
	const description = descriptionSchema.safeParse(values.description);
	if (!description.success) fields.description = messageOf(description.error);
	const note = noteSchema.safeParse(values.note);
	if (!note.success) fields.note = messageOf(note.error);

	// Every failure above wrote a message; the repeats only narrow the types.
	if (
		Object.keys(fields).length > 0
		|| !amount.ok
		|| !payee.success
		|| category === null
		|| time === null
		|| !description.success
		|| !note.success
	) {
		return { ok: false, fields };
	}
	return {
		ok: true,
		amountMinor: amount.minor,
		payee: payee.data,
		category,
		time,
		description: description.data,
		note: note.data,
	};
}

/** The create request for checked values (BR-F03-06, BR-F03-20): a new UUIDv7 and `createdAt`
 * from `now`, and the date and time turned into `occurredAt` in the profile zone (D-496). */
export function createBody(
	values: EntryValues,
	checked: Extract<EntryCheck, { ok: true }>,
	locale: EntryLocale,
	now: Date,
): TransactionCreateInput {
	return {
		id: uuidV7(now.getTime()),
		type: values.type,
		amountMinor: checked.amountMinor,
		currency: locale.currency,
		...toOccurred(values.date, checked.time, locale.timezone),
		createdAt: now.toISOString(),
		category: checked.category,
		goalId: null,
		payee: checked.payee,
		description: checked.description,
		note: checked.note,
	};
}

/** The amount as the field shows it after blur, with the user's grouping (BR-F03-04), or the
 * text unchanged while it does not read as an amount. */
export function tidyAmount(text: string, locale: EntryLocale): string {
	const amount = parseAmount(text, locale);
	return amount.ok ? formatAmountInput(amount.minor, locale) : text;
}

/** The dialog field a refusal's path belongs under (BR-F03-48). `goalId` has none until M2. */
export const SERVER_FIELDS: Partial<Record<DialogField, EntryField>> = {
	type: "type",
	amountMinor: "amount",
	payee: "payee",
	category: "category",
	occurredOn: "date",
	occurredAt: "time",
	description: "description",
	note: "note",
};
