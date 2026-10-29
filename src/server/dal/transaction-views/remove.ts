import "server-only";
import { sql } from "drizzle-orm";
import { isUuid } from "@/lib/ids";
import { ApiError } from "../../api/errors";
import type { ProfiledContext } from "../context";
import type { Tx } from "../with-user";
import { viewMismatch } from "./conflict";

/** Deletes one of the user's saved views at `If-Match` `version` (BR-F03-69, D-489), in one
 * statement: a view is not a finance row, so no profile lock. A delete that matches nothing
 * gets 409 with the current view, or 404, which the client counts as done. An id that is not
 * a UUID is 404 before any statement. */
export async function deleteView(
	tx: Tx,
	ctx: ProfiledContext,
	id: string,
	version: number,
): Promise<void> {
	if (!isUuid(id)) throw new ApiError("not_found");
	const { rows } = await tx.execute(
		sql`DELETE FROM app.transaction_views WHERE id = ${id}::uuid AND version = ${version}
		RETURNING id`,
	);
	if (rows.length === 0) throw await viewMismatch(tx, ctx, id);
}
