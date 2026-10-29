import { ApiError } from "@/server/api/errors";
import { route } from "@/server/api/route";
import { requireProfile } from "@/server/dal/context";
import { getTransaction } from "@/server/dal/transactions/get";

/** One Transaction (F03 section 11, BR-F03-53), with the profile currency (API-6, D-479).
 * Missing, another user's, or not a UUID: 404. */
export const GET = route({}, async (ctx, tx, { params }) => {
	const { currency } = requireProfile(ctx).profile;
	const id = params["id"];
	const row = typeof id === "string" ? await getTransaction(tx, id) : null;
	if (!row) throw new ApiError("not_found");
	return { ...row, currency };
});
