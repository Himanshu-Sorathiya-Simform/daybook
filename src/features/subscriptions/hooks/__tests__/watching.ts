import { QUERY_ROOTS } from "@/lib/api/query-keys";
import { subscriptionKeys } from "../../lib/keys";
import { type testClient, watched } from "./helpers";

/** One watched read under each area a Subscription write may refresh, as mounted pages are:
 * the Subscriptions list, F03's reads, payees, Budgets and the profile, and the session and
 * the saved views, which it never touches. `fetched()` names the areas that refetched. */
export function watchAreas(queryClient: ReturnType<typeof testClient>) {
	const areas = {
		subscriptions: watched(queryClient, subscriptionKeys.list(), {
			seeded: true,
		}),
		transactions: watched(queryClient, [QUERY_ROOTS.transactions, "list", {}], {
			seeded: true,
		}),
		payees: watched(queryClient, [QUERY_ROOTS.payees, "list"], { seeded: true }),
		budgets: watched(queryClient, [QUERY_ROOTS.budgets, "month", "2026-11"], {
			seeded: true,
		}),
		profile: watched(queryClient, [QUERY_ROOTS.profile], { seeded: true }),
		me: watched(queryClient, [QUERY_ROOTS.me], { seeded: true }),
		views: watched(queryClient, [QUERY_ROOTS.transactionViews, "list"], {
			seeded: true,
		}),
	};
	return {
		fetched: () =>
			(Object.keys(areas) as (keyof typeof areas)[]).filter(
				(name) => areas[name].fetches() > 0,
			),
		stop: () => {
			for (const area of Object.values(areas)) area.stop();
		},
	};
}
