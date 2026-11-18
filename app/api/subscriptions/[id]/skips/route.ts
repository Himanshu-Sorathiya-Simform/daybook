import { ApiError } from "@/server/api/errors";
import { route } from "@/server/api/route";
import { requireProfile } from "@/server/dal/context";
import { skipCharge } from "@/server/dal/subscriptions/skips";

/** Skips one upcoming charge at the Subscription's `If-Match` version (F05 section 11,
 * BR-F05-26): 200 with the Subscription and the currency. The body (`dueOn`, `changedAt`) is
 * checked in `skipCharge`. */
export const POST = route(
	{ versioned: true },
	(ctx, tx, { body, params, version }) => {
		const id = params["id"];
		// The wrapper refuses a versioned route's request without `If-Match` (400).
		if (typeof id !== "string" || version === null)
			throw new ApiError("not_found");
		return skipCharge(tx, requireProfile(ctx), id, version, body);
	},
);
