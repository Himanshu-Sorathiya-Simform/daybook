import { ApiRequestError } from "@/lib/api/client";
import { formatShortDate } from "@/lib/date-format";
import { isIsoDate } from "@/lib/time";
import { editWindowMessage, TRANSACTIONS_TEXT } from "./messages";
import type { TransactionAnswer, ViewAnswer } from "./types";

/** The body fields the entry dialog shows a message under (BR-F03-48). A message for any other
 * path, such as `createdAt` or `id`, is the dialog's own line instead. */
export const DIALOG_FIELDS = [
	"type",
	"amountMinor",
	"goalId",
	"payee",
	"category",
	"occurredOn",
	"occurredAt",
	"description",
	"note",
] as const;

export type DialogField = (typeof DIALOG_FIELDS)[number];

/** What a refused Transaction create or edit means for the dialog (flows 7.1 and 7.3). */
export type WriteOutcome =
	/** Messages under fields, and the dialog's own line when a path has no field. */
	| {
			kind: "fields";
			fields: Partial<Record<DialogField, string>>;
			message: string | null;
	  }
	/** The dialog's own line: it stays open with the values (BR-F03-21, D-241). */
	| { kind: "form"; message: string }
	/** 409 `version_conflict`: the conflict view, with the row as it is now (BR-F03-24). */
	| { kind: "conflict"; current: TransactionAnswer }
	/** 404 on an edit: the row was deleted elsewhere and leaves the list (BR-F03-25). */
	| { kind: "gone"; message: string }
	/** A 401 or `profile_required`, which the app already answers (STATE-4). */
	| { kind: "handled" };

type Context = { mode: "create" | "edit"; dateLocale: string; today: string };

const isDialogField = (path: string): path is DialogField =>
	(DIALOG_FIELDS as readonly string[]).includes(path);

/** A 409's row, when its `details.current` has the shape of one. */
function currentRow<T extends { id: string; version: number }>(
	error: ApiRequestError,
): T | null {
	const current = error.details["current"];
	if (typeof current !== "object" || current === null) return null;
	const row = current as Partial<T>;
	return typeof row.id === "string" && typeof row.version === "number" ?
			(row as T)
		:	null;
}

/** The app already answers a 401 with the banner and `profile_required` with onboarding. */
function isHandled(error: ApiRequestError): boolean {
	return error.status === 401 || error.code === "profile_required";
}

/** An edit's window message from `details: { firstOn, lastOn }` (D-499), or `null` when the
 * details are not two dates. */
function windowMessage(
	error: ApiRequestError,
	{ dateLocale, today }: Context,
): string | null {
	const { firstOn, lastOn } = error.details;
	if (typeof firstOn !== "string" || typeof lastOn !== "string") return null;
	if (!isIsoDate(firstOn) || !isIsoDate(lastOn)) return null;
	const short = (date: string) => formatShortDate(date, { dateLocale, today });
	return editWindowMessage(short(firstOn), short(lastOn));
}

/** A 422's messages split between the dialog's fields and its own line, which takes the first
 * message whose path has no field. */
function splitFields(error: ApiRequestError, context: Context): WriteOutcome {
	const fields: Partial<Record<DialogField, string>> = {};
	let message: string | null = null;
	for (const [path, text] of Object.entries(error.fields)) {
		if (isDialogField(path)) fields[path] = text;
		else message ??= text;
	}
	if (
		error.code === "date_out_of_window"
		&& context.mode === "edit"
		&& fields.occurredOn !== undefined
	) {
		fields.occurredOn = windowMessage(error, context) ?? fields.occurredOn;
	}
	// Only called with messages, so with no field among them the first is the line.
	if (Object.keys(fields).length === 0) return { kind: "form", message: message! };
	return { kind: "fields", fields, message };
}

/**
 * What a refused create or edit shows (F03 sections 7 and 8). No answer, no answer in time, a
 * 5xx or an answer the client cannot read keeps the dialog open with "Your change wasn't
 * saved. Try again." A 422 puts each message under its field. A `currency_mismatch`, a
 * read-only Goal, a 429 and any other refusal with its own message show that message. An
 * error that is not an API error is a bug, and is thrown on.
 */
export function readWriteError(error: unknown, context: Context): WriteOutcome {
	if (!(error instanceof ApiRequestError)) throw error;
	if (error.kind !== "http" || error.status === null) {
		return { kind: "form", message: TRANSACTIONS_TEXT.saveFailed };
	}
	if (isHandled(error)) return { kind: "handled" };
	if (error.status === 404 && context.mode === "edit") {
		return { kind: "gone", message: TRANSACTIONS_TEXT.deletedElsewhere };
	}
	if (error.code === "version_conflict") {
		const current = currentRow<TransactionAnswer>(error);
		if (current) return { kind: "conflict", current };
	}
	if (error.status === 422 && Object.keys(error.fields).length > 0) {
		return splitFields(error, context);
	}
	if (error.status >= 500 || error.code === null || error.message === "") {
		return { kind: "form", message: TRANSACTIONS_TEXT.saveFailed };
	}
	return { kind: "form", message: error.message };
}

/** What a refused delete means once its Undo window has ended (BR-F03-26). A 404 never gets
 * here: the delete counts as done (D-239). */
export type DeleteOutcome =
	| { kind: "conflict"; current: TransactionAnswer }
	/** The row comes back, with this reason in a toast. */
	| { kind: "refused"; message: string }
	| { kind: "handled" };

export function readDeleteError(error: unknown): DeleteOutcome {
	if (!(error instanceof ApiRequestError)) throw error;
	if (error.kind !== "http" || error.status === null) {
		return { kind: "refused", message: TRANSACTIONS_TEXT.deleteFailed };
	}
	if (isHandled(error)) return { kind: "handled" };
	if (error.code === "version_conflict") {
		const current = currentRow<TransactionAnswer>(error);
		if (current) return { kind: "conflict", current };
	}
	const reason = Object.values(error.fields)[0] ?? error.message;
	if (error.status >= 500 || reason === "") {
		return { kind: "refused", message: TRANSACTIONS_TEXT.deleteFailed };
	}
	return { kind: "refused", message: reason };
}

/** What a refused saved-view write shows (BR-F03-67 to BR-F03-69, AC-F03-55). */
export type ViewOutcome =
	/** A 422 on `name`: Save as view tries the next suffix; a rename shows it under the field. */
	| { kind: "name"; message: string }
	/** A 409: the view changed elsewhere. The message, and the views list reloads. */
	| { kind: "changed"; message: string; current: ViewAnswer | null }
	/** A 404 on a rename or update: the view was deleted elsewhere, and the list reloads. */
	| { kind: "gone"; message: string }
	| { kind: "form"; message: string }
	| { kind: "handled" };

export function readViewError(error: unknown): ViewOutcome {
	if (!(error instanceof ApiRequestError)) throw error;
	if (error.kind !== "http" || error.status === null) {
		return { kind: "form", message: TRANSACTIONS_TEXT.saveFailed };
	}
	if (isHandled(error)) return { kind: "handled" };
	if (error.code === "version_conflict") {
		return {
			kind: "changed",
			message: TRANSACTIONS_TEXT.viewChanged,
			current: currentRow<ViewAnswer>(error),
		};
	}
	if (error.status === 404) {
		return { kind: "gone", message: TRANSACTIONS_TEXT.viewDeleted };
	}
	const name = error.fields["name"];
	if (name !== undefined) return { kind: "name", message: name };
	const reason = Object.values(error.fields)[0] ?? error.message;
	if (error.status >= 500 || reason === "") {
		return { kind: "form", message: TRANSACTIONS_TEXT.saveFailed };
	}
	return { kind: "form", message: reason };
}
