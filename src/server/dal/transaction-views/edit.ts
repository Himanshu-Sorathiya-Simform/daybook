import "server-only";
import { type SQL, sql } from "drizzle-orm";
import { isUuid } from "@/lib/ids";
import { type SavedView, viewEditSchema } from "@/lib/transactions/views";
import { ApiError, fromZodError } from "../../api/errors";
import type { ProfiledContext } from "../context";
import { requireCurrency } from "../currency";
import type { Tx } from "../with-user";
import { viewMismatch } from "./conflict";
import { VIEW_JSON, withUniqueName } from "./row";

type ViewEditBody = ReturnType<ReturnType<typeof viewEditSchema>["parse"]>;

/** `SET` for the sent fields, the filter as JSON and `group` as `group_by`, with `version`
 * raised by one and `updated_at` the request clock (BR-P2-21, BR-P2-43). The schema has made
 * the four list fields arrive together or not at all (BR-F03-68). */
function setClause(ctx: ProfiledContext, body: ViewEditBody): SQL {
	const sets: SQL[] = [];
	if (body.name !== undefined) sets.push(sql`name = ${body.name}`);
	if (body.filter !== undefined) {
		sets.push(
			sql`filter = ${JSON.stringify(body.filter)}::jsonb`,
			sql`sort = ${body.sort}`,
			sql`dir = ${body.dir}`,
			sql`group_by = ${body.group}`,
		);
	}
	sets.push(
		sql`version = version + 1`,
		sql`updated_at = ${ctx.now.toISOString()}`,
	);
	return sql.join(sets, sql`, `);
}

/**
 * Renames or updates one of the user's saved views at `If-Match` `version` (BR-F03-68,
 * BR-F03-69; D-488, D-489):
 * 1. An id that is not a UUID is 404 before any statement.
 * 2. The body, against the profile currency's schema: `{ name }`, the filter, sort, direction
 *    and group together, or both (BR-F03-64). 422 with field paths otherwise.
 * 3. A sent `currency` locks the profile and must match it (BR-F03-05): `currency_mismatch`.
 * 4. The versioned update, with no first read: a view has no merged-row rules. A taken name
 *    gets 422 on `name`. When nothing matches, 409 with the current view, or 404.
 */
export async function editView(
	tx: Tx,
	ctx: ProfiledContext,
	id: string,
	version: number,
	input: unknown,
): Promise<SavedView> {
	if (!isUuid(id)) throw new ApiError("not_found");
	const parsed = viewEditSchema(ctx.profile.currency).safeParse(input);
	if (!parsed.success) throw fromZodError(parsed.error);
	const body = parsed.data;
	if (body.currency !== undefined) await requireCurrency(tx, body.currency);

	const { rows } = await withUniqueName(() =>
		tx.execute<{ view: SavedView }>(
			sql`UPDATE app.transaction_views SET ${setClause(ctx, body)}
			WHERE id = ${id}::uuid AND version = ${version}
			RETURNING ${VIEW_JSON} AS view`,
		),
	);
	const [updated] = rows;
	if (updated) return updated.view;
	throw await viewMismatch(tx, ctx, id);
}
