import { route } from "@/server/api/route";
import { requireProfile } from "@/server/dal/context";
import { listPayees } from "@/server/dal/transactions/payees";
import { readPayeesQuery } from "@/server/dal/transactions/query";

/** The payee suggestions, or a search of them with `q` (F03 section 11, BR-F03-44,
 * BR-F03-61). They hold no money, so no `currency`. */
export const GET = route({}, async (ctx, tx, { query }) =>
	listPayees(tx, requireProfile(ctx), readPayeesQuery(query)),
);
