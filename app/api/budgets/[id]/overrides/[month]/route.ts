import { budgetDeleteSchema } from "@/lib/budgets/schemas";
import { ApiError } from "@/server/api/errors";
import { route } from "@/server/api/route";
import { removeMonthLimit } from "@/server/dal/budgets/edit";
import { requireProfile } from "@/server/dal/context";

/** Removes one month's one-month limit at the Budget's `If-Match` version (BR-F04-25): 200 with
 * the Budget and the profile currency. The body is `{}`. A stale version gets 409 with the
 * Budget; a missing Budget, another user's, a month with no one-month limit, or an id or
 * month that is malformed gets 404. */
export const DELETE = route(
	{ body: budgetDeleteSchema, versioned: true },
	(ctx, tx, { params, version }) => {
		const profiled = requireProfile(ctx);
		const { id, month } = params;
		// The wrapper refuses a versioned route's request without `If-Match` (400).
		if (
			typeof id !== "string"
			|| typeof month !== "string"
			|| version === null
		) {
			throw new ApiError("not_found");
		}
		return removeMonthLimit(tx, profiled, id, month, version);
	},
);
