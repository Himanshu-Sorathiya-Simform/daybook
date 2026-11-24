import "server-only";
import { firstDayOf, lastDayOf, type Month, shiftMonth } from "@/lib/budgets/months";
import { buildDashboard } from "@/lib/dashboard/build";
import type { DashboardAnswer } from "@/lib/dashboard/answers";
import type { TransactionFilter } from "@/lib/transactions/url";
import { accountEmpty } from "../account-empty";
import { budgetMonth } from "../budgets/read";
import type { ProfiledContext } from "../context";
import { subscriptionSummary } from "../subscriptions/read";
import { listTransactions } from "../transactions/list";
import { rollup } from "../transactions/rollup";
import type { Tx } from "../with-user";

/** The recent Transactions the widget lists (BR-F08-16). */
export const RECENT_ROWS = 8;

/**
 * `GET /api/dashboard?month=` (F08 BR-F08-03): every figure the summary and the widgets need,
 * from the owning features' shared functions, in the request's one transaction, so the
 * dashboard, the list and the reports cannot disagree. The statement budget is 8 (BR-F08-04):
 * `rollup` (every Transaction figure, in one), `listTransactions`, `budgetMonth`,
 * `subscriptionSummary` and `accountEmpty` now, and F06's Goals and F07's portfolio when they
 * are built (D-640).
 */
export async function dashboardData(
	tx: Tx,
	ctx: ProfiledContext,
	month: Month,
): Promise<DashboardAnswer> {
	const before = shiftMonth(month, -1);
	const range = (from: Month, to: Month): TransactionFilter => ({
		from: firstDayOf(from),
		to: lastDayOf(to),
	});
	const outOnly: TransactionFilter["type"] = ["expense", "refund"];

	const [current, previous, categories, days, months, bounds] = await rollup(
		tx,
		ctx,
		[
			{ filter: range(month, month), by: "total" },
			{ filter: range(before, before), by: "total" },
			{ filter: { ...range(month, month), type: outOnly }, by: "category" },
			{ filter: { ...range(before, month), type: outOnly }, by: "day" },
			{ filter: {}, by: "month" },
			{ filter: {}, by: "bounds" },
		] as const,
	);
	const recent = await listTransactions(tx, ctx, range(month, month), {
		sort: "date",
		dir: "desc",
		group: "day",
		limit: RECENT_ROWS,
	});
	const budgets = await budgetMonth(tx, ctx, month);
	const subscriptions = await subscriptionSummary(tx, ctx);
	const empty = await accountEmpty(tx);

	return buildDashboard({
		month,
		today: ctx.today,
		currency: ctx.profile.currency,
		totals: { current, previous },
		categories,
		days,
		months,
		bounds,
		budgets,
		subscriptions,
		recent: { items: recent.items, groups: recent.groups },
		accountEmpty: empty,
	});
}
