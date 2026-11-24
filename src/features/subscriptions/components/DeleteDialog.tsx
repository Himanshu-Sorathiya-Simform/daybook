"use client";

import { useState } from "react";

import { Button } from "@/components/actions/Button";
import { FormAlert } from "@/components/feedback/FormAlert";
import { OfflineNote } from "@/components/feedback/OfflineNote";
import { ConfirmDialog } from "@/components/surfaces/ConfirmDialog";
import { useOnline } from "@/hooks/useOnline";
import { useDeleteWrite } from "../hooks/useDeleteWrite";
import { fieldsOf } from "../lib/conflict";
import { chargesLine, DELETE_TEXT, offersCancel } from "../lib/delete";
import { DIALOG_TEXT } from "../lib/dialog";
import type { Confirmed } from "../lib/notices";
import type { SubscriptionItem, SubscriptionsLocale } from "../lib/types";
import { DialogConflict } from "./DialogConflict";

export type DeleteDialogProps = {
	isOpen: boolean;
	/** The Subscription to delete, at the version the page holds. */
	item: SubscriptionItem;
	/** The profile's formats, for the conflict view. */
	locale: SubscriptionsLocale;
	onClose: () => void;
	/** "cancel it instead", which opens Cancel on the same Subscription (BR-F05-44). */
	onCancelInstead: (item: SubscriptionItem) => void;
	/** The delete is confirmed: its charges stay as ordinary expenses. */
	onDeleted?: (confirmed: Confirmed) => void;
};

/**
 * "Delete Netflix?" (BR-F05-14, BR-F05-44): what becomes of its charges, that Daybook stops adding
 * them and forgets the schedule and skipped dates, and for one that is neither upcoming nor
 * ended "To keep it under Ended, cancel it instead." with a link that opens Cancel. The buttons
 * are "Keep Netflix" and "Delete Netflix", in the danger style. Delete sends `DELETE` at the
 * version it opened with and a new key per press, and a 404 counts as done. A refusal keeps it
 * open with its line; a 409 opens the conflict view over it, "Delete anyway" resending against
 * the saved version and "Keep it" closing it (BR-F05-34). Before M5 it is disabled offline.
 */
export function DeleteDialog({
	isOpen,
	item,
	locale,
	onClose,
	onCancelInstead,
	onDeleted,
}: Readonly<DeleteDialogProps>) {
	// The Subscription as it was when the dialog opened (BR-F05-34).
	const [opened] = useState(item);
	const online = useOnline();
	const { remove, refusal, submit, conflictView } = useDeleteWrite({
		onClose,
		onDeleted,
	});
	const name = opened.name;

	// The first press's `changedAt` stays with the write through a conflict.
	const confirm = () =>
		void submit({ changedAt: new Date().toISOString() }, opened);

	return (
		<>
			<ConfirmDialog
				title={DELETE_TEXT.title(name)}
				isOpen={isOpen}
				// It only ever reports closing.
				onOpenChange={onClose}
				cancelLabel={DELETE_TEXT.keep(name)}
				confirmLabel={DELETE_TEXT.delete(name)}
				tone="danger"
				isConfirmDisabled={!online}
				isPending={remove.isPending}
				onConfirm={confirm}
			>
				<div className="flex flex-col gap-2">
					{!online && <OfflineNote>{DIALOG_TEXT.offline}</OfflineNote>}
					<p className="text-ink">{chargesLine(opened.chargeCount)}</p>
					<p>
						{DELETE_TEXT.forgets}
						{offersCancel(opened) && (
							<>
								{" "}
								{DELETE_TEXT.keepEnded}
								<Button
									size="sm"
									variant="row"
									className="inline-flex h-auto min-h-0 px-0 align-baseline max-md:min-h-0"
									onPress={() => onCancelInstead(opened)}
								>
									{DELETE_TEXT.cancelInstead}
								</Button>
								.
							</>
						)}
					</p>
					{refusal.failure && <FormAlert>{refusal.failure}</FormAlert>}
				</div>
			</ConfirmDialog>
			{conflictView && (
				<DialogConflict
					{...conflictView}
					origin={fieldsOf(opened)}
					formats={locale}
				/>
			)}
		</>
	);
}
