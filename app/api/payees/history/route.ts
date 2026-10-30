import { route } from "@/server/api/route";
import { requireProfile } from "@/server/dal/context";
import { payeeHistory } from "@/server/dal/transactions/payees";
import { readHistoryQuery } from "@/server/dal/transactions/query";

/** One payee's recent rows (F03 section 11, BR-F03-62), with the profile currency (API-6). */
export const GET = route({}, async (ctx, tx, { query }) => {
	const profiled = requireProfile(ctx);
	const { payee, months } = readHistoryQuery(query);
	return {
		...(await payeeHistory(tx, profiled, payee, months)),
		currency: profiled.profile.currency,
	};
});
