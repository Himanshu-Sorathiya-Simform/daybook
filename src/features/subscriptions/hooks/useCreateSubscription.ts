import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiFetch } from "@/lib/api/client";
import { QUERY_ROOTS } from "@/lib/api/query-keys";
import type { SubscriptionCreateInput } from "@/lib/subscriptions/schemas";
import { SUBSCRIPTIONS_PATH } from "../lib/paths";
import { chargesChanged, refreshAfterSubscriptionWrite } from "../lib/refresh";
import type { SubscriptionCreated } from "../lib/types";

export type CreateSubscriptionVariables = {
	/** With the client's id and `createdAt` (F05 section 11). */
	body: SubscriptionCreateInput;
	/** One per press, reused by its retry (D-507). */
	idempotencyKey: string;
};

/**
 * Creates a Subscription (F05 section 11): Add. Before M5 nothing queues: offline the request
 * fails at once rather than waiting paused for the connection (D-241). A confirmed create
 * refreshes what section 12 lists, the profile included, and settles once the page's reads
 * have. A refusal is the error, for `readSubscriptionWriteError`.
 */
export function useCreateSubscription() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationKey: [QUERY_ROOTS.subscriptions, "create"],
		networkMode: "always",
		mutationFn: ({ body, idempotencyKey }: CreateSubscriptionVariables) =>
			apiFetch<SubscriptionCreated>(SUBSCRIPTIONS_PATH, {
				method: "POST",
				body,
				idempotencyKey,
			}),
		onSuccess: (answer) =>
			refreshAfterSubscriptionWrite(queryClient, {
				count: true,
				charges: chargesChanged(answer),
			}),
	});
}
