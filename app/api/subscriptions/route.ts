import { reply, route } from "@/server/api/route";
import { requireProfile } from "@/server/dal/context";
import { createSubscription } from "@/server/dal/subscriptions/create";
import { listSubscriptions } from "@/server/dal/subscriptions/read";

/** The Subscriptions page's data (F05 section 11): every Subscription as an item, the cost
 * totals, the next 30 days, and this month's charged and still to come, with the profile
 * currency. */
export const GET = route({}, (ctx, tx) =>
	listSubscriptions(tx, requireProfile(ctx)),
);

/** Creates a Subscription, with its past charges when asked (F05 section 11, BR-F05-03,
 * BR-F05-04): 201 with the Subscription, `chargesCreated` and the currency, or 200 with the
 * Subscription an earlier create of the same id made (API-5, D-603). The body is checked in
 * `createSubscription`. */
export const POST = route({}, async (ctx, tx, { body }) => {
	const { subscription, created } = await createSubscription(
		tx,
		requireProfile(ctx),
		body,
	);
	return reply(subscription, { status: created ? 201 : 200 });
});
