import { uuidV7 } from "@/lib/ids";
import type { SubscriptionEditInput } from "@/lib/subscriptions/schemas";
import type { Confirmed } from "../lib/notices";
import type { SubscriptionField } from "../lib/write-errors";
import { useChangeSubscription } from "./useChangeSubscription";
import { type DialogConflictView, useDialogWrite } from "./useDialogWrite";

/** The dialog writes that change a Subscription with one `PATCH`. */
export type EditKind = "edit" | "cancel" | "resume" | "pause";

export type EditWriteOptions = {
	/** What the confirmed write is, for its notice. */
	kind: EditKind;
	/** The fields the dialog has a box for: their refusals sit under them. */
	own: readonly SubscriptionField[];
	onClose: () => void;
	onSaved?: ((confirmed: Confirmed) => void) | undefined;
	/** A refusal named fields: the dialog moves focus to the first. */
	onFieldsRefused?: () => void;
};

/** What the conflict view over the dialog needs, besides the dialog's own origin and formats. */
export type EditConflictView = DialogConflictView;

/**
 * One dialog's `PATCH` (BR-F05-34): `submit` sends a body against the Subscription as opened, or
 * after a conflict as saved, with a new key per press and one write at a time (D-575). The rest,
 * a refusal's lines and the conflict view of a 409, is `useDialogWrite`'s.
 */
export function useEditWrite({
	kind,
	own,
	onClose,
	onSaved,
	onFieldsRefused,
}: EditWriteOptions) {
	const change = useChangeSubscription();
	const write = useDialogWrite<
		SubscriptionEditInput,
		Awaited<ReturnType<typeof change.mutateAsync>>
	>({
		send: (body, against) =>
			change.mutateAsync({
				id: against.id,
				version: against.version,
				body,
				idempotencyKey: uuidV7(),
			}),
		isPending: change.isPending,
		confirmed: (saved, against, body) => ({
			kind,
			before: against,
			saved,
			sent: body,
		}),
		requestOf: (against, body) => ({ kind: "change", id: against.id, body }),
		own,
		onClose,
		onSaved,
		onFieldsRefused,
	});
	return { change, ...write };
}
