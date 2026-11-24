import { layoutPutSchema } from "@/lib/dashboard/schemas";
import { route } from "@/server/api/route";
import { readViews, writeViews } from "@/server/dal/dashboard/views";

/** The user's live Dashboard views, normalized, oldest first (F08 section 11). Overview is in
 * code and is not listed. A preference, not finance data, so it skips the catch-up check. */
export const GET = route({ catchUp: false }, async (_ctx, tx) => ({
	views: await readViews(tx),
}));

/** Writes the views a client sends, each only if it is newer than the stored one; answers each
 * view's result and the live views after the writes (BR-F08-22, BR-F08-23). It needs an
 * `Idempotency-Key` and takes no `If-Match`: the server keeps the later `changedAt`, never a
 * version (OFF-8). */
export const PUT = route(
	{ body: layoutPutSchema, catchUp: false },
	(ctx, tx, { body }) => writeViews(tx, ctx, body.views),
);
