import "server-only";
import { type SQL, sql } from "drizzle-orm";
import {
	firstDayOf,
	lastDayOf,
	type Month,
	monthsStarting,
	shiftMonth,
} from "@/lib/budgets/months";
import {
	buildMonthView,
	type CategorySpending,
	type MonthView,
} from "@/lib/budgets/view";
import type { ExpenseCategory } from "@/lib/budgets/model";
import { compareCodeUnits } from "@/lib/compare";
import type { CurrencyCode } from "@/lib/currency";
import { safeInt } from "../../db/safe-int";
import type { ProfiledContext } from "../context";
import type { Tx } from "../with-user";
import { BUDGET_JSON, type Budget } from "./row";

/** Category spending (TXN-5) per month: expenses minus refunds, by `occurred_on` (TIME-2). The
 * table holds confirmed rows only; pending ones live in the client's queue (TXN-6). Goal
 * Transactions have no category and are left out by type. */
function spendingSql(first: Month, last: Month): SQL {
	return sql`(SELECT coalesce(json_agg(json_build_object(
			'month', month, 'category', category, 'spentMinor', spent::text)), '[]'::json)
		FROM (SELECT to_char(occurred_on, 'YYYY-MM') AS month, category,
				sum(CASE type WHEN 'expense' THEN amount_minor ELSE -amount_minor END) AS spent
			FROM app.transactions
			WHERE type IN ('expense', 'refund')
				AND occurred_on BETWEEN ${firstDayOf(first)}::date AND ${lastDayOf(last)}::date
			GROUP BY 1, 2) AS s)`;
}

const BUDGETS_SQL = sql`(SELECT coalesce(json_agg(${BUDGET_JSON} ORDER BY category), '[]'::json)
	FROM app.budgets)`;

type SpendingJson = {
	month: Month;
	category: ExpenseCategory;
	spentMinor: string;
}[];

/** Spending by month, then by category, read through `safeInt` (MON-6). */
function bySpendingMonth(rows: SpendingJson): Map<Month, CategorySpending> {
	const months = new Map<Month, CategorySpending>();
	for (const { month, category, spentMinor } of rows) {
		const spending = months.get(month) ?? {};
		spending[category] = safeInt(spentMinor);
		months.set(month, spending);
	}
	return months;
}

/** The earliest and latest of `months`. */
function span(months: readonly Month[]): { first: Month; last: Month } {
	const sorted = [...months].sort(compareCodeUnits);
	return { first: sorted[0] as Month, last: sorted.at(-1) as Month };
}

/** The user's Budgets and the spending of every month from `first` to `last`, in one
 * statement. */
async function readInputs(
	tx: Tx,
	first: Month,
	last: Month,
): Promise<{ budgets: Budget[]; spending: Map<Month, CategorySpending> }> {
	const { rows } = await tx.execute<{ budgets: Budget[]; spending: SpendingJson }>(
		sql`SELECT ${BUDGETS_SQL} AS budgets, ${spendingSql(first, last)} AS spending`,
	);
	// A SELECT without FROM always answers one row.
	const [row] = rows as [{ budgets: Budget[]; spending: SpendingJson }];
	return { budgets: row.budgets, spending: bySpendingMonth(row.spending) };
}

/** A month view with the profile currency, as `GET /api/budgets` answers it (API-6). */
export type BudgetMonthAnswer = MonthView & { currency: CurrencyCode };

/**
 * F04's month view for each of `months` (section 3, BR-F04-34), in one statement (D-293): the
 * user's Budgets, and the category spending from the month before the first to the last. The
 * shared `buildMonthView` computes every figure, so F08, F09, F10 and F11 agree with the page.
 */
export async function budgetMonths(
	tx: Tx,
	ctx: ProfiledContext,
	months: readonly Month[],
): Promise<BudgetMonthAnswer[]> {
	if (months.length === 0) return [];
	const { first, last } = span(months);
	const { budgets, spending } = await readInputs(tx, shiftMonth(first, -1), last);
	return months.map((month) => ({
		...buildMonthView({
			month,
			budgets,
			spending: spending.get(month) ?? {},
			previousSpending: spending.get(shiftMonth(month, -1)) ?? {},
		}),
		currency: ctx.profile.currency,
	}));
}

/** F04's month view for `month`, in one statement (F04 section 11). */
export async function budgetMonth(
	tx: Tx,
	ctx: ProfiledContext,
	month: Month,
): Promise<BudgetMonthAnswer> {
	const [view] = await budgetMonths(tx, ctx, [month]);
	return view as BudgetMonthAnswer;
}

export type BudgetHistory = {
	category: ExpenseCategory;
	currency: CurrencyCode;
	months: { month: Month; limitMinor: number | null; spentMinor: number }[];
};

/**
 * `GET /api/budgets/history` (BR-F04-35): the `count` months ending at `to`, oldest first,
 * each with the category's limit (`null` without one) and its spending, read from the month
 * views of `budgetMonths`, so they match the page. A category with no Budget record answers
 * its spending with no limits. One statement.
 */
export async function budgetHistory(
	tx: Tx,
	ctx: ProfiledContext,
	{ category, to, count }: { category: ExpenseCategory; to: Month; count: number },
): Promise<BudgetHistory> {
	const views = await budgetMonths(
		tx,
		ctx,
		monthsStarting(shiftMonth(to, 1 - count), count),
	);
	return {
		category,
		currency: ctx.profile.currency,
		months: views.map((view) => {
			const row = view.budgets.find((each) => each.category === category);
			const unbudgeted = view.unbudgeted.find(
				(each) => each.category === category,
			);
			return {
				month: view.month,
				limitMinor: row?.limitMinor ?? null,
				spentMinor: row?.spentMinor ?? unbudgeted?.spentMinor ?? 0,
			};
		}),
	};
}

export type BudgetYearSummary = {
	year: number;
	months: { month: Month; utilizationTenths: number | null }[];
};

/** `GET /api/budgets/summary` (BR-F04-35): each month of `year` with the overall utilization
 * of its month view from `budgetMonths`, `null` in a month with no Budget. One statement. */
export async function budgetYearSummary(
	tx: Tx,
	ctx: ProfiledContext,
	year: number,
): Promise<BudgetYearSummary> {
	const first = `${String(year).padStart(4, "0")}-01`;
	const views = await budgetMonths(tx, ctx, monthsStarting(first, 12));
	return {
		year,
		months: views.map((view) => ({
			month: view.month,
			utilizationTenths: view.overall.utilizationTenths,
		})),
	};
}
