import { useMutation, useQueryClient } from "@tanstack/react-query";

import { ApiRequestError, apiFetch } from "@/lib/api/client";
import { QUERY_ROOTS } from "@/lib/api/query-keys";
import { budgetPath } from "../lib/paths";
import { refreshAfterBudgetWrite } from "../lib/refresh";

export type DeleteBudgetVariables = {
	id: string;
	version: number;
	idempotencyKey: string;
};

/**
 * Deletes a Budget, its schedule and its one-month limits at its version (BR-F04-06): Delete,
 * and Undo after a create. A 404 counts as done: the Budget is gone either way (D-239). Like
 * the other writes, it fails at once offline before M5 and settles once the page's reads have
 * refreshed. Other refusals are the error, for `readBudgetDeleteError` or, from Undo,
 * `readBudgetNoticeError`.
 */
export function useDeleteBudget() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationKey: [QUERY_ROOTS.budgets, "delete"],
		networkMode: "always",
		mutationFn: async ({
			id,
			version,
			idempotencyKey,
		}: DeleteBudgetVariables): Promise<void> => {
			try {
				await apiFetch<void>(budgetPath(id), {
					method: "DELETE",
					version,
					idempotencyKey,
				});
			} catch (error) {
				if (error instanceof ApiRequestError && error.status === 404) return;
				throw error;
			}
		},
		onSuccess: () => refreshAfterBudgetWrite(queryClient, "count"),
	});
}
