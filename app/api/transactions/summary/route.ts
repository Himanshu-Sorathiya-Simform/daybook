import { route } from "@/server/api/route";
import { requireProfile } from "@/server/dal/context";
import { readSummaryQuery } from "@/server/dal/transactions/query";
import { transactionSummary } from "@/server/dal/transactions/summary";

/** The header totals, date span and breakdowns for a filter (F03 section 11, BR-F03-41,
 * BR-F03-58), with the profile currency (API-6). */
export const GET = route({}, async (ctx, tx, { query }) => {
	const profiled = requireProfile(ctx);
	const { currency } = profiled.profile;
	const { filter, by } = readSummaryQuery(query, currency);
	return { ...(await transactionSummary(tx, profiled, filter, by)), currency };
});
