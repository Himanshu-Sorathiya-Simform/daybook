import {
	type Month,
	monthOf,
	monthsFrom,
	monthsStarting,
	shiftMonth,
} from "@/lib/budgets/months";
import type { MonthView } from "@/lib/budgets/view";
import type { CurrencyCode } from "@/lib/currency";
import { compareCodeUnits } from "@/lib/compare";
import type { NextRenewal } from "@/lib/subscriptions/answers";
import type { GroupTotal } from "@/lib/transactions/answers";
import type { Transaction } from "@/lib/transactions/model";

import type { DashboardAnswer } from "./answers";
import {
	budgetCounts,
	changeTenths,
	savingsRateTenths,
	topBudgets,
} from "./figures";

/** What the data access layer reads for one dashboard month (F08 BR-F08-03), as plain figures,
 * so the answer is assembled by one pure function the tests can run without a database. */
export type DashboardInput = {
	month: Month;
	/** The profile's date, `YYYY-MM-DD`. */
	today: string;
	currency: CurrencyCode;
	/** TXN-5's figures for the month and the one before. */
	totals: { current: TotalsFigures; previous: TotalsFigures };
	/** The month's expense and refund rows by category. */
	categories: readonly GroupFigures[];
	/** The days of both months with expense and refund rows. */
	days: readonly GroupFigures[];
	/** Every month with rows, from all time. */
	months: readonly GroupFigures[];
	/** The earliest and latest `occurredOn`, or `null` without rows. */
	bounds: { firstOn: string; lastOn: string } | null;
	budgets: MonthView;
	subscriptions: {
		monthlyMinor: number;
		yearlyMinor: number;
		count: number;
		upcoming: NextRenewal[];
	};
	recent: { items: Transaction[]; groups: GroupTotal[] };
	accountEmpty: boolean;
};

export type TotalsFigures = {
	incomeMinor: number;
	spendingMinor: number;
	toGoalsMinor: number;
	netMinor: number;
};

export type GroupFigures = {
	key: string;
	incomeMinor: number;
	spendingMinor: number;
};

/** The dashboard's answer (F08 section 15): every figure from the owning functions' results,
 * with the comparisons and series the page needs worked out once, here. Goals and the portfolio
 * are placeholders until F06 and F07 are built (D-640). */
export function buildDashboard(input: DashboardInput): DashboardAnswer {
	const { month, totals, budgets } = input;
	const current = input.today.slice(0, 7);
	const first = input.bounds ? monthOf(input.bounds.firstOn) : current;
	const earliestMonth = first > current ? current : first;
	const { current: now, previous } = totals;

	const outByMonth = new Map(
		input.months.map((group) => [group.key, group] as const),
	);
	const spentIn = (key: string) => outByMonth.get(key)?.spendingMinor ?? 0;
	const incomeIn = (key: string) => outByMonth.get(key)?.incomeMinor ?? 0;

	return {
		month,
		partial: month === current,
		earliestMonth,
		accountEmpty: input.accountEmpty,
		currency: input.currency,
		spending: {
			outMinor: now.spendingMinor,
			previousOutMinor: previous.spendingMinor,
			deltaMinor: now.spendingMinor - previous.spendingMinor,
			deltaTenths: changeTenths(now.spendingMinor, previous.spendingMinor),
		},
		savings: {
			incomeMinor: now.incomeMinor,
			outMinor: now.spendingMinor,
			netMinor: now.netMinor,
			toGoalsMinor: now.toGoalsMinor,
			unallocatedMinor: now.netMinor - now.toGoalsMinor,
			rateTenths: savingsRateTenths(now.netMinor, now.incomeMinor),
			previous: {
				incomeMinor: previous.incomeMinor,
				netMinor: previous.netMinor,
				rateTenths: savingsRateTenths(
					previous.netMinor,
					previous.incomeMinor,
				),
			},
		},
		daily: input.days
			.filter((group) => group.spendingMinor !== 0)
			.map((group) => ({ date: group.key, outMinor: group.spendingMinor }))
			.sort((a, b) => compareCodeUnits(a.date, b.date)),
		months: monthsStarting(
			earliestMonth,
			monthsFrom(earliestMonth, current) + 1,
		).map((each) => ({ month: each, outMinor: spentIn(each) })),
		budgets: {
			overall: budgets.overall,
			summary: budgetCounts(budgets.budgets),
			count: budgets.budgets.length,
			top: topBudgets(budgets.budgets).map((row) => ({
				category: row.category,
				limitMinor: row.limitMinor,
				spentMinor: row.spentMinor,
				utilizationTenths: row.utilizationTenths,
				state: row.state,
			})),
			unbudgeted: budgets.unbudgeted.map((row) => ({
				category: row.category,
				outMinor: row.spentMinor,
			})),
		},
		categories: input.categories
			.filter((group) => group.spendingMinor !== 0)
			.map((group) => ({ category: group.key, outMinor: group.spendingMinor }))
			.sort(
				(a, b) =>
					b.outMinor - a.outMinor
					|| compareCodeUnits(a.category, b.category),
			),
		incomeExpenses: monthsStarting(shiftMonth(month, -11), 12).map((each) => ({
			month: each,
			incomeMinor: incomeIn(each),
			outMinor: spentIn(each),
		})),
		// TODO(F06): goalProgress's Goals, with each Goal's lock.
		goals: [],
		subscriptions: input.subscriptions,
		// TODO(F07): loadPortfolio's figures and series.
		investments: null,
		recent: input.recent,
	};
}
