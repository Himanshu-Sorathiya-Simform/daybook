import { monthOf } from "@/lib/budgets/months";
import { route } from "@/server/api/route";
import { readHistoryQuery } from "@/server/dal/budgets/query";
import { budgetHistory } from "@/server/dal/budgets/read";
import { requireProfile } from "@/server/dal/context";

/** One category's limit and spending month by month, for the panel's last 6 months and the
 * change preview (BR-F04-35), with the profile currency. */
export const GET = route({}, (ctx, tx, { query }) => {
	const profiled = requireProfile(ctx);
	return budgetHistory(
		tx,
		profiled,
		readHistoryQuery(query, monthOf(profiled.today)),
	);
});
