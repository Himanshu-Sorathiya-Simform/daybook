import { useQueryClient } from "@tanstack/react-query";

import { uuidV7 } from "@/lib/ids";
import { todayIn } from "@/lib/time";
import type {
	TransactionCreateInput,
	TransactionEditInput,
} from "@/lib/transactions/schemas";
import type { EntryLocale } from "../lib/entry";
import { refreshAfterTransactionWrite } from "../lib/refresh";
import type { TransactionAnswer } from "../lib/types";
import { readWriteError } from "../lib/write-errors";
import { useCreateTransaction } from "./useCreateTransaction";
import { useEditTransaction } from "./useEditTransaction";
import type { useEntryWrite } from "./useEntryWrite";

export type EntrySaveOptions = {
	/** What the dialog shows of a write, and its one-at-a-time guard. */
	write: ReturnType<typeof useEntryWrite>;
	/** The row an edit is on, or `null` for a new Transaction or a duplicate. */
	editing: TransactionAnswer | null;
	locale: EntryLocale;
	/** An edit was confirmed (BR-F03-23); the dialog closes after. */
	onEdited?: ((row: TransactionAnswer) => void) | undefined;
	/** An edit met a 404: the row was deleted elsewhere (BR-F03-25). */
	onGone?: ((id: string) => void) | undefined;
	onClose: () => void;
};

/**
 * Save in the entry dialog (BR-F03-21, BR-F03-23 to BR-F03-25): a create or an edit, with a new
 * key per press and one write at a time (D-615). `sendCreate` answers the saved row, or `null`
 * when nothing was sent or the save was refused. `sendEdit` closes the dialog when confirmed,
 * opens or refreshes the conflict view on a 409, and closes the dialog on a 404. Refusals go to
 * `write`.
 */
export function useEntrySave({
	write,
	editing,
	locale,
	onEdited,
	onGone,
	onClose,
}: EntrySaveOptions) {
	const queryClient = useQueryClient();
	const create = useCreateTransaction();
	const edit = useEditTransaction();

	/** Sends a create, a second press sending nothing while one is out (D-615). */
	const sendCreate = async (
		body: TransactionCreateInput,
	): Promise<TransactionAnswer | null> => {
		const request = write.sending.run(() =>
			create.mutateAsync({ body, idempotencyKey: uuidV7() }),
		);
		if (request === null) return null;
		try {
			return await request;
		} catch (error) {
			write.refused(error);
			return null;
		}
	};

	/** Sends an edit at `version` (BR-F03-23): done closes the dialog, a 409 opens or refreshes
	 * the conflict view, a 404 closes it, and anything else shows in the dialog. */
	const sendEdit = async (change: TransactionEditInput, version: number) => {
		const row = editing!;
		const request = write.sending.run(() =>
			edit.mutateAsync({
				id: row.id,
				version,
				changes: change,
				idempotencyKey: uuidV7(),
			}),
		);
		if (request === null) return;
		try {
			const saved = await request;
			write.setConflict(null);
			onEdited?.(saved);
			onClose();
		} catch (error) {
			const outcome = readWriteError(error, {
				mode: "edit",
				dateLocale: locale.dateLocale,
				today: todayIn(locale.timezone, new Date()),
			});
			if (outcome.kind === "conflict") {
				write.setConflict({ current: outcome.current, change });
				return;
			}
			write.setConflict(null);
			if (outcome.kind === "gone") {
				void refreshAfterTransactionWrite(queryClient, {
					kind: "delete",
					id: row.id,
					charge: row.source === "subscription",
				});
				onGone?.(row.id);
				onClose();
				return;
			}
			write.refused(error);
		}
	};

	return {
		sendCreate,
		sendEdit,
		/** A write is out: the choices wait. */
		busy: create.isPending || edit.isPending,
		/** An edit is out: the conflict view's pending state. */
		isEditing: edit.isPending,
	};
}
