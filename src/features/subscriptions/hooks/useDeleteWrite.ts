import { uuidV7 } from "@/lib/ids";
import type { SubscriptionDeleteInput } from "@/lib/subscriptions/schemas";
import type { Confirmed } from "../lib/notices";
import { readSubscriptionDeleteRefusal } from "../lib/write-errors";
import { useDeleteSubscription } from "./useDeleteSubscription";
import { useDialogWrite } from "./useDialogWrite";

export type DeleteWriteOptions = {
	onClose: () => void;
	onDeleted?: ((confirmed: Confirmed) => void) | undefined;
};

/**
 * The confirmation's `DELETE` (BR-F05-14, BR-F05-44): `submit` sends it against the Subscription
 * as opened, or after a conflict as saved, with a new key per press and one write at a time. A
 * 404 counts as done. Its refusals and the conflict view of a 409 are `useDialogWrite`'s, the
 * same as an Edit's.
 */
export function useDeleteWrite({ onClose, onDeleted }: DeleteWriteOptions) {
	const remove = useDeleteSubscription();
	const write = useDialogWrite<
		SubscriptionDeleteInput,
		Awaited<ReturnType<typeof remove.mutateAsync>>
	>({
		send: (body, against) =>
			remove.mutateAsync({
				id: against.id,
				version: against.version,
				body,
				idempotencyKey: uuidV7(),
			}),
		isPending: remove.isPending,
		confirmed: (saved, against) => ({ kind: "delete", before: against, saved }),
		requestOf: (against, body) => ({ kind: "delete", id: against.id, body }),
		read: readSubscriptionDeleteRefusal,
		own: [],
		onClose,
		onSaved: onDeleted,
	});
	return { remove, ...write };
}
