import "server-only";
import { ApiError } from "../../api/errors";
import type { ProfiledContext } from "../context";
import type { Tx } from "../with-user";
import { getView } from "./row";

/** The refusal for a versioned view edit or delete that matched no row (BR-P2-21, BR-F03-69,
 * D-489): the view is re-read under RLS. It exists, so 409 `version_conflict` with it and the
 * profile currency in `details.current`, as the list answers it; or it does not, so 404. */
export async function viewMismatch(
	tx: Tx,
	ctx: ProfiledContext,
	id: string,
): Promise<ApiError> {
	const current = await getView(tx, id);
	return current ?
			new ApiError("version_conflict", {
				details: { current: { ...current, currency: ctx.profile.currency } },
			})
		:	new ApiError("not_found");
}
