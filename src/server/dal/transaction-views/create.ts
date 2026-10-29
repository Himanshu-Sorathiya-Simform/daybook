import "server-only";
import { sql } from "drizzle-orm";
import { isUuidV7 } from "@/lib/ids";
import {
	type SavedView,
	VIEW_LIMIT,
	viewCreateSchema,
} from "@/lib/transactions/views";
import { ApiError, fromZodError } from "../../api/errors";
import type { ProfiledContext } from "../context";
import { requireCurrency } from "../currency";
import type { Tx } from "../with-user";
import { getView, VIEW_JSON, withUniqueName } from "./row";

/** The view a create's `id` names, when it is a UUIDv7 and one of the user's views. The `uuid`
 * cast reads either case. */
async function sentView(tx: Tx, input: unknown): Promise<SavedView | null> {
	const id =
		typeof input === "object" && input !== null ?
			(input as Record<string, unknown>)["id"]
		:	undefined;
	return typeof id === "string" && isUuidV7(id) ? getView(tx, id) : null;
}

/**
 * Creates a saved view (F03 section 11) in BR-F03-63's order (D-488):
 * 1. An id that is already one of the user's views answers that view, unchanged, whatever the
 *    body now says (API-5), so a retry succeeds at 20 views or with its name since taken.
 * 2. The body, against the profile currency's schema (BR-F03-64): 422 with field paths.
 * 3. A sent `currency` locks the profile and must match it (BR-F03-05): `currency_mismatch`.
 * 4. The per-user limit lock, P4's advisory form (D-198), taken after any profile lock (SRV-7);
 *    then the count, in its own statement so it sees every view committed before the lock.
 *    At 20, 422 `limit_reached`.
 * 5. The insert, recorded at the request clock (BR-P2-43). A taken name gets 422 on `name`.
 *    An id that exists after all is the user's own, created by a request that won the lock,
 *    or another user's: 409 `id_conflict`.
 */
export async function createView(
	tx: Tx,
	ctx: ProfiledContext,
	input: unknown,
): Promise<{ view: SavedView; created: boolean }> {
	const existing = await sentView(tx, input);
	if (existing) return { view: existing, created: false };

	const parsed = viewCreateSchema(ctx.profile.currency).safeParse(input);
	if (!parsed.success) throw fromZodError(parsed.error);
	const body = parsed.data;
	if (body.currency !== undefined) await requireCurrency(tx, body.currency);

	await tx.execute(
		sql`SELECT pg_advisory_xact_lock(hashtextextended(${`${ctx.user.id}:transactions.views`}, 0))`,
	);
	const { rows: counted } = await tx.execute<{ count: number }>(
		sql`SELECT count(*)::int AS count FROM app.transaction_views`,
	);
	// An aggregate without GROUP BY always answers one row.
	const [{ count }] = counted as [{ count: number }];
	if (count >= VIEW_LIMIT) throw new ApiError("limit_reached");

	const now = ctx.now.toISOString();
	const { rows } = await withUniqueName(() =>
		tx.execute<{ view: SavedView }>(
			sql`INSERT INTO app.transaction_views (id, user_id, created_at, updated_at, name, filter,
				sort, dir, group_by, version)
			VALUES (${body.id}, ${ctx.user.id}, ${now}, ${now}, ${body.name},
				${JSON.stringify(body.filter)}::jsonb, ${body.sort}, ${body.dir}, ${body.group}, 1)
			ON CONFLICT (id) DO NOTHING
			RETURNING ${VIEW_JSON} AS view`,
		),
	);
	const [inserted] = rows;
	if (inserted) return { view: inserted.view, created: true };

	const own = await getView(tx, body.id);
	if (!own) throw new ApiError("id_conflict");
	return { view: own, created: false };
}
