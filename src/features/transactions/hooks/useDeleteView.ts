import { useMutation, useQueryClient } from "@tanstack/react-query";

import { ApiRequestError, apiFetch } from "@/lib/api/client";
import { QUERY_ROOTS } from "@/lib/api/query-keys";
import { viewPath } from "../lib/paths";
import { refreshViews } from "../lib/refresh";

export type DeleteViewVariables = {
	id: string;
	version: number;
	idempotencyKey: string;
};

/** Deletes a view at its version (BR-F03-69). A 404 counts as done: the view is gone either
 * way. The views list reloads afterwards, refused or not. */
export function useDeleteView() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationKey: [QUERY_ROOTS.transactionViews, "delete"],
		mutationFn: async ({
			id,
			version,
			idempotencyKey,
		}: DeleteViewVariables): Promise<void> => {
			try {
				await apiFetch<void>(viewPath(id), {
					method: "DELETE",
					body: {},
					version,
					idempotencyKey,
				});
			} catch (error) {
				if (error instanceof ApiRequestError && error.status === 404) return;
				throw error;
			}
		},
		onSettled: () => refreshViews(queryClient),
	});
}
