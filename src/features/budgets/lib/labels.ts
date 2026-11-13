import {
	type InactiveStatus,
	type LimitSource,
	type ScheduleEntry,
	STATE_LABELS,
	type StateLabel,
	stateLabel,
} from "@/lib/budgets/model";
import { lastDayOf, type Month } from "@/lib/budgets/months";
import type { CurrencyCode } from "@/lib/currency";
import { formatMonth } from "@/lib/date-format";
import { formatMoney, formatPercent } from "@/lib/money";

/** What the page writes figures and months with: the profile's formats (MON-4, BR-F02-19). */
export type Formats = {
	currency: CurrencyCode;
	numberLocale: string;
	dateLocale: string;
};

const money = (minor: number, f: Formats) =>
	formatMoney(minor, f.currency, f.numberLocale);

/** Tenths of a percent with one decimal, "124.4%" (BR-F04-08). */
export const percentOf = (tenths: number, f: Formats) =>
	formatPercent(tenths, 1000, f.numberLocale);

const short = (month: Month, f: Formats) => formatMonth(month, f, "short");
const long = (month: Month, f: Formats) => formatMonth(month, f, "long");
const name = (month: Month, f: Formats) => formatMonth(month, f, "name");

/** The text colour of a state: over in the over colour, At limit and Nearing limit in the
 * warning colour, On track plain (BR-F04-16). The words always say it too. */
export const STATE_TONES = {
	over: "text-neg",
	at: "text-warn",
	warning: "text-warn",
	ok: "text-ink",
} as const satisfies Record<StateLabel, string>;

/** A row's headline: "Over by ₹1,220.00" past the limit, else "₹950.00 left" (BR-F04-16). */
export function headline(remainingMinor: number, f: Formats): string {
	return remainingMinor < 0 ?
			`Over by ${money(-remainingMinor, f)}`
		:	`${money(remainingMinor, f)} left`;
}

type RowFigures = {
	spentMinor: number;
	limitMinor: number;
	utilizationTenths: number;
};

/** "₹6,220.00 of ₹5,000.00 · 124.4%", the start of a row's figures (BR-F04-16). */
export function spentOfLimit(row: RowFigures, f: Formats): string {
	return `${money(row.spentMinor, f)} of ${money(row.limitMinor, f)} · ${percentOf(row.utilizationTenths, f)}`;
}

/** "₹6,220.00 of ₹5,000.00 · 124.4% · Over budget": the state in words (BR-F04-16). */
export function rowFigures(row: RowFigures, f: Formats): string {
	return `${spentOfLimit(row, f)} · ${STATE_LABELS[stateLabel(row.utilizationTenths)]}`;
}

/** What decides a row's limit, then the next schedule entry: "₹5,000.00 from Oct 2026", or
 * "One-month limit for Oct 2026", followed by ", then ₹7,000.00 from Dec 2026" or ", then
 * stops from Dec 2026" (BR-F04-16). */
export function sourceText(
	source: LimitSource,
	next: ScheduleEntry | null,
	f: Formats,
): string {
	const decided =
		source.kind === "override" ?
			`One-month limit for ${short(source.month, f)}`
			// A budgeted row's source always has a limit.
		:	`${money(source.limitMinor as number, f)} from ${short(source.from, f)}`;
	if (next === null) return decided;
	const then =
		next.limitMinor === null ?
			`stops from ${short(next.from, f)}`
		:	`${money(next.limitMinor, f)} from ${short(next.from, f)}`;
	return `${decided}, then ${then}`;
}

/** Why a Budget record has no limit in `month` (BR-F04-34): "Starts October 2026", "Stopped
 * from November 2026, starts again February 2027", or "No limit for October 2026 only". */
export function inactiveText(
	status: InactiveStatus,
	month: Month,
	f: Formats,
): string {
	if (status.status === "starts") return `Starts ${long(status.from, f)}`;
	if (status.status === "skipped") return `No limit for ${long(month, f)} only`;
	const stopped = `Stopped from ${long(status.from, f)}`;
	return status.restartsFrom === null ?
			stopped
		:	`${stopped}, starts again ${long(status.restartsFrom, f)}`;
}

const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);
const leftOf = (rows: readonly { remainingMinor: number }[]) =>
	sum(rows.map((row) => Math.max(0, row.remainingMinor)));

/** Needs attention's figure: "₹2,368.00 over in total", the amounts over each limit, when any
 * row is over it; else the sum left, "₹1,550.00 left" (BR-F04-15). */
export function attentionFigure(
	rows: readonly { remainingMinor: number }[],
	f: Formats,
): string {
	const over = sum(rows.map((row) => Math.max(0, -row.remainingMinor)));
	return over > 0 ? `${money(over, f)} over in total` : leftFigure(rows, f);
}

/** On track's figure: the sum left, "₹351.00 left" (BR-F04-15). */
export function leftFigure(
	rows: readonly { remainingMinor: number }[],
	f: Formats,
): string {
	return `${money(leftOf(rows), f)} left`;
}

/** "Needs attention · 4" (BR-F04-15). */
export function groupLabel(label: string, count: number): string {
	return `${label} · ${count}`;
}

/** The overview's figures under the readout: "of ₹11,000.00 · 119.7% · Over by ₹2,168.00", or
 * "… · ₹1,500.00 left" (BR-F04-15). */
export function overviewFigures(
	overall: { limitMinor: number; spentMinor: number; utilizationTenths: number },
	f: Formats,
): { total: string; state: string } {
	return {
		total: `of ${money(overall.limitMinor, f)} · ${percentOf(overall.utilizationTenths, f)}`,
		state: headline(overall.limitMinor - overall.spentMinor, f),
	};
}

/** "Black tick: the ₹11,000.00 limit.", adding "The bar stops at 160%." past it
 * (BR-F04-15). */
export function tickCaption(
	overall: { limitMinor: number; utilizationTenths: number },
	f: Formats,
): string {
	const tick = `Black tick: the ${money(overall.limitMinor, f)} limit.`;
	return overall.utilizationTenths > 1600 ?
			`${tick} The bar stops at 160%.`
		:	tick;
}

/** Today's place in the current month: the day, the month's days, and the share for the
 * bar's marker. */
export function dayOfMonth(today: string): {
	day: number;
	days: number;
	share: number;
} {
	const day = Number(today.slice(8, 10));
	const days = Number(lastDayOf(today.slice(0, 7)).slice(8, 10));
	return { day, days, share: day / days };
}

/** "Blue: day 2 of 30" (BR-F04-15). */
export function todayCaption(day: number, days: number): string {
	return `Blue: day ${day} of ${days}`;
}

/** "Budgeted spending in October" (BR-F04-15). */
export function overviewLabel(month: Month, f: Formats): string {
	return `Budgeted spending in ${name(month, f)}`;
}

/** A Not budgeted row's caption: "No limit in October" (BR-F04-15). */
export function noLimitCaption(month: Month, f: Formats): string {
	return `No limit in ${name(month, f)}`;
}

const FILTER_WORDS = {
	over: "are over budget",
	at: "are at their limit",
	warning: "are nearing their limit",
	ok: "are on track",
} as const satisfies Record<StateLabel, string>;

/** "No Budgets are over budget in October 2026." (BR-F04-31). */
export function filterEmptyText(
	label: StateLabel,
	month: Month,
	f: Formats,
): string {
	return `No Budgets ${FILTER_WORDS[label]} in ${long(month, f)}.`;
}

/** The list's own words (BR-F04-15, BR-F04-31). */
export const LIST_TEXT = {
	label: "Budgets",
	attention: "Needs attention",
	onTrack: "On track",
	notBudgeted: "Not budgeted",
	notActive: "Not active this month",
	showing: "Showing",
	showAll: "Show all",
	showAllBudgets: "Show all Budgets",
	changeLimit: "Change limit",
	delete: "Delete",
	totalSpending: "Total spending",
} as const;
