import { useMutation, useQueryClient } from "@tanstack/react-query";

import { ApiRequestError, apiFetch } from "@/lib/api/client";
import { QUERY_ROOTS } from "@/lib/api/query-keys";
import { viewPath } from "../lib/paths";
import { dropView, refreshViews } from "../lib/refresh";

export type DeleteViewVariables = {
	id: string;
	version: number;
	idempotencyKey: string;
};

/** Deletes a view at its version (BR-F03-69). A 404 counts as done: the view is gone either
 * way. It leaves the cached list at once, and the list reloads afterwards, refused or not. */
export function useDeleteView() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationKey: [QUERY_ROOTS.transactionViews, "delete"],
		// Views are online only and never queue (BR-F03-63): offline the request fails at once
		// with its message, instead of waiting paused for the connection.
		networkMode: "always",
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
		onSuccess: (_done, { id }) => dropView(queryClient, id),
		onSettled: () => refreshViews(queryClient),
	});
}
