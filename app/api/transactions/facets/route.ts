import { route } from "@/server/api/route";
import { requireProfile } from "@/server/dal/context";
import { facetCounts } from "@/server/dal/transactions/facets";
import { LIST_PARAMS, readFilterQuery } from "@/server/dal/transactions/query";

/** The filter counts (F03 section 11, BR-F03-59). They hold no money, so no `currency`. */
export const GET = route({}, async (ctx, tx, { query }) => {
	const profiled = requireProfile(ctx);
	const filter = readFilterQuery(query, profiled.profile.currency, LIST_PARAMS);
	return facetCounts(tx, profiled, filter);
});
