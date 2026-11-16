import type {
	BudgetRules,
	ExpenseCategory,
	MonthLimit,
	ScheduleEntry,
} from "@/lib/budgets/model";
import type { Month } from "@/lib/budgets/months";
import { categoryLabel } from "@/lib/categories";
import { formatMonth } from "@/lib/date-format";
import { formatMoney } from "@/lib/money";
import type { DialogScope } from "./dialog";
import type { Formats } from "./labels";
import type { BudgetAnswer } from "./types";

const money = (minor: number, f: Formats) =>
	formatMoney(minor, f.currency, f.numberLocale);
const long = (month: Month, f: Formats) => formatMonth(month, f, "long");

/** What Undo sends (BR-F04-29): the Budget as it was, kept with the write that changed it. */
export type UndoPlan =
	/** After a create sent as `POST`: `DELETE` at the version the create returned. */
	| { kind: "delete"; id: string; version: number }
	/** After a change, a one-month limit or a removal: a restoring `PATCH` at the version the
	 * write returned, with the schedule and one-month limits from before it. */
	| { kind: "restore"; id: string; version: number; rules: BudgetRules }
	/** After a delete: a restoring `POST` with the Budget's rules and a new id. */
	| { kind: "recreate"; category: ExpenseCategory; rules: BudgetRules };

/** A confirmed write's notice, for the page to show (BR-F04-29). */
export type WriteNotice = {
	category: ExpenseCategory;
	text: string;
	undo: UndoPlan;
	/** Whether the panel may carry it when this category is selected: not after a delete. */
	inPanel: boolean;
};

/** The rules a restoring write puts back: the Budget's schedule and one-month limits. */
export function rulesOf(budget: BudgetRules): {
	schedule: ScheduleEntry[];
	overrides: MonthLimit[];
} {
	return {
		schedule: budget.schedule.map(({ from, limitMinor }) => ({
			from,
			limitMinor,
		})),
		overrides: budget.overrides.map(({ month, limitMinor }) => ({
			month,
			limitMinor,
		})),
	};
}

/**
 * The notice for a confirmed Add, Change limit or Stop, in BR-F04-29's words: "Food Budget
 * added: ₹3,000.00 from November 2026.", "Food limit is now ₹7,000.00 from September 2026.",
 * "Food limit is ₹8,000.00 for October 2026 only.", "Entertainment Budget stops from November
 * 2026. Earlier months keep their limits." or "Entertainment has no limit for October 2026
 * only.". `before` is the Budget record as the dialog was opened on it, `null` for a category
 * with none: its create is undone by a delete, anything else by a restoring change. An Add on
 * a record is a change.
 */
export function writeNotice({
	scope,
	month,
	limitMinor,
	before,
	saved,
	formats,
}: {
	scope: DialogScope;
	month: Month;
	/** The limit sent, `null` for a stop. */
	limitMinor: number | null;
	before: BudgetRules | null;
	saved: BudgetAnswer;
	formats: Formats;
}): WriteNotice {
	const label = categoryLabel(saved.category);
	const when = long(month, formats);
	const amount = limitMinor === null ? null : money(limitMinor, formats);
	let text: string;
	if (limitMinor === null) {
		text =
			scope === "month" ?
				`${label} has no limit for ${when} only.`
			:	`${label} Budget stops from ${when}. Earlier months keep their limits.`;
	} else if (scope === "month") {
		text = `${label} limit is ${amount} for ${when} only.`;
	} else if (before === null) {
		text = `${label} Budget added: ${amount} from ${when}.`;
	} else {
		text = `${label} limit is now ${amount} from ${when}.`;
	}
	return {
		category: saved.category,
		text,
		inPanel: true,
		undo:
			before === null ?
				{ kind: "delete", id: saved.id, version: saved.version }
			:	{
					kind: "restore",
					id: saved.id,
					version: saved.version,
					rules: rulesOf(before),
				},
	};
}

/** "One-month limit for October 2026 removed." with the Budget as it was before, for Undo
 * (BR-F04-29). */
export function removalNotice({
	month,
	before,
	saved,
	formats,
}: {
	month: Month;
	before: BudgetRules;
	saved: BudgetAnswer;
	formats: Formats;
}): WriteNotice {
	return {
		category: saved.category,
		text: `One-month limit for ${long(month, formats)} removed.`,
		inPanel: true,
		undo: {
			kind: "restore",
			id: saved.id,
			version: saved.version,
			rules: rulesOf(before),
		},
	};
}

/** "Food Budget deleted." with the Budget's rules, for a restoring create: always above the
 * list (BR-F04-29). */
export function deletionNotice(
	category: ExpenseCategory,
	rules: BudgetRules,
): WriteNotice {
	return {
		category,
		text: `${categoryLabel(category)} Budget deleted.`,
		inPanel: false,
		undo: { kind: "recreate", category, rules: rulesOf(rules) },
	};
}
