import { reply, route } from "@/server/api/route";
import { requireProfile } from "@/server/dal/context";
import { createView } from "@/server/dal/transaction-views/create";
import { listViews } from "@/server/dal/transaction-views/list";

/** The user's saved views in creation order, with the profile currency (F03 section 11,
 * BR-F03-63). All Transactions lives in code and is never listed. */
export const GET = route({}, async (ctx, tx) => {
	const { currency } = requireProfile(ctx).profile;
	return { items: await listViews(tx), currency };
});

/** Creates a saved view: 201 with the view and the profile currency, or 200 with the view an
 * earlier create of the same id made (API-5). The body is checked in `createView`, against
 * the profile currency's schema and after the id lookup (BR-F03-63, D-488). */
export const POST = route({}, async (ctx, tx, { body }) => {
	const profiled = requireProfile(ctx);
	const { view, created } = await createView(tx, profiled, body);
	return reply(
		{ ...view, currency: profiled.profile.currency },
		{ status: created ? 201 : 200 },
	);
});
