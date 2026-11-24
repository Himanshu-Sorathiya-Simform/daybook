import { formatMonth } from "@/lib/date-format";
import { monthOf } from "@/lib/budgets/months";
import { type Formats, money } from "./labels";
import type { SubscriptionList } from "./types";

/** The summary's fixed words (BR-F05-21). */
export const SUMMARY_TEXT = {
	monthlyCost: "Monthly cost",
	charged: "Charged",
	stillToCome: "Still to come",
	nextThirtyDays: "Next 30 days",
} as const;

/** "1 Subscription", "4 Subscriptions" (BR-F05-21). */
export function subscriptionCount(count: number): string {
	return `${count} ${count === 1 ? "Subscription" : "Subscriptions"}`;
}

/** "1 charge", "3 charges" (BR-F05-21). */
export function chargeCount(count: number): string {
	return `${count} ${count === 1 ? "charge" : "charges"}`;
}

/** Everything the summary writes (BR-F05-21), ready to draw. */
export type SummaryFigures = {
	/** The monthly total, for the readout (BR-F05-17). */
	monthlyMinor: number;
	/** "₹2,43,287.00 a year · 4 Subscriptions". */
	yearlyLine: string;
	/** The current month's name, "November". */
	monthName: string;
	/** "₹20,149.00 in all". */
	inAll: string;
	/** The charged part of the month's bar, from 0 to 100. */
	chargedPercent: number;
	/** "Charged ₹18,000.00". */
	charged: string;
	/** "Still to come ₹2,149.00". */
	stillToCome: string;
	/** "Next 30 days · 3 charges". */
	nextTitle: string;
	/** "₹20,149.00". */
	nextTotal: string;
};

/**
 * The summary's words and figures from the list (BR-F05-21): the monthly cost, the yearly cost
 * and the count of Subscriptions that have a next due date (BR-F05-17), this month's charged and
 * still to come with the bar's split (BR-F05-18), and the next 30 days (BR-F05-20). A month with
 * nothing charged or to come draws an empty bar.
 */
export function summaryFigures(
	list: Pick<
		SubscriptionList,
		"totals" | "thisMonth" | "upcoming" | "upcomingTotalMinor"
	>,
	f: Formats,
): SummaryFigures {
	const { totals, thisMonth, upcoming } = list;
	const all = thisMonth.chargedMinor + thisMonth.toComeMinor;
	const share = all > 0 ? (thisMonth.chargedMinor / all) * 100 : 0;
	return {
		monthlyMinor: totals.monthlyMinor,
		yearlyLine: `${money(totals.yearlyMinor, f)} a year · ${subscriptionCount(totals.count)}`,
		monthName: formatMonth(monthOf(f.today), f, "name"),
		inAll: `${money(all, f)} in all`,
		chargedPercent: Math.min(100, Math.max(0, share)),
		charged: `${SUMMARY_TEXT.charged} ${money(thisMonth.chargedMinor, f)}`,
		stillToCome: `${SUMMARY_TEXT.stillToCome} ${money(thisMonth.toComeMinor, f)}`,
		nextTitle: `${SUMMARY_TEXT.nextThirtyDays} · ${chargeCount(upcoming.length)}`,
		nextTotal: money(list.upcomingTotalMinor, f),
	};
}
