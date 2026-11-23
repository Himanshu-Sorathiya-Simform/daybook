import { useOnce } from "@/hooks/useOnce";
import { uuidV7 } from "@/lib/ids";
import type { SubscriptionEditInput } from "@/lib/subscriptions/schemas";
import type { Confirmed } from "../lib/notices";
import type { SubscriptionItem } from "../lib/types";
import type { SubscriptionField } from "../lib/write-errors";
import { useChangeSubscription } from "./useChangeSubscription";
import { type DialogConflict, useWriteRefusal } from "./useWriteRefusal";

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
export type EditConflictView = {
	conflict: DialogConflict;
	isPending: boolean;
	onClose: () => void;
	onKeepMine: () => void;
	onKeepTheirs: () => void;
};

/**
 * One dialog's `PATCH` (BR-F05-34): `submit` sends a body against the Subscription as opened, or
 * after a conflict as saved, with a new key per press and one write at a time (D-575). A
 * confirmed write reports itself and closes the dialog; a refusal lands in `refusal`. A 409
 * gives `conflictView`: Keep mine sends the same body against the saved version, Keep theirs
 * reads the page again and closes the dialog.
 */
export function useEditWrite({
	kind,
	own,
	onClose,
	onSaved,
	onFieldsRefused,
}: EditWriteOptions) {
	const change = useChangeSubscription();
	const refusal = useWriteRefusal(own);
	const sending = useOnce();

	const submit = async (
		body: SubscriptionEditInput,
		against: SubscriptionItem,
	) => {
		const request = sending.run(() =>
			change.mutateAsync({
				id: against.id,
				version: against.version,
				body,
				idempotencyKey: uuidV7(),
			}),
		);
		if (request === null) return;
		refusal.reset();
		try {
			const saved = await request;
			onSaved?.({ kind, before: against, saved, sent: body });
			onClose();
		} catch (error) {
			const outcome = await refusal.refuse(error, {
				kind: "change",
				id: against.id,
				body,
			});
			if (outcome.kind === "fields") onFieldsRefused?.();
		}
	};

	const { conflict } = refusal;
	const conflictView: EditConflictView | null =
		conflict === null ? null : (
			{
				conflict,
				isPending: change.isPending,
				onClose: refusal.closeConflict,
				onKeepMine: () =>
					void submit(
						conflict.request.body as SubscriptionEditInput,
						conflict.current,
					),
				onKeepTheirs: () => {
					void refusal.dropConflict();
					onClose();
				},
			}
		);

	return { change, refusal, sending, submit, conflictView };
}
