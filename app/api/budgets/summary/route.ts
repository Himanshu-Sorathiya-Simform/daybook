import { monthOf } from "@/lib/budgets/months";
import { route } from "@/server/api/route";
import { readSummaryQuery } from "@/server/dal/budgets/query";
import { budgetYearSummary } from "@/server/dal/budgets/read";
import { requireProfile } from "@/server/dal/context";

/** Each month of a year with its overall utilization, for the month grid (BR-F04-35). */
export const GET = route({}, (ctx, tx, { query }) => {
	const profiled = requireProfile(ctx);
	return budgetYearSummary(
		tx,
		profiled,
		readSummaryQuery(query, monthOf(profiled.today)),
	);
});
