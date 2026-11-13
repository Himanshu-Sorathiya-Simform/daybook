import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiFetch } from "@/lib/api/client";
import { QUERY_ROOTS } from "@/lib/api/query-keys";
import type { BudgetCreateInput } from "@/lib/budgets/schemas";
import { BUDGETS_PATH } from "../lib/paths";
import { refreshAfterBudgetWrite } from "../lib/refresh";
import type { BudgetAnswer } from "../lib/types";

export type CreateBudgetVariables = {
	/** From a month (BR-F04-19), or restoring after a delete (BR-F04-33), with the client's
	 * id. */
	body: BudgetCreateInput;
	/** One per press, reused by its retry (D-507). */
	idempotencyKey: string;
};

/**
 * Creates a Budget (F04 section 11): Add for a category with no Budget record, and Undo after a
 * delete. Before M5 nothing queues: offline the request fails at once rather than waiting
 * paused for the connection (D-241). A confirmed create refreshes what section 12 lists and
 * settles once the page's reads have. A refusal is the error, for `readBudgetWriteError` or,
 * from Undo, `readBudgetNoticeError`.
 */
export function useCreateBudget() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationKey: [QUERY_ROOTS.budgets, "create"],
		networkMode: "always",
		mutationFn: ({ body, idempotencyKey }: CreateBudgetVariables) =>
			apiFetch<BudgetAnswer>(BUDGETS_PATH, {
				method: "POST",
				body,
				idempotencyKey,
			}),
		onSuccess: () => refreshAfterBudgetWrite(queryClient, "count"),
	});
}
