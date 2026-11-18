import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiFetch } from "@/lib/api/client";
import { QUERY_ROOTS } from "@/lib/api/query-keys";
import type { Month } from "@/lib/budgets/months";
import { monthLimitPath } from "../lib/paths";
import { refreshAfterBudgetWrite } from "../lib/refresh";
import type { BudgetAnswer } from "../lib/types";

export type RemoveMonthLimitVariables = {
	id: string;
	month: Month;
	version: number;
	idempotencyKey: string;
};

/**
 * Remove in the limit history: deletes one month's one-month limit at the Budget's version
 * (BR-F04-25). Like the other writes, it fails at once offline before M5 and settles once the
 * page's reads have refreshed. A 404 (the Budget or the one-month limit is gone) and a 409 are
 * the error, for `readBudgetNoticeError`.
 */
export function useRemoveMonthLimit() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationKey: [QUERY_ROOTS.budgets, "removeMonthLimit"],
		networkMode: "always",
		mutationFn: ({
			id,
			month,
			version,
			idempotencyKey,
		}: RemoveMonthLimitVariables) =>
			apiFetch<BudgetAnswer>(monthLimitPath(id, month), {
				method: "DELETE",
				version,
				idempotencyKey,
			}),
		onSuccess: () => refreshAfterBudgetWrite(queryClient, "rules"),
	});
}
