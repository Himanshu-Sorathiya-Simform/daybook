import { ApiError } from "@/server/api/errors";
import { route } from "@/server/api/route";
import { requireProfile } from "@/server/dal/context";
import { unskipCharge } from "@/server/dal/subscriptions/skips";

/** Brings a skipped charge back at the Subscription's `If-Match` version (F05 section 11,
 * BR-F05-27): 200 with the Subscription and the currency. A malformed id or date is 404. The
 * body (`changedAt`) is checked in `unskipCharge`. */
export const DELETE = route(
	{ versioned: true },
	(ctx, tx, { body, params, version }) => {
		const id = params["id"];
		const dueOn = params["dueOn"];
		// The wrapper refuses a versioned route's request without `If-Match` (400).
		if (typeof id !== "string" || typeof dueOn !== "string" || version === null)
			throw new ApiError("not_found");
		return unskipCharge(tx, requireProfile(ctx), id, dueOn, version, body);
	},
);
