import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiFetch } from "@/lib/api/client";
import { QUERY_ROOTS } from "@/lib/api/query-keys";
import type { SubscriptionEditInput } from "@/lib/subscriptions/schemas";
import { subscriptionPath } from "../lib/paths";
import { chargesChanged, refreshAfterSubscriptionWrite } from "../lib/refresh";
import type { SubscriptionChanged } from "../lib/types";

export type ChangeSubscriptionVariables = {
	id: string;
	/** The version the change was made against, sent as `If-Match` (BR-F05-34). */
	version: number;
	/** `changedAt` and the changed fields, with the options of BR-F05-29 to BR-F05-32. */
	body: SubscriptionEditInput;
	/** One per press, reused by its retry (D-507). */
	idempotencyKey: string;
};

/**
 * Changes a Subscription at its version (F05 section 11): Edit, Cancel, Resume, Pause, Resume
 * now, and Undo after any of them. Like a create, it fails at once offline before M5, and a
 * confirmed change refreshes what section 12 lists, the Transactions side only when the answer
 * says charges changed, and settles once the page's reads have. A 409, 404 or 422 is the error.
 */
export function useChangeSubscription() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationKey: [QUERY_ROOTS.subscriptions, "change"],
		networkMode: "always",
		mutationFn: ({
			id,
			version,
			body,
			idempotencyKey,
		}: ChangeSubscriptionVariables) =>
			apiFetch<SubscriptionChanged>(subscriptionPath(id), {
				method: "PATCH",
				body,
				version,
				idempotencyKey,
			}),
		onSuccess: (answer) =>
			refreshAfterSubscriptionWrite(queryClient, {
				count: false,
				charges: chargesChanged(answer),
			}),
	});
}
