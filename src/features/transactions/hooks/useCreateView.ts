import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiFetch } from "@/lib/api/client";
import { QUERY_ROOTS } from "@/lib/api/query-keys";
import type { CurrencyCode } from "@/lib/currency";
import type { Dir, Group, Sort } from "@/lib/transactions/model";
import type { ViewFilter } from "@/lib/transactions/views";
import { VIEWS_PATH } from "../lib/paths";
import { putView, refreshViews } from "../lib/refresh";
import type { ViewAnswer } from "../lib/types";

export type ViewBody = {
	id: string;
	name: string;
	filter: ViewFilter;
	sort: Sort;
	dir: Dir;
	group: Group;
	/** With amount bounds in the filter (BR-F03-64). */
	currency?: CurrencyCode;
};

export type CreateViewVariables = { body: ViewBody; idempotencyKey: string };

/** Saves a new view (BR-F03-67). Online only, never queued (BR-F03-63). The answer joins the
 * cached list at once; success and a stale refusal both reload the list; a 422 is the error,
 * for `readViewError`. */
export function useCreateView() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationKey: [QUERY_ROOTS.transactionViews, "create"],
		// Views are online only and never queue (BR-F03-63): offline the request fails at once
		// with its message, instead of waiting paused for the connection.
		networkMode: "always",
		mutationFn: ({ body, idempotencyKey }: CreateViewVariables) =>
			apiFetch<ViewAnswer>(VIEWS_PATH, {
				method: "POST",
				body,
				idempotencyKey,
			}),
		onSuccess: (view) => putView(queryClient, view),
		onSettled: () => refreshViews(queryClient),
	});
}
