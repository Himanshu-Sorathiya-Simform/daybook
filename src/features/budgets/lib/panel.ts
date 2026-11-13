import {
	type BudgetRules,
	type ExpenseCategory,
	limitIn,
	limitSource,
	scheduleEntryIn,
	utilizationTenths,
} from "@/lib/budgets/model";
import { type Month, monthsStarting, shiftMonth } from "@/lib/budgets/months";
import type { BudgetRecord } from "@/lib/budgets/view";
import { formatMonth } from "@/lib/date-format";
import { formatMoney } from "@/lib/money";
import { type Formats, percentOf, TABLE_TEXT } from "./labels";
import { PANEL_MONTHS } from "./queries";
import type { BudgetMonthAnswer } from "./types";

const money = (minor: number, f: Formats) =>
	formatMoney(minor, f.currency, f.numberLocale);
const short = (month: Month, f: Formats) => formatMonth(month, f, "short");
const name = (month: Month, f: Formats) => formatMonth(month, f, "name");

/** The panel's own words (BR-F04-30). */
export const PANEL_TEXT = {
	label: "Budget details",
	close: "Close details",
	thisMonth: "This month",
	budgetedSpending: "Budgeted spending",
	limits: "Limits",
	overOrAt: "Over or at limit",
	howLimitsWork: "How limits work",
	howLimitsWorkLines: [
		"A limit carries forward to every later month until you change it. Past months keep the limits they had.",
		"For a one-off, like a festival month, change the limit for one month only.",
		"Nearing limit starts at 80.0%. Over budget starts at 100.0%.",
	],
	summaryHint:
		"Select a Budget to see its last 6 months and limit history. Up and down arrows move.",
	lastSixMonths: "Last 6 months",
	viewAsTable: "View as table",
	viewAsChart: "View as chart",
	chartCaption: "Dashed line: the limit in force that month. Red: spent above it.",
	month: "Month",
	limit: "Limit",
	spent: "Spent",
	used: "Used",
	noBudget: "No Budget",
	limitHistory: "Limit history",
	oneMonth: "One month",
	remove: "Remove",
	whereItWent: "Where it went",
	addBudget: "Add a Budget",
	changeLimit: "Change limit",
	stop: "Stop",
	delete: "Delete",
} as const;

/** What the selected category is in the month: a Budget, Not budgeted or Not active
 * (BR-F04-30), with its Budget record when it has one. Not budgeted comes before Not active,
 * since a record with no limit in the month and spending in it is both. */
export type PanelSubject =
	| {
			kind: "budget";
			row: BudgetMonthAnswer["budgets"][number];
			record: BudgetRecord;
	  }
	| {
			kind: "unbudgeted";
			row: BudgetMonthAnswer["unbudgeted"][number];
			record: BudgetRecord | null;
	  }
	| {
			kind: "inactive";
			row: BudgetMonthAnswer["inactive"][number];
			record: BudgetRecord;
	  };

/** The selected category in `view`, or `null` when the month does not show it. */
export function subjectOf(
	view: BudgetMonthAnswer,
	category: ExpenseCategory,
): PanelSubject | null {
	const budget = view.budgets.find((row) => row.category === category);
	if (budget) return { kind: "budget", row: budget, record: budget };
	const inactive = view.inactive.find((row) => row.category === category);
	const unbudgeted = view.unbudgeted.find((row) => row.category === category);
	if (unbudgeted) {
		return { kind: "unbudgeted", row: unbudgeted, record: inactive ?? null };
	}
	return inactive ? { kind: "inactive", row: inactive, record: inactive } : null;
}

/** The label above the category (BR-F04-30). */
export const SUBJECT_LABELS = {
	budget: "Budget",
	unbudgeted: "Not budgeted",
	inactive: "Not active this month",
} as const satisfies Record<PanelSubject["kind"], string>;

/** "₹2,148.00 spent in October, no limit" (BR-F04-30). */
export function spentNoLimit(spentMinor: number, month: Month, f: Formats): string {
	return `${money(spentMinor, f)} spent in ${name(month, f)}, no limit`;
}

/** "of ₹5,000.00" beside the panel's spent (BR-F04-30). */
export function ofLimit(limitMinor: number, f: Formats): string {
	return `of ${money(limitMinor, f)}`;
}

/** The hint under a selection's actions: "L to change limit" only for a Budget, "Up and down
 * arrows move" only in the docked panel, since the drawer holds focus (BR-F04-30, D-571). */
export function detailHint(kind: PanelSubject["kind"], isDocked: boolean): string {
	return [
		kind === "budget" && "L to change limit",
		isDocked && "Up and down arrows move",
		"Esc to close",
	]
		.filter(Boolean)
		.join(" · ");
}

/** "Compared with September" (BR-F04-30). */
export function comparedWith(previous: Month, f: Formats): string {
	return `Compared with ${name(previous, f)}`;
}

const plural = (count: number, word: string) =>
	`${count} ${word}${count === 1 ? "" : "s"}`;

/** How an amount compares with the month before: "₹5,069.00 more than September", "… less
 * than …", or "Same as September". */
function moneyNote(now: number, before: number, previous: string, f: Formats) {
	if (now === before) return `Same as ${previous}`;
	const more = now > before ? "more" : "less";
	return `${money(Math.abs(now - before), f)} ${more} than ${previous}`;
}

/** The summary's three rows, each with its value and note (BR-F04-30). Golden October:
 * "₹13,168.00" with "₹5,069.00 more than September"; "₹11,000.00" with "₹1,000.00 more than
 * September · 4 Budgets, 3 in September"; "3" with "0 in September". Over or at limit counts
 * the rows in the state `over`, At limit included, as `previous.overCount` does
 * (BR-F04-34). */
export function compareRows(
	view: BudgetMonthAnswer,
	f: Formats,
): { label: string; value: string; note: string }[] {
	const { overall, previous, budgets } = view;
	const before = name(previous.month, f);
	const count = budgets.length;
	const counts =
		count === previous.budgetCount ?
			""
		:	` · ${plural(count, "Budget")}, ${previous.budgetCount} in ${before}`;
	const over = budgets.filter((row) => row.state === "over").length;
	const number = new Intl.NumberFormat(f.numberLocale);
	return [
		{
			label: PANEL_TEXT.budgetedSpending,
			value: money(overall.spentMinor, f),
			note: moneyNote(overall.spentMinor, previous.spentMinor, before, f),
		},
		{
			label: PANEL_TEXT.limits,
			value: money(overall.limitMinor, f),
			note:
				moneyNote(overall.limitMinor, previous.limitMinor, before, f)
				+ counts,
		},
		{
			label: PANEL_TEXT.overOrAt,
			value: number.format(over),
			note:
				over === previous.overCount ?
					`Same as ${before}`
				:	`${number.format(previous.overCount)} in ${before}`,
		},
	];
}

/** One item of the limit history (BR-F04-30). */
export type HistoryItem = {
	kind: "entry" | "override";
	month: Month;
	text: string;
	/** Whether it decides the viewed month's limit. */
	inForce: boolean;
};

/** A Budget's limit history, newest first: each schedule entry ("₹5,000.00 from Oct 2026",
 * "Stopped from Nov 2026") and each one-month limit ("₹8,000.00 in Oct 2026 only", "No limit in
 * Oct 2026 only"), a one-month limit above an entry of the same month (D-571). The one that
 * decides `month`'s limit is marked. */
export function historyItems(
	rules: BudgetRules,
	month: Month,
	f: Formats,
): HistoryItem[] {
	const source = limitSource(rules, month);
	const entryInForce =
		source?.kind === "schedule" ? scheduleEntryIn(rules.schedule, month) : null;
	const entries: HistoryItem[] = rules.schedule.map((entry) => ({
		kind: "entry",
		month: entry.from,
		text:
			entry.limitMinor === null ?
				`Stopped from ${short(entry.from, f)}`
			:	`${money(entry.limitMinor, f)} from ${short(entry.from, f)}`,
		inForce: entry === entryInForce,
	}));
	const overrides: HistoryItem[] = rules.overrides.map((each) => ({
		kind: "override",
		month: each.month,
		text:
			each.limitMinor === null ?
				`No limit in ${short(each.month, f)} only`
			:	`${money(each.limitMinor, f)} in ${short(each.month, f)} only`,
		inForce: source?.kind === "override" && source.month === each.month,
	}));
	return [...overrides, ...entries].sort((a, b) =>
		a.month === b.month ? 0
		: a.month > b.month ? -1
		: 1,
	);
}

/** "In force in October" under the item that decides the month's limit (BR-F04-30). */
export function inForceText(month: Month, f: Formats): string {
	return `In force in ${name(month, f)}`;
}

/** The history's last line: "No Budget before Sep 2026", the first schedule entry's month
 * (BR-F04-30). */
export function noBudgetBefore(rules: BudgetRules, f: Formats): string {
	const first = rules.schedule[0] as { from: Month };
	return `No Budget before ${short(first.from, f)}`;
}

/** One month of Last 6 months (BR-F04-35). */
export type HistoryMonth = {
	month: Month;
	limitMinor: number | null;
	spentMinor: number;
};

/** A month's row in Last 6 months' table: "Oct 2026", the limit or "No Budget", the spent,
 * and Used, the utilization or "—" with no limit (BR-F04-30, D-571). */
export function monthCells(
	{ month, limitMinor, spentMinor }: HistoryMonth,
	f: Formats,
): { month: string; limit: string; spent: string; used: string } {
	return {
		month: short(month, f),
		limit: limitMinor === null ? PANEL_TEXT.noBudget : money(limitMinor, f),
		spent: money(spentMinor, f),
		used:
			limitMinor === null ?
				TABLE_TEXT.none
			:	percentOf(utilizationTenths(spentMinor, limitMinor), f),
	};
}

/** The chart's text for screen readers: "Spent by month: Jun 2026 ₹0.00, no limit; …; Oct
 * 2026 ₹6,220.00 of ₹5,000.00". */
export function chartLabel(months: readonly HistoryMonth[], f: Formats): string {
	const each = months.map(({ month, limitMinor, spentMinor }) => {
		const limit =
			limitMinor === null ? ", no limit" : ` of ${money(limitMinor, f)}`;
		return `${short(month, f)} ${money(spentMinor, f)}${limit}`;
	});
	return `Spent by month: ${each.join("; ")}`;
}

/** Whether a Budget record gives any of Last 6 months, ending at `month`, a limit: known before
 * the history loads, so its caption can hold its place (D-571). */
export function limitsIn(rules: BudgetRules, month: Month): boolean {
	return monthsStarting(shiftMonth(month, 1 - PANEL_MONTHS), PANEL_MONTHS).some(
		(each) => limitIn(rules, each) !== null,
	);
}

/** "Where it went in October" (BR-F04-30). */
export function whereItWent(month: Month, f: Formats): string {
	return `Where it went in ${name(month, f)}`;
}

/** "See 4 Transactions", or "See 1 Transaction" (BR-F04-17). */
export function seeTransactions(count: number): string {
	return `See ${plural(count, "Transaction")}`;
}
