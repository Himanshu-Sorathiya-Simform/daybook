import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiFetch } from "@/lib/api/client";
import { QUERY_ROOTS } from "@/lib/api/query-keys";
import type { TransactionCreateInput } from "@/lib/transactions/schemas";
import { refreshAfterTransactionWrite } from "../lib/refresh";
import type { TransactionAnswer } from "../lib/types";

export type CreateVariables = {
	body: TransactionCreateInput;
	/** One per Save press: a retry of the same press reuses it (D-507). The client id makes a
	 * create safe even under a new key, since the server answers 200 with the row (API-5). */
	idempotencyKey: string;
};

/**
 * Creates a Transaction (BR-F03-20). A confirmed create sets the row's own query and refreshes
 * what F03 section 12 lists, without waiting for those refetches, so the dialog closes at once
 * (flow 7.1). A refusal is the mutation's error, for `readWriteError`.
 */
export function useCreateTransaction() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationKey: [QUERY_ROOTS.transactions, "create"],
		mutationFn: ({ body, idempotencyKey }: CreateVariables) =>
			apiFetch<TransactionAnswer>("/api/transactions", {
				method: "POST",
				body,
				idempotencyKey,
			}),
		onSuccess: (row) => {
			void refreshAfterTransactionWrite(queryClient, { kind: "create", row });
		},
	});
}
