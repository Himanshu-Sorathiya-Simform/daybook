import { type ExpenseCategory, categoryOrder } from "@/lib/budgets/model";
import { compareCodeUnits } from "@/lib/compare";
import { formatDayMonth, formatMonth } from "@/lib/date-format";
import { formatMoney, formatPercent, percentTenths } from "@/lib/money";
import type { CurrencyCode } from "@/lib/currency";
import { shiftMonth, type Month } from "@/lib/budgets/months";

import { DASHBOARD_MESSAGES as M } from "./messages";

/** The dashboard's own figures (F08 section 4), from integers, so the server's answer, the page
 * and the tests agree. Percentages are tenths of a percent, rounded half away from zero once
 * (MON-7, MON-8). */

/** The change from `previous` to `current` in tenths of a percent (PER-4, BR-F08-07), or `null`
 * when the previous figure is 0. */
export function changeTenths(current: number, previous: number): number | null {
	return previous === 0 ? null : percentTenths(current - previous, previous);
}

/** Net savings ÷ income in tenths (TXN-5, MON-8), or `null` without income. */
export function savingsRateTenths(
	netMinor: number,
	incomeMinor: number,
): number | null {
	return incomeMinor === 0 ? null : percentTenths(netMinor, incomeMinor);
}

// --- Budgets

/** What the Budgets line counts (BR-F08-08): rows over their limit, exactly at it, and
 * nearing it. */
export type BudgetCounts = { over: number; atLimit: number; near: number };

type StatedRow = { state: "ok" | "warning" | "over"; utilizationTenths: number };

/** F04's states by their rounded value (BR-F04-09): `over` above 1000 tenths, "at limit" at
 * exactly 1000 and `warning` ("near") from 800. */
export function budgetCounts(rows: readonly StatedRow[]): BudgetCounts {
	return {
		over: rows.filter(
			(row) => row.state === "over" && row.utilizationTenths > 1000,
		).length,
		atLimit: rows.filter(
			(row) => row.state === "over" && row.utilizationTenths === 1000,
		).length,
		near: rows.filter((row) => row.state === "warning").length,
	};
}

/** The Budgets widget's rows (BR-F08-09): the `limit` highest utilizations, ties by category
 * order. */
export function topBudgets<
	T extends { utilizationTenths: number; category: ExpenseCategory },
>(rows: readonly T[], limit = 5): T[] {
	return [...rows]
		.sort(
			(a, b) =>
				b.utilizationTenths - a.utilizationTenths
				|| categoryOrder(a.category) - categoryOrder(b.category),
		)
		.slice(0, limit);
}

/** The summary's Budgets line (BR-F08-08): "2 over, 1 at limit, 1 near limit", "All 4 within
 * limit" when none is flagged, "No Budgets" without any. `budgets` is how many there are. */
export function budgetsLine(counts: BudgetCounts, budgets: number): string {
	if (budgets === 0) return M.noBudgets;
	const parts = [
		counts.over > 0 ? `${counts.over} over` : "",
		counts.atLimit > 0 ? `${counts.atLimit} at limit` : "",
		counts.near > 0 ? `${counts.near} near limit` : "",
	].filter((part) => part !== "");
	return parts.length > 0 ? parts.join(", ") : `All ${budgets} within limit`;
}

// --- The day strip and Pace

/** A day of a month with its Out, as `daily` carries it (D-639). */
export type DailyOut = { date: string; outMinor: number };

/** The day strip's scale cap (BR-F08-30): 1.25 times the second-largest day's Out, a tie
 * counting as two days, so one large day does not flatten the rest. `null` with fewer than 2
 * days of Out above 0, when the scale is the largest day. */
export function stripCap(outs: readonly number[]): number | null {
	const positive = outs.filter((out) => out > 0).sort((a, b) => b - a);
	const second = positive[1];
	return second === undefined ? null : second * 1.25;
}

/** The days of `month` the strip cuts, and the days it draws below zero (BR-F08-30): a day whose
 * Out is above `cap`, and a day whose Out is below zero, a refund day. Oldest first. A `null`
 * cap cuts nothing. */
export function stripNotes(
	daily: readonly DailyOut[],
	month: Month,
	cap: number | null,
): { cut: string[]; refunds: string[] } {
	const days = daily
		.filter((entry) => entry.date.slice(0, 7) === month)
		.sort((a, b) => compareCodeUnits(a.date, b.date));
	return {
		cut: days
			.filter((entry) => cap !== null && entry.outMinor > cap)
			.map((entry) => entry.date),
		refunds: days
			.filter((entry) => entry.outMinor < 0)
			.map((entry) => entry.date),
	};
}

/**
 * The line under the day strip while no day is selected (BR-F08-30): "Select a day to see its
 * Transactions.", then a sentence for each cut day, "1 Oct is cut to fit.", and for each refund
 * day, "9 Oct is a refund, below zero.", cut days first, each group oldest first.
 */
export function stripHint(
	daily: readonly DailyOut[],
	month: Month,
	locale: Pick<FigureLocale, "dateLocale">,
): string {
	const { cut, refunds } = stripNotes(
		daily,
		month,
		stripCap(
			daily
				.filter((entry) => entry.date.slice(0, 7) === month)
				.map((entry) => entry.outMinor),
		),
	);
	const day = (date: string) => formatDayMonth(date, locale);
	return [
		M.selectDay,
		...cut.map((date) => `${day(date)} is cut to fit.`),
		...refunds.map((date) => `${day(date)} is a refund, below zero.`),
	].join(" ");
}

/** How many days `month` has. */
export function daysInMonth(month: Month): number {
	const [year, number] = month.split("-").map(Number) as [number, number];
	return new Date(Date.UTC(year, number, 0)).getUTCDate();
}

/** The running total of Out for each day from the 1st through `throughDay` of `month`
 * (BR-F08-29): index 0 is the 1st. Days with no entry add nothing; a refund subtracts. */
export function runningTotals(
	daily: readonly DailyOut[],
	month: Month,
	throughDay: number,
): number[] {
	const byDay = new Map<number, number>();
	for (const entry of daily) {
		if (entry.date.slice(0, 7) !== month) continue;
		const day = Number(entry.date.slice(8, 10));
		byDay.set(day, (byDay.get(day) ?? 0) + entry.outMinor);
	}
	let total = 0;
	return Array.from({ length: throughDay }, (_, index) => {
		total += byDay.get(index + 1) ?? 0;
		return total;
	});
}

/** The Pace view's figures for day `day` of `month` (BR-F08-31): its running total, and the
 * previous month's at the same day. A previous month shorter than `day` stays at its whole
 * total. */
export function paceAt(
	daily: readonly DailyOut[],
	month: Month,
	day: number,
): { currentMinor: number; previousMinor: number } {
	const previousMonth = shiftMonth(month, -1);
	const current = runningTotals(daily, month, day);
	const previous = runningTotals(daily, previousMonth, daysInMonth(previousMonth));
	return {
		currentMinor: current[day - 1] ?? 0,
		previousMinor: previous[Math.min(day, previous.length) - 1] ?? 0,
	};
}

export type FigureLocale = {
	currency: CurrencyCode;
	numberLocale: string;
	dateLocale: string;
};

const previousName = (month: Month, locale: FigureLocale) =>
	formatMonth(shiftMonth(month, -1), locale, "name");

/** The Pace sentence (BR-F08-31): "By day 31 you had spent ₹31,168.00, ₹3,119.00 more than by
 * the same day in September." */
export function paceSentence(
	{ day, month }: { day: number; month: Month },
	figures: { currentMinor: number; previousMinor: number },
	locale: FigureLocale,
): string {
	const money = (minor: number) =>
		formatMoney(minor, locale.currency, locale.numberLocale);
	const difference = figures.currentMinor - figures.previousMinor;
	const name = previousName(month, locale);
	const direction = difference > 0 ? "more" : "less";
	const tail =
		difference === 0 ?
			`the same as by the same day in ${name}`
		:	`${money(Math.abs(difference))} ${direction} than by the same day in ${name}`;
	return `By day ${day} you had spent ${money(figures.currentMinor)}, ${tail}.`;
}

/** The Pace chart's label (BR-F08-31): "Running total: ₹31,168.00 by day 31, against
 * ₹28,049.00 in September." */
export function paceLabel(
	{ day, month }: { day: number; month: Month },
	figures: { currentMinor: number; previousMinor: number },
	locale: FigureLocale,
): string {
	const money = (minor: number) =>
		formatMoney(minor, locale.currency, locale.numberLocale);
	return `Running total: ${money(figures.currentMinor)} by day ${day}, against ${money(figures.previousMinor)} in ${previousName(month, locale)}.`;
}

// --- The summary's words

/** "₹3,119.00 more than September (+11.1%)", "₹12,748.00 less than October (−40.9%)"
 * (BR-F08-07): the spending line. "—" when the previous month's Out is 0. */
export function spendingComparison(
	{ outMinor, previousOutMinor }: { outMinor: number; previousOutMinor: number },
	previousMonth: Month,
	locale: FigureLocale,
): string {
	if (previousOutMinor === 0) return "—";
	const name = formatMonth(previousMonth, locale, "name");
	const difference = outMinor - previousOutMinor;
	const money = formatMoney(
		Math.abs(difference),
		locale.currency,
		locale.numberLocale,
	);
	if (difference === 0) return `The same as ${name} (0.0%)`;
	const percent = formatPercent(
		difference,
		previousOutMinor,
		locale.numberLocale,
		{
			signDisplay: "always",
		},
	);
	return `${money} ${difference > 0 ? "more" : "less"} than ${name} (${percent})`;
}

/** "₹12,000.00 less than September", or "The same as September". */
function amountNote(
	currentMinor: number,
	previousMinor: number,
	previousMonth: Month,
	locale: FigureLocale,
): string {
	const name = formatMonth(previousMonth, locale, "name");
	const difference = currentMinor - previousMinor;
	if (difference === 0) return `The same as ${name}`;
	const money = formatMoney(
		Math.abs(difference),
		locale.currency,
		locale.numberLocale,
	);
	return `${money} ${difference > 0 ? "more" : "less"} than ${name}`;
}

/** "7.8 points lower", "1.0 points higher" (BR-F08-08): the change of the rate, tenths of a
 * percent, as points. */
function rateNote(
	currentTenths: number,
	previousTenths: number,
	numberLocale: string,
): string {
	const difference = currentTenths - previousTenths;
	if (difference === 0) return "No change";
	const points = new Intl.NumberFormat(numberLocale, {
		minimumFractionDigits: 1,
		maximumFractionDigits: 1,
	}).format(Math.abs(difference) / 10);
	return `${points} points ${difference > 0 ? "higher" : "lower"}`;
}

export type SummaryFigures = {
	incomeMinor: number;
	netMinor: number;
	rateTenths: number | null;
};

/** The note under Income: "No income yet", `null` without a previous month's income, or the
 * comparison. */
function incomeNote(
	current: SummaryFigures,
	previous: SummaryFigures,
	previousMonth: Month,
	locale: FigureLocale,
): string | null {
	if (current.incomeMinor === 0) return M.noIncomeYet;
	if (previous.incomeMinor === 0) return null;
	return amountNote(
		current.incomeMinor,
		previous.incomeMinor,
		previousMonth,
		locale,
	);
}

/** The note under Savings rate: "No income yet", `null` without a previous rate, or the
 * comparison. */
function ratePoints(
	current: SummaryFigures,
	previous: SummaryFigures,
	locale: FigureLocale,
): string | null {
	if (current.rateTenths === null) return M.noIncomeYet;
	if (previous.rateTenths === null) return null;
	return rateNote(current.rateTenths, previous.rateTenths, locale.numberLocale);
}

/**
 * The notes under Income, Net savings and Savings rate (BR-F08-08). Without income in the month
 * they read "No income yet" (income and rate) and "Below zero" (a negative net); a note that
 * needs a previous month with income is `null` when it had none. Net savings always compares.
 */
export function summaryNotes(
	current: SummaryFigures,
	previous: SummaryFigures,
	month: Month,
	locale: FigureLocale,
): { income: string | null; net: string | null; rate: string | null } {
	const previousMonth = shiftMonth(month, -1);
	const noIncome = current.incomeMinor === 0;
	return {
		income: incomeNote(current, previous, previousMonth, locale),
		net:
			noIncome && current.netMinor < 0 ?
				M.belowZero
			:	amountNote(current.netMinor, previous.netMinor, previousMonth, locale),
		rate: ratePoints(current, previous, locale),
	};
}
