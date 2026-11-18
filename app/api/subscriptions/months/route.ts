import { monthOf } from "@/lib/budgets/months";
import { route } from "@/server/api/route";
import { requireProfile } from "@/server/dal/context";
import { subscriptionMonths } from "@/server/dal/subscriptions/months";
import { readMonthsQuery } from "@/server/dal/subscriptions/query";

/** Each month from `from` to `to` with what was charged and what is still expected, for the
 * month row and the calendar (F05 section 11, BR-F05-36), with the profile currency. A missing
 * or invalid month, an order or span refused, or a month outside the window is 400. */
export const GET = route({}, (ctx, tx, { query }) => {
	const profiled = requireProfile(ctx);
	return subscriptionMonths(
		tx,
		profiled,
		readMonthsQuery(query, monthOf(profiled.today)),
	);
});
