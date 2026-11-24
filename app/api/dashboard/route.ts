import { route } from "@/server/api/route";
import { requireProfile } from "@/server/dal/context";
import { dashboardData } from "@/server/dal/dashboard/read";
import { readDashboardQuery } from "@/server/dal/dashboard/query";

/** One month of the dashboard: the summary and every widget's figures, from the owning
 * features' shared functions in one transaction (F08 BR-F08-03). `month` is the current month
 * by default. */
export const GET = route({}, (ctx, tx, { query }) => {
	const profiled = requireProfile(ctx);
	return dashboardData(tx, profiled, readDashboardQuery(query, profiled.today));
});
