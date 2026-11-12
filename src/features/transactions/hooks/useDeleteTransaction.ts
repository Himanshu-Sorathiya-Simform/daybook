import { useMutation, useQueryClient } from "@tanstack/react-query";

import { ApiRequestError, apiFetch } from "@/lib/api/client";
import { QUERY_ROOTS } from "@/lib/api/query-keys";
import type { TransactionDeleteInput } from "@/lib/transactions/schemas";
import { transactionPath } from "../lib/paths";
import { refreshAfterTransactionWrite } from "../lib/refresh";

export type DeleteVariables = {
	id: string;
	version: number;
	idempotencyKey: string;
	/** A charge's `{ subscriptionId, dueOn }` (BR-F03-17); `{}` otherwise. */
	hint?: TransactionDeleteInput;
};

/**
 * Sends a delete at its version, once the page's 5-second Undo window has ended (BR-F03-26).
 * A 404 counts as done, with no message (D-239): the row is gone either way. A confirmed delete
 * drops the row's query and refreshes the rest (section 12). Other refusals are the error, for
 * `readDeleteError`.
 */
export function useDeleteTransaction() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationKey: [QUERY_ROOTS.transactions, "delete"],
		// Before M5 nothing queues: offline, the request fails at once, and the row comes back
		// with its message (BR-F03-26), instead of waiting paused for the connection.
		networkMode: "always",
		mutationFn: async ({
			id,
			version,
			idempotencyKey,
			hint = {},
		}: DeleteVariables): Promise<void> => {
			try {
				await apiFetch<void>(transactionPath(id), {
					method: "DELETE",
					body: hint,
					version,
					idempotencyKey,
				});
			} catch (error) {
				if (error instanceof ApiRequestError && error.status === 404) return;
				throw error;
			}
		},
		onSuccess: (_done, { id }) => {
			void refreshAfterTransactionWrite(queryClient, { kind: "delete", id });
		},
	});
}
