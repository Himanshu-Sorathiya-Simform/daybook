import "server-only";
import { ApiError } from "../../api/errors";
import type { ProfiledContext } from "../context";
import type { Tx } from "../with-user";
import { getTransaction } from "./get";

/** The refusal for a versioned edit or delete that matched no row (BR-P2-21, D-485): the row
 * is re-read under RLS. It exists, so 409 `version_conflict` with it and the profile currency
 * in `details.current`, as `GET /api/transactions/[id]` answers it; or it does not, so 404. */
export async function versionMismatch(
	tx: Tx,
	ctx: ProfiledContext,
	id: string,
): Promise<ApiError> {
	const current = await getTransaction(tx, id);
	return current ?
			new ApiError("version_conflict", {
				details: { current: { ...current, currency: ctx.profile.currency } },
			})
		:	new ApiError("not_found");
}
