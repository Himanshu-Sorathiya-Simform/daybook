import { route } from "@/server/api/route";
import { requireProfile } from "@/server/dal/context";
import { listTransactions } from "@/server/dal/transactions/list";
import { readListQuery } from "@/server/dal/transactions/query";

/** The Transactions list (F03 section 11): one page, its group totals and order fingerprint,
 * and the profile currency (API-6). */
export const GET = route({}, async (ctx, tx, { query }) => {
	const profiled = requireProfile(ctx);
	const { currency } = profiled.profile;
	const { filter, list, limit, cursor } = readListQuery(query, currency);
	const page = await listTransactions(tx, profiled, filter, {
		...list,
		limit,
		cursor,
	});
	return { ...page, currency };
});
