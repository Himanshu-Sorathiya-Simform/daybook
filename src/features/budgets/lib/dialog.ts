import { amountMessage, type AmountResult } from "@/lib/amount";
import {
	type BudgetRules,
	type ExpenseCategory,
	limitIn,
	sameRules,
	setFrom,
	setMonth,
	stopRemovesEveryMonth,
	changeCount,
} from "@/lib/budgets/model";
import { type Month, shiftMonth } from "@/lib/budgets/months";
import type { BudgetCreateInput, BudgetEditInput } from "@/lib/budgets/schemas";
import type { BudgetRecord } from "@/lib/budgets/view";
import { categoryLabel, EXPENSE_CATEGORIES } from "@/lib/categories";
import { formatMonth } from "@/lib/date-format";
import { formatMoney } from "@/lib/money";
import type { Formats } from "./labels";
import type { BudgetMonthAnswer } from "./types";

const money = (minor: number, f: Formats) =>
	formatMoney(minor, f.currency, f.numberLocale);

/** Which dialog: Add a Budget, Change limit or Stop budgeting (BR-F04-19 to BR-F04-21). */
export type DialogKind = "add" | "change" | "stop";

/** For how long (BR-F04-20): from a month onward, or one month only. */
export type DialogScope = "onward" | "month";

/** The dialogs' own words (BR-F04-19 to BR-F04-21, BR-F04-28, section 8). */
export const DIALOG_TEXT = {
	addTitle: "Add a Budget",
	monthlyLimit: "Monthly limit",
	newLimit: "New limit",
	forHowLong: "For how long",
	onward: "From a month onward",
	onwardDetail: "Carries on until you change it",
	oneMonth: "One month only",
	applyFrom: "Apply from",
	stopFrom: "Stop from",
	month: "Month",
	otherMonth: "Other month",
	cancel: "Cancel",
	deleteInstead: "Delete Budget instead",
	deleteBudget: "Delete Budget",
	offline: "You are offline. Connect to save.",
} as const;

/** A month's name, with its year only when it is not the current year (BR-F04-28):
 * "November", "January 2027". */
export function monthName(month: Month, current: Month, f: Formats): string {
	return formatMonth(
		month,
		f,
		month.slice(0, 4) === current.slice(0, 4) ? "name" : "long",
	);
}

/** "Add a Budget", "Change the Food limit" or "Stop budgeting Food" (BR-F04-19 to
 * BR-F04-21). */
export function dialogTitle(
	kind: DialogKind,
	category: ExpenseCategory | null,
): string {
	if (kind === "add" || category === null) return DIALOG_TEXT.addTitle;
	const label = categoryLabel(category);
	return kind === "change" ?
			`Change the ${label} limit`
		:	`Stop budgeting ${label}`;
}

/** The month field's label: "Apply from", "Stop from", or "Month" for one month only
 * (BR-F04-19 to BR-F04-21). */
export function monthLabel(kind: DialogKind, scope: DialogScope): string {
	if (scope === "month") return DIALOG_TEXT.month;
	return kind === "stop" ? DIALOG_TEXT.stopFrom : DIALOG_TEXT.applyFrom;
}

/** One chip of the month field. */
export type MonthChip = { value: Month | "other"; label: string };

/** The month field's chips (BR-F04-28): "This month (November)", "Next month (December)", the
 * viewed month as "August (viewing)" when it is neither, a month picked in the grid as its own
 * chip, and "Other month". */
export function monthChips(
	{ current, viewed, picked }: { current: Month; viewed: Month; picked: Month },
	f: Formats,
): MonthChip[] {
	const next = shiftMonth(current, 1);
	const name = (month: Month) => monthName(month, current, f);
	const chips: MonthChip[] = [
		{ value: current, label: `This month (${name(current)})` },
		{ value: next, label: `Next month (${name(next)})` },
	];
	if (viewed !== current && viewed !== next) {
		chips.push({ value: viewed, label: `${name(viewed)} (viewing)` });
	}
	if (!chips.some((chip) => chip.value === picked)) {
		chips.push({ value: picked, label: name(picked) });
	}
	chips.push({ value: "other", label: DIALOG_TEXT.otherMonth });
	return chips;
}

/** The grid's caption: "From Nov 2023 to Nov 2027." (BR-F04-28). */
export function rangeCaption(first: Month, last: Month, f: Formats): string {
	return `From ${formatMonth(first, f, "short")} to ${formatMonth(last, f, "short")}.`;
}

/** One month only's detail: the month after the chosen one and the limit it has, its own
 * one-month limit included: "December goes back to ₹5,000.00", or "December has no Budget
 * again" (BR-F04-20). */
export function oneMonthDetail(
	rules: BudgetRules,
	month: Month,
	current: Month,
	f: Formats,
): string {
	const after = shiftMonth(month, 1);
	const limit = limitIn(rules, after);
	const name = monthName(after, current, f);
	return limit === null ?
			`${name} has no Budget again`
		:	`${name} goes back to ${money(limit, f)}`;
}

/** The limit's hint: "Spent ₹6,220.00 in October and ₹5,050.00 in September." for the viewed
 * month and the one before, from the history's two months, oldest first (BR-F04-19,
 * BR-F04-20). */
export function spentHint(
	months: readonly { month: Month; spentMinor: number }[],
	f: Formats,
): string | undefined {
	const [before, viewed] = months;
	if (!before || !viewed) return undefined;
	const part = (each: { month: Month; spentMinor: number }) =>
		`${money(each.spentMinor, f)} in ${formatMonth(each.month, f, "name")}`;
	return `Spent ${part(viewed)} and ${part(before)}.`;
}

/** Change limit's starting limit (BR-F04-20): the limit in force in the viewed month, else in
 * the current month, else the latest limit in the schedule. */
export function startLimit(
	rules: BudgetRules,
	viewed: Month,
	current: Month,
): number | null {
	const latest = rules.schedule.findLast((entry) => entry.limitMinor !== null);
	return (
		limitIn(rules, viewed)
		?? limitIn(rules, current)
		?? latest?.limitMinor
		?? null
	);
}

/** The limit field's message for a typed amount: "Enter a limit." when empty, else F03's amount
 * messages (section 8). */
export function limitMessage(result: AmountResult, f: Formats): string | undefined {
	if (result.ok) return undefined;
	return result.error === "required" ?
			"Enter a limit."
		:	amountMessage(result.error, f);
}

/** The categories Add a Budget offers: every expense category with no limit in the viewed
 * month (BR-F04-19). */
export function addCategories(view: BudgetMonthAnswer): ExpenseCategory[] {
	const budgeted = new Set(view.budgets.map((row) => row.category));
	return EXPENSE_CATEGORIES.filter((category) => !budgeted.has(category));
}

/** Each offered category's spending in the viewed month: "₹450.00 in Sept" (BR-F04-19). The
 * Not budgeted rows are the categories with spending and no limit. */
export function tileCaptions(
	view: BudgetMonthAnswer,
	f: Formats,
): Partial<Record<ExpenseCategory, string>> {
	const month = formatMonth(view.month, f, "shortName");
	return Object.fromEntries(
		view.unbudgeted.map((row) => [
			row.category,
			`${money(row.spentMinor, f)} in ${month}`,
		]),
	);
}

/** A category's Budget record in the viewed month, whether it has a limit there or not. */
export function recordIn(
	view: BudgetMonthAnswer,
	category: ExpenseCategory,
): BudgetRecord | null {
	return (
		view.budgets.find((row) => row.category === category)
		?? view.inactive.find((row) => row.category === category)
		?? null
	);
}

/** The button's words, naming the change (BR-F04-27): "Add Budget from November", "Add for
 * November only", "Change from November", "Change November only", "Stop from November" or
 * "Stop November only". */
export function buttonName(
	kind: DialogKind,
	scope: DialogScope,
	month: Month,
	current: Month,
	f: Formats,
): string {
	const name = monthName(month, current, f);
	if (kind === "add")
		return scope === "month" ?
				`Add for ${name} only`
			:	`Add Budget from ${name}`;
	const verb = kind === "stop" ? "Stop" : "Change";
	return scope === "month" ? `${verb} ${name} only` : `${verb} from ${name}`;
}

/** "Food already has this limit from November 2026. Nothing changes.", or "… in November
 * 2026. …" for one month (BR-F04-27). */
export function nothingChanges(
	category: ExpenseCategory,
	scope: DialogScope,
	month: Month,
	f: Formats,
): string {
	const when = scope === "month" ? "in" : "from";
	return `${categoryLabel(category)} already has this limit ${when} ${formatMonth(month, f)}. Nothing changes.`;
}

/** What a filled-in dialog sends, and whether it may (BR-F04-19 to BR-F04-21). */
export type DialogPlan =
	| { kind: "create"; body: BudgetCreateInput }
	| { kind: "edit"; body: BudgetEditInput; blocked: boolean; unchanged: boolean };

/**
 * The request for a dialog's choices: a `POST` for a category with no Budget record, else a
 * `PATCH` from a month onward or for one month (D-561). A stop from a month at or before the
 * first entry is `blocked`, and a change that leaves the rules as they are is `unchanged`
 * (BR-F04-21, BR-F04-27).
 */
export function planChange({
	kind,
	record,
	category,
	scope,
	month,
	limitMinor,
	id,
	currency,
}: {
	kind: DialogKind;
	record: BudgetRules | null;
	category: ExpenseCategory;
	scope: DialogScope;
	month: Month;
	/** The typed limit; ignored for a stop. */
	limitMinor: number;
	/** The new Budget's id, for a create. */
	id: string;
	currency: Formats["currency"];
}): DialogPlan {
	const limit = kind === "stop" ? null : limitMinor;
	if (record === null) {
		return {
			kind: "create",
			body: { id, category, from: month, limitMinor, currency },
		};
	}
	if (scope === "month") {
		return {
			kind: "edit",
			body: { month, limitMinor: limit, currency, scope: "month" },
			blocked: false,
			unchanged: sameRules(record, setMonth(record, month, limit)),
		};
	}
	const blocked = limit === null && stopRemovesEveryMonth(record.schedule, month);
	return {
		kind: "edit",
		body: { from: month, limitMinor: limit, currency },
		blocked,
		unchanged: sameRules(record, setFrom(record, month, limit)),
	};
}

/** The Delete confirmation's title and line (BR-F04-06). */
export function deleteTitle(category: ExpenseCategory): string {
	return `Delete the ${categoryLabel(category)} Budget?`;
}

export function deleteBody(category: ExpenseCategory): string {
	return `Every month, including past ones, loses its ${categoryLabel(category)} limit.`;
}

/** With more than one change: "Its limit history (2 changes since September 2026) goes too.
 * To keep it, stop the Budget from a month instead." (BR-F04-06). */
export function deleteHistory(rules: BudgetRules, f: Formats): string | null {
	const count = changeCount(rules);
	const first = rules.schedule[0];
	if (count <= 1 || first === undefined) return null;
	return `Its limit history (${count} changes since ${formatMonth(first.from, f)}) goes too. To keep it, stop the Budget from a month instead.`;
}
