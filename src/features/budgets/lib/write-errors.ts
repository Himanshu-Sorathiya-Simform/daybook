import { ApiRequestError } from "@/lib/api/client";
import { BUDGETS_TEXT } from "./messages";
import type { BudgetAnswer } from "./types";

/** The dialog's fields that show a message (BR-F04-19 to BR-F04-21, section 8). A change from
 * a month sends `from` and a one-month change `month`; both belong to the dialog's one month
 * field. A message for any other path, such as `currency` or `id`, is the dialog's own line. */
export type BudgetField = "category" | "limitMinor" | "month";

const FIELD_OF: Record<string, BudgetField> = {
	category: "category",
	limitMinor: "limitMinor",
	from: "month",
	month: "month",
};

/** What a refused Add, Change limit or Stop means for the dialog (flows 7.1 to 7.4). */
export type BudgetWriteOutcome =
	/** Messages under fields, and the dialog's own line when a path has no field. */
	| {
			kind: "fields";
			fields: Partial<Record<BudgetField, string>>;
			message: string | null;
	  }
	/** The dialog's own line: it stays open with the values (section 6, D-241). */
	| { kind: "form"; message: string }
	/** 409 `version_conflict`: the conflict view, with the Budget as it is now (BR-F04-23). */
	| { kind: "conflict"; current: BudgetAnswer }
	/** 409 `budget_exists` on an Add: the existing Budget opens in Change limit (flow 7.1). */
	| { kind: "exists"; current: BudgetAnswer }
	/** 404 on a change: the Budget was deleted on another device (section 8). */
	| { kind: "gone"; message: string }
	/** A 401 or `profile_required`, which the app already answers (STATE-4). */
	| { kind: "handled" };

/** A 409's Budget, when its `details.current` has the shape of one. */
function currentBudget(error: ApiRequestError): BudgetAnswer | null {
	const current = error.details["current"];
	if (typeof current !== "object" || current === null) return null;
	const budget = current as Partial<BudgetAnswer>;
	return (
			typeof budget.id === "string"
				&& typeof budget.version === "number"
				&& typeof budget.category === "string"
				&& Array.isArray(budget.schedule)
				&& Array.isArray(budget.overrides)
		) ?
			(budget as BudgetAnswer)
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
function splitFields(error: ApiRequestError): BudgetWriteOutcome {
	const fields: Partial<Record<BudgetField, string>> = {};
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
 * What a refused Add, Change limit or Stop shows (F04 sections 7 and 8). No answer, no answer
 * in time, a 5xx or an answer the client cannot read keeps the dialog open with "The Budget
 * could not be saved. … Your changes are still here." A 422 puts each message under its field,
 * a stop that would remove every month under the month. A `currency_mismatch`, a 429 and any
 * other refusal with its own message show that message. An error that is not an API error is
 * a bug, and is thrown on.
 */
export function readBudgetWriteError(error: unknown): BudgetWriteOutcome {
	if (!(error instanceof ApiRequestError)) throw error;
	if (error.kind !== "http" || error.status === null) {
		return { kind: "form", message: BUDGETS_TEXT.saveFailed };
	}
	if (isHandled(error)) return { kind: "handled" };
	if (error.status === 404) {
		return { kind: "gone", message: BUDGETS_TEXT.deletedElsewhere };
	}
	const current = currentBudget(error);
	if (error.code === "version_conflict" && current) {
		return { kind: "conflict", current };
	}
	if (error.code === "budget_exists" && current) {
		return { kind: "exists", current };
	}
	if (error.status === 422 && Object.keys(error.fields).length > 0) {
		return splitFields(error);
	}
	return {
		kind: "form",
		message: reasonOf(error, error.status) ?? BUDGETS_TEXT.saveFailed,
	};
}

/** What a refused delete means (BR-F04-06, section 8). A 404 never gets here: the Budget is
 * gone either way, so the delete counts as done. */
export type BudgetDeleteOutcome =
	| { kind: "conflict"; current: BudgetAnswer }
	/** The confirmation stays open with this line. */
	| { kind: "refused"; message: string }
	| { kind: "handled" };

export function readBudgetDeleteError(error: unknown): BudgetDeleteOutcome {
	if (!(error instanceof ApiRequestError)) throw error;
	if (error.kind !== "http" || error.status === null) {
		return { kind: "refused", message: BUDGETS_TEXT.deleteFailed };
	}
	if (isHandled(error)) return { kind: "handled" };
	const current = currentBudget(error);
	if (error.code === "version_conflict" && current) {
		return { kind: "conflict", current };
	}
	return {
		kind: "refused",
		message: reasonOf(error, error.status) ?? BUDGETS_TEXT.deleteFailed,
	};
}

/** What a refused Undo or Remove means: neither has a dialog, so a refusal shows in the notice
 * (BR-F04-29). */
export type BudgetNoticeOutcome =
	/** The conflict view (BR-F04-23). A restoring create that finds a Budget made for the
	 * category in the meantime meets that Budget the same way. */
	| { kind: "conflict"; current: BudgetAnswer }
	/** Nothing changed; the notice reads this, with Dismiss. */
	| { kind: "failed"; message: string }
	| { kind: "handled" };

export function readBudgetNoticeError(error: unknown): BudgetNoticeOutcome {
	if (!(error instanceof ApiRequestError)) throw error;
	if (error.kind !== "http" || error.status === null) {
		return { kind: "failed", message: BUDGETS_TEXT.noticeFailed };
	}
	if (isHandled(error)) return { kind: "handled" };
	if (error.status === 404) {
		return { kind: "failed", message: BUDGETS_TEXT.deletedElsewhere };
	}
	const current = currentBudget(error);
	if (
		(error.code === "version_conflict" || error.code === "budget_exists")
		&& current
	) {
		return { kind: "conflict", current };
	}
	return {
		kind: "failed",
		message: reasonOf(error, error.status) ?? BUDGETS_TEXT.noticeFailed,
	};
}
