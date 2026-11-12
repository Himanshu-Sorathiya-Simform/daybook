import type { z } from "zod";

import { amountMessage, formatAmountInput, parseAmount } from "@/lib/amount";
import type { CategoryKey } from "@/lib/categories";
import type { CurrencyCode } from "@/lib/currency";
import { formatDayHeader, formatShortDate } from "@/lib/date-format";
import { uuidV7 } from "@/lib/ids";
import { codePointLength, optionalTextSchema, textSchema } from "@/lib/text";
import { shiftDays, todayIn } from "@/lib/time";
import { categoriesFor, isGoalType } from "@/lib/transactions/model";
import { localTime, toOccurred } from "@/lib/transactions/occurred";
import {
	TRANSACTION_MESSAGES,
	type TransactionCreateInput,
	type TransactionEditInput,
} from "@/lib/transactions/schemas";
import { editWindowMessage } from "./messages";
import type { TransactionAnswer } from "./types";
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
	editTitle: "Edit Transaction",
	duplicateTitle: "Duplicate Transaction",
	saved: "Transaction saved.",
	changesSaved: "Changes saved.",
	auto: "Auto",
	chargeUnlinked:
		"From a deleted Subscription. Its type, date and time are fixed.",
	chargeLinked:
		"Its type, date and time are fixed; editing it stops the Subscription from changing this charge.",
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

/** What the dialog is for (BR-F03-48): a new Transaction, a change to a row, or a copy of one. */
export type EntryMode =
	| { kind: "new" }
	| { kind: "edit"; row: TransactionAnswer }
	| { kind: "duplicate"; row: TransactionAnswer };

/** The dialog's title for each mode (BR-F03-48). */
export const ENTRY_TITLES: Record<EntryMode["kind"], string> = {
	new: ENTRY_TEXT.newTitle,
	edit: ENTRY_TEXT.editTitle,
	duplicate: ENTRY_TEXT.duplicateTitle,
};

/**
 * A row's values as the edit dialog shows them (BR-F03-11, D-238): the amount in the user's
 * format, the stored `occurredOn` as the date, and `occurredAt` read in the profile zone as the
 * time, so after a zone change the two can disagree. Goal rows wait for M2's Goal fields
 * (D-241), so they never open here.
 */
export function rowValues(row: TransactionAnswer, locale: EntryLocale): EntryValues {
	if (isGoalType(row.type)) {
		throw new RangeError("Goal Transactions open in the dialog from M2.");
	}
	return {
		type: row.type as EntryType,
		amount: formatAmountInput(row.amountMinor, locale),
		payee: row.payee ?? "",
		category: row.category,
		date: row.occurredOn,
		time: localTime(row.occurredAt, locale.timezone),
		description: row.description ?? "",
		note: row.note ?? "",
	};
}

/** A duplicate's values (BR-F03-28): the row's type, amount, category, payee, description and
 * note, dated now, as a new Transaction is. */
export function duplicateValues(
	row: TransactionAnswer,
	locale: EntryLocale,
	now: Date,
): EntryValues {
	const { date, time } = startValues(locale.timezone, now);
	return { ...rowValues(row, locale), date, time };
}

/** The dialog's starting values for its mode, when it opens at `now`. */
export function modeValues(
	mode: EntryMode,
	locale: EntryLocale,
	now: Date,
): EntryValues {
	if (mode.kind === "edit") return rowValues(mode.row, locale);
	if (mode.kind === "duplicate") return duplicateValues(mode.row, locale, now);
	return startValues(locale.timezone, now);
}

/** The notice in place of Type on a charge's edit (BR-F03-48, BR-F03-16): "Auto from Netflix. Its
 * type, date and time are fixed; …" while linked, the deleted-Subscription form once not. At M1
 * every charge is unlinked (D-475); the link to the Subscription arrives with F05. */
export function chargeNotice(
	row: Pick<TransactionAnswer, "subscriptionId" | "payee">,
): string {
	if (row.subscriptionId === null) return ENTRY_TEXT.chargeUnlinked;
	return `Auto from ${row.payee ?? ""}. ${ENTRY_TEXT.chargeLinked}`;
}

/** Whether a row's date and time are fixed (BR-F03-11, BR-F03-16): a charge's or a demo row's. */
export function hasFixedDate(
	row: Pick<TransactionAnswer, "source" | "demo">,
): boolean {
	return row.source === "subscription" || row.demo;
}

/** A row's entry window (TIME-7, BR-F03-11): its recording date, `createdAt` in the current
 * profile zone, and the 10 days before, as the server checks a changed date. */
export type EntryWindow = { firstOn: string; lastOn: string };

export function rowWindow(createdAt: string, timezone: string): EntryWindow {
	const lastOn = todayIn(timezone, new Date(createdAt));
	return { firstOn: windowStart(lastOn), lastOn };
}

/** The calendar's note on an edit (BR-F03-75): "You can choose a date from 6 Oct to 16 Oct.
 * Arrow keys move, Enter picks." */
export function editCalendarNote(
	{ firstOn, lastOn }: EntryWindow,
	locale: { today: string; dateLocale: string },
): string {
	const short = (date: string) => formatShortDate(date, locale);
	return `You can choose a date from ${short(firstOn)} to ${short(lastOn)}. Arrow keys move, Enter picks.`;
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

/**
 * The first and last day the calendar offers (BR-F03-08, BR-F03-11): a new Transaction's window
 * ending today, or an edit's own window, widened to the stored date, which after a time zone
 * change can sit a day outside it (D-238).
 */
export function calendarBounds(
	storedDate: string,
	window: EntryWindow | null,
	today: string,
): { minDate: string; maxDate: string } {
	if (window === null) return { minDate: windowStart(today), maxDate: today };
	return {
		minDate: storedDate < window.firstOn ? storedDate : window.firstOn,
		maxDate: storedDate > window.lastOn ? storedDate : window.lastOn,
	};
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

/** What an edit checks against (BR-F03-11): the values the dialog opened with, and the row's
 * own entry window. */
export type EditRules = { start: EntryValues; window: EntryWindow };

/**
 * Checks the dialog's values as F03 section 8 words them: the amount in the user's format
 * (BR-F03-04), the payee, a category of the type, and the text limits (BR-F03-12). Each field
 * gets its first message.
 * - **New:** the date in today's window and a time no later than now, both in the profile zone
 *   at `now` (BR-F03-08, BR-F03-09, D-540, D-551).
 * - **Edit (`edit`):** as the server checks it (BR-F03-11): a changed date must lie in the row's
 *   own window, "Choose a date from 6 Oct to 16 Oct." (D-499); a changed date or time must not
 *   be later than now. A date and time left as they were are not checked.
 */
export function checkEntry(
	values: EntryValues,
	locale: EntryLocale,
	now: Date,
	edit?: EditRules,
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
	const dateMoved = values.date !== edit?.start.date;
	if (edit === undefined) {
		if (values.date < windowStart(today) || values.date > today) {
			fields.date = M.dateOutOfWindow;
		}
	} else if (
		dateMoved
		&& (values.date < edit.window.firstOn || values.date > edit.window.lastOn)
	) {
		const short = (date: string) =>
			formatShortDate(date, { today, dateLocale: locale.dateLocale });
		fields.date = editWindowMessage(
			short(edit.window.firstOn),
			short(edit.window.lastOn),
		);
	}
	const { time } = values;
	const moved = dateMoved || time !== edit?.start.time;
	if (time === null) fields.time = ENTRY_TEXT.timeRequired;
	else if (
		moved
		&& values.date === today
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

/**
 * The edit request for checked values (BR-F03-23): only the fields that differ from the row.
 * An amount brings its currency. When the date or the time moved, `occurredAt` and
 * `occurredOn` go together, the new time combined with the date shown, so a time alone keeps
 * the stored date (BR-F03-11). `null` when nothing changed, since the server refuses an empty
 * edit (D-463).
 */
export function editBody(
	values: EntryValues,
	checked: Extract<EntryCheck, { ok: true }>,
	{ row, start }: { row: TransactionAnswer; start: EntryValues },
	locale: EntryLocale,
): TransactionEditInput | null {
	const body: TransactionEditInput = {};
	if (values.type !== row.type) body.type = values.type;
	if (checked.amountMinor !== row.amountMinor) {
		body.amountMinor = checked.amountMinor;
		body.currency = locale.currency;
	}
	if (checked.payee !== row.payee) body.payee = checked.payee;
	if (checked.category !== row.category) body.category = checked.category;
	if (checked.description !== row.description)
		body.description = checked.description;
	if (checked.note !== row.note) body.note = checked.note;
	if (values.date !== start.date || values.time !== start.time) {
		Object.assign(body, toOccurred(values.date, checked.time, locale.timezone));
	}
	return Object.keys(body).length > 0 ? body : null;
}

/** The fields an edit request changes, in the dialog's order, for the conflict view: the date
 * and the time each when it moved, though the request sends them together. */
export function changedFields(
	body: TransactionEditInput,
	values: Pick<EntryValues, "date" | "time">,
	start: Pick<EntryValues, "date" | "time">,
): EntryField[] {
	const fields: EntryField[] = [];
	if (body.type !== undefined) fields.push("type");
	if (body.amountMinor !== undefined) fields.push("amount");
	if (body.payee !== undefined) fields.push("payee");
	if (body.category !== undefined) fields.push("category");
	if (values.date !== start.date) fields.push("date");
	if (values.time !== start.time) fields.push("time");
	if (body.description !== undefined) fields.push("description");
	if (body.note !== undefined) fields.push("note");
	return fields;
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
