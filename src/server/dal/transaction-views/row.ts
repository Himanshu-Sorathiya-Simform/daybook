import "server-only";
import { sql } from "drizzle-orm";
import { type SavedView, VIEW_MESSAGES } from "@/lib/transactions/views";
import { ApiError, databaseErrorOf } from "../../api/errors";
import { iso } from "../transactions/row";
import type { Tx } from "../with-user";

/** A row of `app.transaction_views` as the API's saved view (F03 section 3, D-452), built in
 * SQL as JSON. The filter is stored normalized, so it is answered as stored. */
export const VIEW_JSON = sql.raw(`json_build_object(
	'id', id, 'name', name, 'filter', filter, 'sort', sort, 'dir', dir, 'group', group_by,
	'version', version, 'createdAt', ${iso("created_at")}, 'updatedAt', ${iso("updated_at")})`);

/** One of the user's views by `id`, a UUID its caller has checked, or `null`. RLS hides other
 * users' views. */
export async function getView(tx: Tx, id: string): Promise<SavedView | null> {
	const { rows } = await tx.execute<{ view: SavedView }>(
		sql`SELECT ${VIEW_JSON} AS view FROM app.transaction_views WHERE id = ${id}::uuid`,
	);
	return rows[0]?.view ?? null;
}

const NAME_INDEX = "transaction_views_user_id_name_key";

/** Runs a view write, turning the unique name index's refusal into 422 `validation_failed` on
 * `name` (BR-F03-63, D-488). The index decides, so two writes racing for a name get it too. */
export async function withUniqueName<T>(write: () => Promise<T>): Promise<T> {
	try {
		return await write();
	} catch (error) {
		if (databaseErrorOf(error)?.constraint === NAME_INDEX) {
			throw new ApiError("validation_failed", {
				fields: { name: VIEW_MESSAGES.nameTaken },
				cause: error,
			});
		}
		throw error;
	}
}
