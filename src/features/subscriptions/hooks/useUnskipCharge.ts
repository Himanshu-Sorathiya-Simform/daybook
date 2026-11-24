import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiFetch } from "@/lib/api/client";
import { QUERY_ROOTS } from "@/lib/api/query-keys";
import type { SubscriptionUnskipInput } from "@/lib/subscriptions/schemas";
import { skipPath } from "../lib/paths";
import { refreshAfterSubscriptionWrite } from "../lib/refresh";
import type { SubscriptionAnswer } from "../lib/types";

export type UnskipChargeVariables = {
	id: string;
	/** The skipped due date, which the route names (BR-F05-27). */
	dueOn: string;
	version: number;
	/** `{ changedAt }`. */
	body: SubscriptionUnskipInput;
	idempotencyKey: string;
};

/**
 * Brings a skipped date back (F05 section 11, BR-F05-27): "Undo skip", and Undo after a skip.
 * It removes the tombstone while the date is still to come, so no charge changes and only the
 * Subscriptions refresh. A 409, 404 or 422 is the error, for `readSubscriptionNoticeError`.
 */
export function useUnskipCharge() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationKey: [QUERY_ROOTS.subscriptions, "unskip"],
		networkMode: "always",
		mutationFn: ({
			id,
			dueOn,
			version,
			body,
			idempotencyKey,
		}: UnskipChargeVariables) =>
			apiFetch<SubscriptionAnswer>(skipPath(id, dueOn), {
				method: "DELETE",
				body,
				version,
				idempotencyKey,
			}),
		onSuccess: () =>
			refreshAfterSubscriptionWrite(queryClient, {
				count: false,
				charges: false,
			}),
	});
}
