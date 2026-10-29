import "server-only";
import { sql } from "drizzle-orm";
import { isUuid } from "@/lib/ids";
import { ApiError } from "../../api/errors";
import type { ProfiledContext } from "../context";
import { lockCurrency } from "../currency";
import type { Tx } from "../with-user";
import { versionMismatch } from "./conflict";

/**
 * Deletes one of the user's Transactions at `If-Match` `version`, in section 11's check order
 * cut to M1 (D-487): the profile lock (step 3, BR-F03-05), then the versioned delete (7). M1
 * has no Goal rows and no linked charges, so steps 5, 6 and 8 have nothing to do, and the
 * handler needs no first read. A delete that matches nothing gets 409 with the current row, or
 * 404 (BR-F03-25). An id that is not a UUID is 404 before any statement (D-479).
 */
export async function deleteTransaction(
	tx: Tx,
	ctx: ProfiledContext,
	id: string,
	version: number,
): Promise<void> {
	if (!isUuid(id)) throw new ApiError("not_found");
	await lockCurrency(tx);
	const { rows } = await tx.execute(
		sql`DELETE FROM app.transactions WHERE id = ${id}::uuid AND version = ${version}
		RETURNING id`,
	);
	if (rows.length === 0) throw await versionMismatch(tx, ctx, id);
}
