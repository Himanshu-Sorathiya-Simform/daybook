import { useMutation, useQueryClient } from "@tanstack/react-query";

import { ApiRequestError, apiFetch } from "@/lib/api/client";
import { QUERY_ROOTS } from "@/lib/api/query-keys";
import type { SubscriptionDeleteInput } from "@/lib/subscriptions/schemas";
import { subscriptionPath } from "../lib/paths";
import { chargesChanged, refreshAfterSubscriptionWrite } from "../lib/refresh";
import type { SubscriptionDeleted } from "../lib/types";

export type DeleteSubscriptionVariables = {
	id: string;
	version: number;
	/** `{ changedAt }`, or `{ changedAt, undo: "create" }` for the Undo of an Add (BR-F05-34). */
	body: SubscriptionDeleteInput;
	idempotencyKey: string;
};

/**
 * Deletes a Subscription at its version (F05 section 11): Delete, and Undo after an Add. A 404
 * on a plain delete counts as done and answers `null`: the Subscription is gone either way
 * (D-239). On an Undo of an Add it is the error, since the notice says the Subscription was
 * deleted on another device (BR-F05-33). Like the other writes it fails at once offline before
 * M5. A confirmed delete refreshes what section 12 lists, the profile included, and settles once
 * the page's reads have. Other refusals are the error, for `readSubscriptionDeleteError` or,
 * from Undo, `readSubscriptionNoticeError`.
 */
export function useDeleteSubscription() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationKey: [QUERY_ROOTS.subscriptions, "delete"],
		networkMode: "always",
		mutationFn: async ({
			id,
			version,
			body,
			idempotencyKey,
		}: DeleteSubscriptionVariables): Promise<SubscriptionDeleted | null> => {
			try {
				return await apiFetch<SubscriptionDeleted>(subscriptionPath(id), {
					method: "DELETE",
					body,
					version,
					idempotencyKey,
				});
			} catch (error) {
				const plain = body.undo === undefined;
				if (
					plain
					&& error instanceof ApiRequestError
					&& error.status === 404
				) {
					return null;
				}
				throw error;
			}
		},
		// Its charges are unknown when it was gone already, so everything refreshes.
		onSuccess: (answer) =>
			refreshAfterSubscriptionWrite(queryClient, {
				count: true,
				charges: answer === null || chargesChanged(answer),
			}),
	});
}
