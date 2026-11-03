import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiFetch } from "@/lib/api/client";
import { QUERY_ROOTS } from "@/lib/api/query-keys";
import type { CurrencyCode } from "@/lib/currency";
import type { Dir, Group, Sort } from "@/lib/transactions/model";
import type { ViewFilter } from "@/lib/transactions/views";
import { viewPath } from "../lib/paths";
import { refreshViews } from "../lib/refresh";
import type { ViewAnswer } from "../lib/types";

/** A rename sends `{ name }`; Update view sends the four list fields together (BR-F03-68). */
export type ViewChanges =
	| { name: string }
	| {
			filter: ViewFilter;
			sort: Sort;
			dir: Dir;
			group: Group;
			currency?: CurrencyCode;
	  };

export type EditViewVariables = {
	id: string;
	version: number;
	changes: ViewChanges;
	idempotencyKey: string;
};

/** Renames or updates a view at its version (BR-F03-68, BR-F03-69). The views list reloads
 * afterwards, refused or not: a 409 or 404 means it is stale (AC-F03-55). */
export function useEditView() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationKey: [QUERY_ROOTS.transactionViews, "edit"],
		mutationFn: ({ id, version, changes, idempotencyKey }: EditViewVariables) =>
			apiFetch<ViewAnswer>(viewPath(id), {
				method: "PATCH",
				body: changes,
				version,
				idempotencyKey,
			}),
		onSettled: () => refreshViews(queryClient),
	});
}
