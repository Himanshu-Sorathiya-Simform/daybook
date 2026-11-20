import { useQuery } from "@tanstack/react-query";

import { subscriptionNamesOptions } from "../lib/subscriptions";

/** The Subscriptions' names, read only while something shows one (D-541): a `sub` chip. With
 * `enabled` false nothing is asked, though a list the Subscriptions page already holds is
 * still answered from the shared cache. */
export function useSubscriptionNames(enabled: boolean) {
	return useQuery({ ...subscriptionNamesOptions(), enabled });
}
