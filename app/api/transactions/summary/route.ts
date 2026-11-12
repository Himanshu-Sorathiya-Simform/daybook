import { route } from "@/server/api/route";
import { requireProfile } from "@/server/dal/context";
import { summaryAnswer } from "@/server/dal/transactions/answers";
import { readSummaryQuery } from "@/server/dal/transactions/query";

/** The header totals, date span and breakdowns for a filter (F03 section 11, BR-F03-41,
 * BR-F03-58), with the profile currency (API-6). */
export const GET = route({}, (ctx, tx, { query }) => {
	const profiled = requireProfile(ctx);
	return summaryAnswer(
		tx,
		profiled,
		readSummaryQuery(query, profiled.profile.currency),
	);
});
