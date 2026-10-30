import { route } from "@/server/api/route";
import { requireProfile } from "@/server/dal/context";
import { amountHistogram } from "@/server/dal/transactions/histogram";
import { HISTOGRAM_IGNORES, readFilterQuery } from "@/server/dal/transactions/query";

/** The amount histogram (F03 section 11, BR-F03-60), with the profile currency of its edges
 * (API-6). `min` and `max` are ignored, valid or not (D-478). */
export const GET = route({}, async (ctx, tx, { query }) => {
	const profiled = requireProfile(ctx);
	const { currency } = profiled.profile;
	const filter = readFilterQuery(query, currency, HISTOGRAM_IGNORES);
	return { ...(await amountHistogram(tx, profiled, filter)), currency };
});
