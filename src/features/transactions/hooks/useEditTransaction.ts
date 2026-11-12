import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiFetch } from "@/lib/api/client";
import { QUERY_ROOTS } from "@/lib/api/query-keys";
import type { TransactionEditInput } from "@/lib/transactions/schemas";
import { transactionPath } from "../lib/paths";
import { refreshAfterTransactionWrite } from "../lib/refresh";
import type { TransactionAnswer } from "../lib/types";

export type EditVariables = {
	id: string;
	/** The version the change was made against, sent as `If-Match` (BR-F03-23). */
	version: number;
	/** Only the changed fields; the date and time together or neither (BR-F03-23). */
	changes: TransactionEditInput;
	/** One per Save press, reused by its retry (D-507). */
	idempotencyKey: string;
};

/** Edits a Transaction at its version (BR-F03-23). A confirmed edit sets the row's query from
 * the answer and refreshes the rest (section 12). A 409, 404 or 422 is the error, for
 * `readWriteError`. */
export function useEditTransaction() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationKey: [QUERY_ROOTS.transactions, "edit"],
		mutationFn: ({ id, version, changes, idempotencyKey }: EditVariables) =>
			apiFetch<TransactionAnswer>(transactionPath(id), {
				method: "PATCH",
				body: changes,
				version,
				idempotencyKey,
			}),
		onSuccess: (row) => {
			void refreshAfterTransactionWrite(queryClient, { kind: "edit", row });
		},
	});
}
