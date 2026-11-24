import { categoryLabel } from "@/lib/categories";
import { compareCodeUnits } from "@/lib/compare";
import type { Cadence, Pause } from "@/lib/subscriptions/schedule";
import type { ExpenseCategory } from "@/lib/subscriptions/model";
import type {
	SubscriptionDeleteInput,
	SubscriptionEditInput,
	SubscriptionSkipInput,
	SubscriptionUnskipInput,
} from "@/lib/subscriptions/schemas";
import { cadenceLabel, type Formats, money, shortDate } from "./labels";
import type { SubscriptionItem } from "./types";

/** F05's conflict view words (BR-F05-34, section 8): the same view as F03's and F04's, worded
 * for a Subscription. */
export const CONFLICT_TEXT = {
	title: "This Subscription changed on another device",
	intro: "Your version and the saved one are side by side, with the differences marked.",
	deleteIntro:
		"It changed after you chose to delete it. Delete it anyway, or keep it as it is saved now.",
	field: "Field",
	mine: "Yours",
	theirs: "Saved now",
	differs: "Differs",
	keepMine: "Keep mine",
	keepTheirs: "Keep theirs",
	deleteAnyway: "Delete anyway",
	keepIt: "Keep it",
	/** Under the table: what Keep mine does. */
	writeLine: "Keep mine saves your change to the Subscription as it is saved now.",
	undoLine: "Keep mine puts the Subscription back as it was before your change.",
	deleteLine: "Its charges stay in Transactions as ordinary expenses.",
	none: "None",
	rows: {
		name: "Name",
		amount: "Amount",
		cadence: "How often",
		category: "Category",
		startDate: "Started on",
		endDate: "Ends",
		pause: "Pause",
		note: "Note",
		skips: "Skipped",
	},
} as const;

/** What a conflict view compares: the values of a Subscription the user can change, and its
 * skipped dates. */
export type ConflictFields = {
	name: string;
	amountMinor: number;
	cadence: Cadence;
	category: ExpenseCategory;
	startDate: string;
	endDate: string | null;
	pause: Pause | null;
	note: string | null;
	skips: string[];
};

export function fieldsOf(
	item: Pick<
		SubscriptionItem,
		| "name"
		| "amountMinor"
		| "cadence"
		| "category"
		| "startDate"
		| "endDate"
		| "pause"
		| "note"
		| "skips"
	>,
): ConflictFields {
	return {
		name: item.name,
		amountMinor: item.amountMinor,
		cadence: item.cadence,
		category: item.category,
		startDate: item.startDate,
		endDate: item.endDate,
		pause: item.pause,
		note: item.note,
		skips: [...item.skips],
	};
}

/** A write that can be sent again against a newer version: a change, a delete, a skip or an
 * Undo skip. A body may leave out `changedAt`, which is then the time of sending (Undo), or
 * carry the original one (Keep mine, BR-F05-34, section 7). */
type Unstamped<T extends { changedAt: string }> = Omit<T, "changedAt"> & {
	changedAt?: string;
};

export type ChangeRequest =
	| { kind: "change"; id: string; body: Unstamped<SubscriptionEditInput> }
	| { kind: "delete"; id: string; body: Unstamped<SubscriptionDeleteInput> }
	| { kind: "skip"; id: string; body: Unstamped<SubscriptionSkipInput> }
	| {
			kind: "unskip";
			id: string;
			dueOn: string;
			body: Unstamped<SubscriptionUnskipInput>;
	  };

const sorted = (dates: string[]) => [...dates].sort(compareCodeUnits);

/** `skips` with `date` among them, in order; the same list when it already is. */
const withSkip = (skips: string[], date: string) =>
	skips.includes(date) ? skips : sorted([...skips, date]);

/** What a `change` request sets, put over `next`: a field the request does not carry is left. */
function putFields(
	next: ConflictFields,
	body: Extract<ChangeRequest, { kind: "change" }>["body"],
) {
	if (body.name !== undefined) next.name = body.name;
	if (body.amountMinor !== undefined) next.amountMinor = body.amountMinor;
	if (body.cadence !== undefined) next.cadence = body.cadence as Cadence;
	if (body.category !== undefined) {
		next.category = body.category as ExpenseCategory;
	}
	if (body.startDate !== undefined) next.startDate = body.startDate;
	if (body.endDate !== undefined) next.endDate = body.endDate;
	if (body.pause !== undefined) next.pause = body.pause;
	if (body.note !== undefined) next.note = body.note;
}

/**
 * The Subscription as `request` would leave `base`, for the "Yours" column: a change puts its
 * fields over the saved ones, so a field the user never touched reads the same on both sides; a
 * skip adds its date, an Undo skip and an `unskipDueOn` take one away, and a `skipDueOn` adds
 * one. A delete leaves it as it is.
 */
export function applyRequest(
	base: ConflictFields,
	request: ChangeRequest,
): ConflictFields {
	const next = { ...base, skips: [...base.skips] };
	if (request.kind === "skip") {
		next.skips = withSkip(next.skips, request.body.dueOn);
		return next;
	}
	if (request.kind === "unskip") {
		next.skips = next.skips.filter((date) => date !== request.dueOn);
		return next;
	}
	if (request.kind === "delete") return next;
	const { body } = request;
	putFields(next, body);
	if (body.skipDueOn !== undefined) {
		next.skips = withSkip(next.skips, body.skipDueOn);
	}
	if (body.unskipDueOn !== undefined) {
		next.skips = next.skips.filter((date) => date !== body.unskipDueOn);
	}
	return next;
}

/** One row of the conflict table. */
export type ConflictRow = {
	key: string;
	label: string;
	mine: string;
	theirs: string;
	differs: boolean;
};

const dateOrNone = (date: string | null, f: Formats) =>
	date === null ? CONFLICT_TEXT.none : shortDate(date, f);

const cellsOf = (fields: ConflictFields, f: Formats) => ({
	name: fields.name,
	amount: money(fields.amountMinor, f),
	cadence: cadenceLabel(fields.cadence),
	category: categoryLabel(fields.category),
	startDate: shortDate(fields.startDate, f),
	endDate: dateOrNone(fields.endDate, f),
	pause:
		fields.pause === null ?
			CONFLICT_TEXT.none
		:	`${shortDate(fields.pause.from, f)} until ${shortDate(fields.pause.until, f)}`,
	note:
		fields.note === null || fields.note === "" ?
			CONFLICT_TEXT.none
		:	fields.note,
	skips:
		fields.skips.length === 0 ?
			CONFLICT_TEXT.none
		:	fields.skips.map((date) => shortDate(date, f)).join(", "),
});

/**
 * The conflict table (BR-F05-34): a row for each value, in the dialog's order, the user's
 * version beside the one saved now, a row that reads differently marked `differs`. Skipped
 * dates close it, as a row of their own.
 */
export function conflictRows(
	yours: ConflictFields,
	theirs: ConflictFields,
	f: Formats,
): ConflictRow[] {
	const mine = cellsOf(yours, f);
	const saved = cellsOf(theirs, f);
	return (Object.keys(CONFLICT_TEXT.rows) as (keyof typeof mine)[]).map((key) => ({
		key,
		label: CONFLICT_TEXT.rows[key],
		mine: mine[key],
		theirs: saved[key],
		differs: mine[key] !== saved[key],
	}));
}
