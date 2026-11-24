import { queryOptions } from "@tanstack/react-query";

import { apiFetch } from "@/lib/api/client";
import { QUERY_ROOTS } from "@/lib/api/query-keys";

/**
 * The Subscriptions the Transactions page names (D-541, D-586), read from `GET /api/subscriptions`.
 * The key is the Subscriptions page's own list key, `["subscriptions", "list"]`, under the
 * `subscriptions` root (STATE-5), so both pages share one cache entry and a Subscription write
 * refreshes both. A feature never imports another's keys, so the key is spelled out here, and
 * each side's tests pin it.
 */
export const SUBSCRIPTION_NAMES_KEY = [QUERY_ROOTS.subscriptions, "list"] as const;

export const SUBSCRIPTIONS_PATH = "/api/subscriptions";

/** What this page reads of the list's answer: each Subscription's id and name. */
export type SubscriptionNamesAnswer = {
	items: readonly { id: string; name: string }[];
};

export type SubscriptionNames = ReadonlyMap<string, string>;

const namesOf = (answer: SubscriptionNamesAnswer): SubscriptionNames =>
	new Map(answer.items.map((item) => [item.id, item.name]));

export function subscriptionNamesOptions() {
	return queryOptions({
		queryKey: SUBSCRIPTION_NAMES_KEY,
		queryFn: ({ signal }) =>
			apiFetch<SubscriptionNamesAnswer>(SUBSCRIPTIONS_PATH, { signal }),
		select: namesOf,
	});
}

/** The chip for `sub=<id>` (D-541): "Netflix charges" once the name is known, and
 * "Subscription charges" while it loads, when it fails and for an id the list does not hold. */
export function subscriptionChipLabel(name: string | null | undefined): string {
	return name ? `${name} charges` : "Subscription charges";
}

/** The Subscriptions page with this Subscription selected (BR-F03-16, BR-F05-21). */
export const subscriptionHref = (id: string): string =>
	`/subscriptions?open=${encodeURIComponent(id)}`;
