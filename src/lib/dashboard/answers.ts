import type { Month } from "@/lib/budgets/months";
import type { BudgetState, ExpenseCategory } from "@/lib/budgets/model";
import type { CurrencyCode } from "@/lib/currency";
import type { GroupTotal } from "@/lib/transactions/answers";
import type { Transaction } from "@/lib/transactions/model";
import type { NextRenewal } from "@/lib/subscriptions/answers";

import type { BudgetCounts, DailyOut } from "./figures";

/** `GET /api/dashboard?month=` (F08 section 15). Every money figure is an integer in the
 * currency's smallest unit (MON-1); `…Tenths` figures are tenths of a percent. Pending changes
 * never appear: the client adds them (D-639). */
export type DashboardAnswer = {
	month: Month;
	/** The month is the current one, so its figures are "to date" (PER-3). */
	partial: boolean;
	/** The month of the earliest confirmed Transaction, or the current month without one. */
	earliestMonth: Month;
	accountEmpty: boolean;
	currency: CurrencyCode;
	spending: {
		outMinor: number;
		previousOutMinor: number;
		deltaMinor: number;
		/** `null` when the previous month's Out is 0. */
		deltaTenths: number | null;
	};
	savings: {
		incomeMinor: number;
		outMinor: number;
		netMinor: number;
		toGoalsMinor: number;
		unallocatedMinor: number;
		/** `null` without income. */
		rateTenths: number | null;
		previous: {
			incomeMinor: number;
			netMinor: number;
			rateTenths: number | null;
		};
	};
	/** The days of the previous month and the month whose Out is not 0, oldest first. */
	daily: DailyOut[];
	/** Out for each month from `earliestMonth` to the current month, for the month menu. */
	months: { month: Month; outMinor: number }[];
	budgets: {
		overall: {
			limitMinor: number;
			spentMinor: number;
			utilizationTenths: number | null;
			state: BudgetState | null;
		};
		summary: BudgetCounts;
		/** How many Budgets the month has: the Budgets line's "All 4 within limit". */
		count: number;
		top: {
			category: ExpenseCategory;
			limitMinor: number;
			spentMinor: number;
			utilizationTenths: number;
			state: BudgetState;
		}[];
		/** Categories with spending and no Budget, largest first. */
		unbudgeted: { category: ExpenseCategory; outMinor: number }[];
	};
	/** Out for each category with spending in the month, largest first; a negative one stays
	 * negative here, and the page draws it at zero (D-185). */
	categories: { category: string; outMinor: number }[];
	/** The 12 months ending at `month`. */
	incomeExpenses: { month: Month; incomeMinor: number; outMinor: number }[];
	/** F06's Goal progress. Empty until F06 is built (D-640). */
	goals: DashboardGoal[];
	subscriptions: {
		monthlyMinor: number;
		yearlyMinor: number;
		count: number;
		upcoming: NextRenewal[];
	};
	/** F07's figures. `null` until F07 is built (D-640). */
	investments: DashboardInvestments | null;
	/** The month's 8 newest Transactions in list order, with their days' totals. */
	recent: { items: Transaction[]; groups: GroupTotal[] };
};

export type DashboardGoal = {
	id: string;
	name: string;
	progressMinor: number;
	targetMinor: number;
	percentTenths: number;
	requiredMonthlyMinor: number | null;
	requiredStatus: string;
	locked: boolean;
};

export type DashboardInvestments = {
	valueMinor: number;
	changeMinor: number;
	twrTenths: number | null;
	asOfPriceDate: string;
	series: { date: string; valueMinor: number }[];
};
