import "server-only";
import { sql } from "drizzle-orm";
import { isUuidV7, uuidV7Time } from "@/lib/ids";
import { TRANSACTION_MESSAGES } from "@/lib/transactions/schemas";
import {
	type SavedView,
	VIEW_LIMIT,
	viewCreateSchema,
} from "@/lib/transactions/views";
import { ApiError, fromZodError } from "../../api/errors";
import type { ProfiledContext } from "../context";
import { requireCurrency, type WithCurrency } from "../currency";
import { pastSlack } from "../transactions/dates";
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
 * 4. The id's time, at most 5 minutes past the request clock (BR-P2-20): 422 on `id`.
 * 5. The per-user limit lock, P4's advisory form (D-198), taken after any profile lock (SRV-7);
 *    then the count, in its own statement so it sees every view committed before the lock.
 *    At 20, the id is read again: a request that held the lock may have created it, and then
 *    this is that create, done (API-5). Otherwise 422 `limit_reached` (D-495).
 * 6. The insert, recorded at the request clock (BR-P2-43). A taken name gets 422 on `name`.
 *    An id that exists after all is the user's own, created by a request that won the lock,
 *    or another user's: 409 `id_conflict`.
 * Answers carry the currency the profile lock read when one was sent, else the request's (D-493).
 */
export async function createView(
	tx: Tx,
	ctx: ProfiledContext,
	input: unknown,
): Promise<{ view: WithCurrency<SavedView>; created: boolean }> {
	const existing = await sentView(tx, input);
	if (existing)
		return {
			view: { ...existing, currency: ctx.profile.currency },
			created: false,
		};

	const parsed = viewCreateSchema(ctx.profile.currency).safeParse(input);
	if (!parsed.success) throw fromZodError(parsed.error);
	const body = parsed.data;
	const currency =
		body.currency !== undefined ?
			await requireCurrency(tx, body.currency)
		:	ctx.profile.currency;
	if (pastSlack(new Date(uuidV7Time(body.id)), ctx.now)) {
		throw new ApiError("validation_failed", {
			fields: { id: TRANSACTION_MESSAGES.idInFuture },
		});
	}
	const answer = (view: SavedView, created: boolean) => ({
		view: { ...view, currency },
		created,
	});

	const lockKey = `${ctx.user.id}:transactions.views`;
	await tx.execute(
		sql`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`,
	);
	const { rows: counted } = await tx.execute<{ count: number }>(
		sql`SELECT count(*)::int AS count FROM app.transaction_views`,
	);
	// An aggregate without GROUP BY always answers one row.
	const [{ count }] = counted as [{ count: number }];
	if (count >= VIEW_LIMIT) {
		const done = await getView(tx, body.id);
		if (done) return answer(done, false);
		throw new ApiError("limit_reached");
	}

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
	if (inserted) return answer(inserted.view, true);

	const own = await getView(tx, body.id);
	if (!own) throw new ApiError("id_conflict");
	return answer(own, false);
}
