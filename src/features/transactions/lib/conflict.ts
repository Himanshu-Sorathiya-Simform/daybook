import { categoryLabel } from "@/lib/categories";
import { formatDayHeader, formatTime } from "@/lib/date-format";
import { formatMoney } from "@/lib/money";
import type { TransactionEditInput } from "@/lib/transactions/schemas";
import type { EntryField } from "./entry";
import { TYPE_LABELS } from "./filter-labels";
import type { LabelLocale } from "./labels";
import type { TransactionAnswer } from "./types";

/** F03 section 8's conflict view words (BR-F03-24, BR-F03-78). */
export const CONFLICT_TEXT = {
	title: "This Transaction changed on another device",
	intro: "Your version and the saved one are side by side, with the differences marked.",
	field: "Field",
	mine: "Yours",
	theirs: "Saved now",
	differs: "Differs",
	keepMine: "Keep mine",
	keepTheirs: "Keep theirs",
} as const;

/** The conflict view's field descriptors (BR-P1-26, BR-F03-78): each field's label, in the
 * dialog's order. */
export const CONFLICT_FIELDS: readonly { field: EntryField; label: string }[] = [
	{ field: "type", label: "Type" },
	{ field: "amount", label: "Amount" },
	{ field: "payee", label: "Payee" },
	{ field: "category", label: "Category" },
	{ field: "date", label: "Date" },
	{ field: "time", label: "Time" },
	{ field: "description", label: "Description" },
	{ field: "note", label: "Note" },
];

export type ConflictRow = {
	field: EntryField;
	label: string;
	mine: string;
	theirs: string;
	differs: boolean;
};

/** One field of a row as the conflict view words it: amounts unsigned in the profile's format,
 * the day in F02's list day format, the time in the profile zone ("Auto" on a charge), and
 * "None" for empty text. */
function shown(
	row: TransactionAnswer,
	field: EntryField,
	locale: LabelLocale,
): string {
	switch (field) {
		case "type":
			return TYPE_LABELS[row.type];
		case "amount":
			return formatMoney(
				row.amountMinor,
				locale.currency,
				locale.numberLocale,
			);
		case "payee":
			return row.payee ?? "None";
		case "category":
			return row.category === null ? "None" : categoryLabel(row.category);
		case "date":
			return formatDayHeader(row.occurredOn, locale);
		case "time":
			return row.source === "subscription" ?
					"Auto"
				:	formatTime(row.occurredAt, locale);
		case "description":
			return row.description ?? "None";
		case "note":
			return row.note ?? "None";
	}
}

/**
 * The conflict view's rows (BR-P1-26, BR-F03-78): every field of the user's version, which is
 * their change over the row as they opened it, beside the row as it is saved now, each marked
 * when the two read differently.
 */
export function conflictRows(
	before: TransactionAnswer,
	change: TransactionEditInput,
	current: TransactionAnswer,
	locale: LabelLocale,
): ConflictRow[] {
	const mine = { ...before, ...change } as TransactionAnswer;
	return CONFLICT_FIELDS.map(({ field, label }) => {
		const ours = shown(mine, field, locale);
		const theirs = shown(current, field, locale);
		return { field, label, mine: ours, theirs, differs: ours !== theirs };
	});
}

/** A list in English: "Amount", "Amount and Note", "Type, Amount and Note". */
function listOf(words: readonly string[]): string {
	if (words.length <= 1) return words.join("");
	return `${words.slice(0, -1).join(", ")} and ${words.at(-1)}`;
}

/** What Keep mine does (BR-F03-78): "Keep mine saves your change to Description and keeps the
 * rest as it is saved now." It names only the fields the user changed, which is all a resend
 * carries (BR-F03-24, flow 7.4). */
export function keepMineLine(fields: readonly EntryField[]): string {
	const labels = CONFLICT_FIELDS.filter(({ field }) => fields.includes(field)).map(
		({ label }) => label,
	);
	const noun = labels.length === 1 ? "change" : "changes";
	return `Keep mine saves your ${noun} to ${listOf(labels)} and keeps the rest as it is saved now.`;
}
