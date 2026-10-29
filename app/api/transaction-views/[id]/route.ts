import { viewDeleteSchema } from "@/lib/transactions/views";
import { ApiError } from "@/server/api/errors";
import { reply, route } from "@/server/api/route";
import { requireProfile } from "@/server/dal/context";
import { editView } from "@/server/dal/transaction-views/edit";
import { deleteView } from "@/server/dal/transaction-views/remove";

/** Renames or updates a saved view at its `If-Match` version (F03 section 11, BR-F03-68): 200
 * with the view and the profile currency. The body is checked in `editView`, against the
 * profile currency's schema (D-488). A stale version gets 409 with the current view; a missing
 * one, another user's, or an id that is not a UUID gets 404. */
export const PATCH = route(
	{ versioned: true },
	async (ctx, tx, { body, params, version }) => {
		const profiled = requireProfile(ctx);
		const id = params["id"];
		// The wrapper refuses a versioned route's request without `If-Match` (400).
		if (typeof id !== "string" || version === null)
			throw new ApiError("not_found");
		const view = await editView(tx, profiled, id, version, body);
		return { ...view, currency: profiled.profile.currency };
	},
);

/** Deletes a saved view at its `If-Match` version (BR-F03-69): 204. The body is `{}`. A stale
 * version gets 409 with the current view; a missing one gets 404, which the client counts as
 * done. */
export const DELETE = route(
	{ body: viewDeleteSchema, versioned: true },
	async (ctx, tx, { params, version }) => {
		const profiled = requireProfile(ctx);
		const id = params["id"];
		// The wrapper refuses a versioned route's request without `If-Match` (400).
		if (typeof id !== "string" || version === null)
			throw new ApiError("not_found");
		await deleteView(tx, profiled, id, version);
		return reply(null, { status: 204 });
	},
);
