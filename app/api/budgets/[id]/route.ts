import { budgetDeleteSchema } from "@/lib/budgets/schemas";
import { ApiError } from "@/server/api/errors";
import { reply, route } from "@/server/api/route";
import { deleteBudget, editBudget } from "@/server/dal/budgets/edit";
import { requireProfile } from "@/server/dal/context";

/** Changes a Budget at its `If-Match` version: from a month onward, one month, or restoring
 * (F04 section 11, D-561). 200 with the Budget and the profile currency. The body is checked
 * in `editBudget`. A stale version gets 409 with the current Budget; a missing one, another
 * user's, or an id that is not a UUID gets 404. */
export const PATCH = route(
	{ versioned: true },
	(ctx, tx, { body, params, version }) => {
		const profiled = requireProfile(ctx);
		const id = params["id"];
		// The wrapper refuses a versioned route's request without `If-Match` (400).
		if (typeof id !== "string" || version === null)
			throw new ApiError("not_found");
		return editBudget(tx, profiled, id, version, body);
	},
);

/** Deletes a Budget, its schedule and its one-month limits at its `If-Match` version
 * (BR-F04-06): 204. The body is `{}`. A stale version gets 409 with the Budget; a missing one
 * gets 404, which the client counts as done. */
export const DELETE = route(
	{ body: budgetDeleteSchema, versioned: true },
	async (ctx, tx, { params, version }) => {
		const profiled = requireProfile(ctx);
		const id = params["id"];
		// The wrapper refuses a versioned route's request without `If-Match` (400).
		if (typeof id !== "string" || version === null)
			throw new ApiError("not_found");
		await deleteBudget(tx, profiled, id, version);
		return reply(null, { status: 204 });
	},
);
