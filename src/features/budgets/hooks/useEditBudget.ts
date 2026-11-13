import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiFetch } from "@/lib/api/client";
import { QUERY_ROOTS } from "@/lib/api/query-keys";
import type { BudgetEditInput } from "@/lib/budgets/schemas";
import { budgetPath } from "../lib/paths";
import { refreshAfterBudgetWrite } from "../lib/refresh";
import type { BudgetAnswer } from "../lib/types";

export type EditBudgetVariables = {
	id: string;
	/** The version the change was made against, sent as `If-Match` (BR-F04-23). */
	version: number;
	/** From a month onward, one month, or restoring (D-561). */
	body: BudgetEditInput;
	/** One per press, reused by its retry (D-507). */
	idempotencyKey: string;
};

/**
 * Changes a Budget at its version (F04 section 11): Change limit, Stop, Add for a category with
 * a record, and Undo after a change. Like a create, it fails at once offline before M5, and a
 * confirmed change settles once the page's reads have refreshed. A 409, 404 or 422 is the
 * error.
 */
export function useEditBudget() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationKey: [QUERY_ROOTS.budgets, "edit"],
		networkMode: "always",
		mutationFn: ({ id, version, body, idempotencyKey }: EditBudgetVariables) =>
			apiFetch<BudgetAnswer>(budgetPath(id), {
				method: "PATCH",
				body,
				version,
				idempotencyKey,
			}),
		onSuccess: () => refreshAfterBudgetWrite(queryClient, "rules"),
	});
}
