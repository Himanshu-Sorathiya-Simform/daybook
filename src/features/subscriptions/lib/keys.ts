import { QUERY_ROOTS } from "@/lib/api/query-keys";
import type { Month } from "@/lib/budgets/months";

const SUBSCRIPTIONS = [QUERY_ROOTS.subscriptions] as const;

/**
 * The Subscriptions area's keys (STATE-5): the root, the kind of read, then its parameters.
 * The charge reads are F03 reads, but they move with the same writes as the rest of the page,
 * so they sit under this root too: one invalidation refreshes everything the page shows, and
 * a write that changed a charge reaches them through the root (F05 section 12). A `null` id
 * is a read still waiting for one, which never matches a real Subscription's answer.
 */
export const subscriptionKeys = {
	all: SUBSCRIPTIONS,
	list: () => [...SUBSCRIPTIONS, "list"] as const,
	months: (from: Month, to: Month) =>
		[...SUBSCRIPTIONS, "months", from, to] as const,
	monthCharges: (month: Month) =>
		[...SUBSCRIPTIONS, "month-charges", month] as const,
	charges: (id: string | null) => [...SUBSCRIPTIONS, "charges", id] as const,
	duplicates: (name: string | null, from: string, to: string) =>
		[...SUBSCRIPTIONS, "duplicates", name, from, to] as const,
};
