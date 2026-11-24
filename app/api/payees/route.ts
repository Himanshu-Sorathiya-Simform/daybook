import { route } from "@/server/api/route";
import { requireProfile } from "@/server/dal/context";
import { listPayees } from "@/server/dal/transactions/payees";
import { readPayeesQuery } from "@/server/dal/transactions/query";

/** The payee suggestions, or a search of them with `q` (F03 section 11, BR-F03-44,
 * BR-F03-61), with the profile currency since `lastExpense` holds money (API-6, D-451). */
export const GET = route({}, async (ctx, tx, { query }) => {
	const profiled = requireProfile(ctx);
	return {
		...(await listPayees(tx, profiled, readPayeesQuery(query))),
		currency: profiled.profile.currency,
	};
});
