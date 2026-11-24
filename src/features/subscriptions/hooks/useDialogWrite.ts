import { useOnce } from "@/hooks/useOnce";
import type { ChangeRequest } from "../lib/conflict";
import type { Confirmed } from "../lib/notices";
import type { SubscriptionItem } from "../lib/types";
import type {
	SubscriptionField,
	SubscriptionWriteOutcome,
} from "../lib/write-errors";
import { type DialogConflict, useWriteRefusal } from "./useWriteRefusal";

/** What the conflict view over a dialog needs, besides the dialog's own origin and formats. */
export type DialogConflictView = {
	conflict: DialogConflict;
	isPending: boolean;
	onClose: () => void;
	onKeepMine: () => void;
	onKeepTheirs: () => void;
};

export type DialogWriteOptions<Body, Saved> = {
	/** Sends `body` against `against` with a new key, and answers what the server saved. */
	send: (body: Body, against: SubscriptionItem) => Promise<Saved>;
	/** The write is out: the mutation's own state. */
	isPending: boolean;
	/** What the confirmed write is, for its notice. */
	confirmed: (saved: Saved, against: SubscriptionItem, body: Body) => Confirmed;
	/** The write a 409 would send again, against the saved Subscription. */
	requestOf: (against: SubscriptionItem, body: Body) => ChangeRequest;
	/** Reads a refusal of this write. */
	read?: (error: unknown) => SubscriptionWriteOutcome;
	/** The fields the dialog has a box for: their refusals sit under them. */
	own: readonly SubscriptionField[];
	onClose: () => void;
	onSaved?: ((confirmed: Confirmed) => void) | undefined;
	/** A refusal named fields: the dialog moves focus to the first. */
	onFieldsRefused?: (() => void) | undefined;
};

/**
 * One dialog's write (BR-F05-34), the part every dialog shares whatever it sends: `submit` sends
 * a body against the Subscription as opened, or after a conflict as saved, one write at a time
 * (D-575). A confirmed write reports itself and closes the dialog; a refusal lands in `refusal`.
 * A 409 gives `conflictView`: Keep mine sends the same body against the saved version, Keep
 * theirs reads the page again and closes the dialog. `useEditWrite` and `useDeleteWrite` give it
 * what to send, so the 409 is handled in this one place.
 */
export function useDialogWrite<Body, Saved>({
	send,
	isPending,
	confirmed,
	requestOf,
	read,
	own,
	onClose,
	onSaved,
	onFieldsRefused,
}: DialogWriteOptions<Body, Saved>) {
	const refusal = useWriteRefusal(own);
	const sending = useOnce();

	const submit = async (body: Body, against: SubscriptionItem) => {
		const request = sending.run(() => send(body, against));
		if (request === null) return;
		refusal.reset();
		try {
			const saved = await request;
			onSaved?.(confirmed(saved, against, body));
			onClose();
		} catch (error) {
			const outcome = await refusal.refuse(
				error,
				requestOf(against, body),
				read,
			);
			if (outcome.kind === "fields") onFieldsRefused?.();
		}
	};

	const { conflict } = refusal;
	const conflictView: DialogConflictView | null =
		conflict === null ? null : (
			{
				conflict,
				isPending,
				onClose: refusal.closeConflict,
				onKeepMine: () =>
					void submit(conflict.request.body as Body, conflict.current),
				onKeepTheirs: () => {
					void refusal.dropConflict();
					onClose();
				},
			}
		);

	return { refusal, sending, submit, conflictView };
}
