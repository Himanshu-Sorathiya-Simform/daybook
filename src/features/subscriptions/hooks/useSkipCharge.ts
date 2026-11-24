import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiFetch } from "@/lib/api/client";
import { QUERY_ROOTS } from "@/lib/api/query-keys";
import type { SubscriptionSkipInput } from "@/lib/subscriptions/schemas";
import { skipsPath } from "../lib/paths";
import { refreshAfterSubscriptionWrite } from "../lib/refresh";
import type { SubscriptionAnswer } from "../lib/types";

export type SkipChargeVariables = {
	id: string;
	version: number;
	/** `{ dueOn, changedAt }` (BR-F05-26). */
	body: SubscriptionSkipInput;
	idempotencyKey: string;
};

/**
 * Skips an upcoming due date (F05 section 11, BR-F05-26): "Skip this one", and Undo after
 * Undo skip. It writes a tombstone and raises the version. Online the date is still to come, so
 * no charge changes and only the Subscriptions refresh. A 409, 404 or 422 is the error, for
 * `readSubscriptionNoticeError`.
 */
export function useSkipCharge() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationKey: [QUERY_ROOTS.subscriptions, "skip"],
		networkMode: "always",
		mutationFn: ({ id, version, body, idempotencyKey }: SkipChargeVariables) =>
			apiFetch<SubscriptionAnswer>(skipsPath(id), {
				method: "POST",
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
