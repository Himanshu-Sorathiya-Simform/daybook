import { ApiError } from "@/server/api/errors";
import { route } from "@/server/api/route";
import { requireProfile } from "@/server/dal/context";
import { changeSubscription } from "@/server/dal/subscriptions/change";
import { deleteSubscription } from "@/server/dal/subscriptions/remove";

/** Changes a Subscription at its `If-Match` version (F05 section 11, BR-F05-08): every edit,
 * pause, resume, skip on edit and Undo of a change. 200 with the Subscription, the change date,
 * the counts and the currency. A stale version gets 409 with the current Subscription; a
 * missing one, another user's, or an id that is not a UUID gets 404. The body is checked in
 * `changeSubscription`. */
export const PATCH = route(
	{ versioned: true },
	(ctx, tx, { body, params, version }) => {
		const id = params["id"];
		// The wrapper refuses a versioned route's request without `If-Match` (400).
		if (typeof id !== "string" || version === null)
			throw new ApiError("not_found");
		return changeSubscription(tx, requireProfile(ctx), id, version, body);
	},
);

/** Deletes a Subscription, or undoes its Add with `undo: "create"`, at its `If-Match` version
 * (F05 section 11, BR-F05-14, BR-F05-34): 200 with the change date, the charges created, kept
 * as unlinked expenses and deleted, and their months. The body is checked in
 * `deleteSubscription`. */
export const DELETE = route(
	{ versioned: true },
	(ctx, tx, { body, params, version }) => {
		const id = params["id"];
		// The wrapper refuses a versioned route's request without `If-Match` (400).
		if (typeof id !== "string" || version === null)
			throw new ApiError("not_found");
		return deleteSubscription(tx, requireProfile(ctx), id, version, body);
	},
);
