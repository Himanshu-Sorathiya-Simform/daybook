import {
	transactionDeleteSchema,
	transactionEditSchema,
} from "@/lib/transactions/schemas";
import { ApiError } from "@/server/api/errors";
import { reply, route } from "@/server/api/route";
import { requireProfile } from "@/server/dal/context";
import { editTransaction } from "@/server/dal/transactions/edit";
import { getTransaction } from "@/server/dal/transactions/get";
import { deleteTransaction } from "@/server/dal/transactions/remove";

/** One Transaction (F03 section 11, BR-F03-53), with the profile currency (API-6, D-479).
 * Missing, another user's, or not a UUID: 404. */
export const GET = route({}, async (ctx, tx, { params }) => {
	const { currency } = requireProfile(ctx).profile;
	const id = params["id"];
	const row = typeof id === "string" ? await getTransaction(tx, id) : null;
	if (!row) throw new ApiError("not_found");
	return { ...row, currency };
});

/** Edits a Transaction at its `If-Match` version (F03 section 11, BR-F03-23): 200 with the row
 * and the profile currency (D-485). A stale version gets 409 with the current row; a missing
 * one, another user's, or an id that is not a UUID gets 404. */
export const PATCH = route(
	{ body: transactionEditSchema, versioned: true },
	async (ctx, tx, { body, params, version }) => {
		const profiled = requireProfile(ctx);
		const id = params["id"];
		// The wrapper refuses a versioned route's request without `If-Match` (400).
		if (typeof id !== "string" || version === null)
			throw new ApiError("not_found");
		return editTransaction(tx, profiled, id, version, body);
	},
);

/** Deletes a Transaction at its `If-Match` version (F03 section 11): 204. The body is `{}`, or a
 * charge's hint, checked for shape only until F05 (D-487). A stale version gets 409 with the
 * current row; a missing one gets 404, which the client counts as done (BR-F03-25). */
export const DELETE = route(
	{ body: transactionDeleteSchema, versioned: true },
	async (ctx, tx, { params, version }) => {
		const profiled = requireProfile(ctx);
		const id = params["id"];
		// The wrapper refuses a versioned route's request without `If-Match` (400).
		if (typeof id !== "string" || version === null)
			throw new ApiError("not_found");
		await deleteTransaction(tx, profiled, id, version);
		return reply(null, { status: 204 });
	},
);
