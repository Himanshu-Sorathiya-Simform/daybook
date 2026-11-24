import { ApiRequestError } from "@/lib/api/client";
import { SUBSCRIPTIONS_TEXT } from "./messages";
import type { SubscriptionAnswer } from "./types";

/** The dialogs' fields that show a message (BR-F05-24, BR-F05-29, BR-F05-31, section 8).
 * `cadence.every` and `cadence.unit` belong to the cadence field, `pause.from` and
 * `pause.until` to the pause. A message for any other path, such as `changedAt`, `currency` or
 * `id`, is the dialog's own line. */
export type SubscriptionField =
	| "name"
	| "amountMinor"
	| "cadence"
	| "category"
	| "startDate"
	| "note"
	| "endDate"
	| "pause"
	| "skipDueOn";

const FIELD_OF: Record<string, SubscriptionField> = {
	name: "name",
	amountMinor: "amountMinor",
	cadence: "cadence",
	"cadence.every": "cadence",
	"cadence.unit": "cadence",
	category: "category",
	startDate: "startDate",
	note: "note",
	endDate: "endDate",
	pause: "pause",
	"pause.from": "pause",
	"pause.until": "pause",
	skipDueOn: "skipDueOn",
};

/** What a refused Add, Edit, Cancel, Resume or Pause means for the dialog (flows 7.1 to 7.8). */
export type SubscriptionWriteOutcome =
	/** Messages under fields, and the dialog's own line when a path has no field. */
	| {
			kind: "fields";
			fields: Partial<Record<SubscriptionField, string>>;
			message: string | null;
	  }
	/** The dialog's own line: it stays open with the values (section 6, D-241). */
	| { kind: "form"; message: string }
	/** 409 `version_conflict`: the conflict view, with the Subscription as it is now
	 * (BR-F05-34). */
	| { kind: "conflict"; current: SubscriptionAnswer }
	/** 404 on a change: the Subscription was deleted on another device (section 8). */
	| { kind: "gone"; message: string }
	/** A 401 or `profile_required`, which the app already answers (STATE-4). */
	| { kind: "handled" };

/** A 409's Subscription, when its `details.current` has the shape of one. */
function currentSubscription(error: ApiRequestError): SubscriptionAnswer | null {
	const current = error.details["current"];
	if (typeof current !== "object" || current === null) return null;
	const found = current as Partial<SubscriptionAnswer>;
	return (
			typeof found.id === "string"
				&& typeof found.version === "number"
				&& typeof found.name === "string"
				&& Array.isArray(found.skips)
		) ?
			(found as SubscriptionAnswer)
		:	null;
}

/** The app already answers a 401 with the banner and `profile_required` with onboarding. */
function isHandled(error: ApiRequestError): boolean {
	return error.status === 401 || error.code === "profile_required";
}

/** A refusal's own words: its first field message, else its message. A 5xx, or an answer
 * without a code or words, has none worth showing. */
function reasonOf(error: ApiRequestError, status: number): string | null {
	if (status >= 500 || error.code === null) return null;
	const reason = Object.values(error.fields)[0] ?? error.message;
	return reason === "" ? null : reason;
}

/** A 422's messages split between the dialog's fields and its own line, which takes the first
 * message whose path has no field. Two paths of one field keep the first message. */
function splitFields(error: ApiRequestError): SubscriptionWriteOutcome {
	const fields: Partial<Record<SubscriptionField, string>> = {};
	let message: string | null = null;
	for (const [path, text] of Object.entries(error.fields)) {
		const field = FIELD_OF[path];
		if (field) fields[field] ??= text;
		else message ??= text;
	}
	// Only called with messages, so with no field among them the first is the line.
	if (Object.keys(fields).length === 0) return { kind: "form", message: message! };
	return { kind: "fields", fields, message };
}

/**
 * What a refused Add, Edit, Cancel, Resume or Pause shows (F05 sections 7 and 8). No answer, no
 * answer in time, a 5xx or an answer the client cannot read keeps the dialog open with "The
 * Subscription could not be saved. … Your changes are still here." A 422 puts each message
 * under its field. A `currency_mismatch`, a 429 and any other refusal with its own message show
 * that message. An error that is not an API error is a bug, and is thrown on.
 */
export function readSubscriptionWriteError(
	error: unknown,
): SubscriptionWriteOutcome {
	if (!(error instanceof ApiRequestError)) throw error;
	if (error.kind !== "http" || error.status === null) {
		return { kind: "form", message: SUBSCRIPTIONS_TEXT.saveFailed };
	}
	if (isHandled(error)) return { kind: "handled" };
	if (error.status === 404) {
		return { kind: "gone", message: SUBSCRIPTIONS_TEXT.deletedElsewhere };
	}
	const current = currentSubscription(error);
	if (error.code === "version_conflict" && current) {
		return { kind: "conflict", current };
	}
	if (error.status === 422 && Object.keys(error.fields).length > 0) {
		return splitFields(error);
	}
	return {
		kind: "form",
		message: reasonOf(error, error.status) ?? SUBSCRIPTIONS_TEXT.saveFailed,
	};
}

/** What a refused delete means (BR-F05-14, BR-F05-44, section 8). A 404 on a plain delete never
 * gets here: the Subscription is gone either way, so the delete counts as done. */
export type SubscriptionDeleteOutcome =
	| { kind: "conflict"; current: SubscriptionAnswer }
	/** The confirmation stays open with this line. */
	| { kind: "refused"; message: string }
	| { kind: "handled" };

export function readSubscriptionDeleteError(
	error: unknown,
): SubscriptionDeleteOutcome {
	if (!(error instanceof ApiRequestError)) throw error;
	if (error.kind !== "http" || error.status === null) {
		return { kind: "refused", message: SUBSCRIPTIONS_TEXT.deleteFailed };
	}
	if (isHandled(error)) return { kind: "handled" };
	const current = currentSubscription(error);
	if (error.code === "version_conflict" && current) {
		return { kind: "conflict", current };
	}
	return {
		kind: "refused",
		message: reasonOf(error, error.status) ?? SUBSCRIPTIONS_TEXT.deleteFailed,
	};
}

/** A refused delete as the outcome of a write, so a dialog reads a refused Delete as it reads a
 * refused Edit: the confirmation's line is the dialog's own line. */
export function readSubscriptionDeleteRefusal(
	error: unknown,
): SubscriptionWriteOutcome {
	const outcome = readSubscriptionDeleteError(error);
	return outcome.kind === "refused" ?
			{ kind: "form", message: outcome.message }
		:	outcome;
}

/** What a refused Undo, Skip this one or Undo skip means: none has a dialog, so a refusal shows
 * in the notice (BR-F05-33). */
export type SubscriptionNoticeOutcome =
	/** The conflict view (BR-F05-34). */
	| { kind: "conflict"; current: SubscriptionAnswer }
	/** Nothing changed; the notice reads this, with Dismiss. */
	| { kind: "failed"; message: string }
	/** 404: the Subscription was deleted on another device. The notice reads this, with
	 * Dismiss, and the page reads again, as it does after a dialog's 404 (section 8). */
	| { kind: "gone"; message: string }
	| { kind: "handled" };

/**
 * `undo` is true for the Undo of a write and false for a skip or an Undo skip the user asked
 * for. A refused Undo of any kind is "This change can't be undone any more." for a 422
 * (BR-F05-33); a refused skip or Undo skip says why with the server's words: "Only an upcoming
 * charge can be skipped.", "This charge date has passed, so it can't be brought back."
 */
export function readSubscriptionNoticeError(
	error: unknown,
	{ undo }: { undo: boolean },
): SubscriptionNoticeOutcome {
	if (!(error instanceof ApiRequestError)) throw error;
	if (error.kind !== "http" || error.status === null) {
		return { kind: "failed", message: SUBSCRIPTIONS_TEXT.noticeFailed };
	}
	if (isHandled(error)) return { kind: "handled" };
	if (error.status === 404) {
		return { kind: "gone", message: SUBSCRIPTIONS_TEXT.deletedElsewhere };
	}
	const current = currentSubscription(error);
	if (error.code === "version_conflict" && current) {
		return { kind: "conflict", current };
	}
	if (undo && error.status === 422) {
		return { kind: "failed", message: SUBSCRIPTIONS_TEXT.cannotUndo };
	}
	return {
		kind: "failed",
		message: reasonOf(error, error.status) ?? SUBSCRIPTIONS_TEXT.noticeFailed,
	};
}
