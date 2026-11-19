import { useQuery } from "@tanstack/react-query";

import { subscriptionChargesOptions } from "../lib/queries";

/** Every linked charge of one Subscription, whole, for its timeline and the previews of Edit,
 * Cancel and Resume (BR-F05-40, BR-F05-48). With no id it reads nothing. */
export function useSubscriptionCharges(id: string | null) {
	return useQuery(subscriptionChargesOptions(id));
}
