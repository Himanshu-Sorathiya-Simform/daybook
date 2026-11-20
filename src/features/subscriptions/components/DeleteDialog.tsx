"use client";

import { useState } from "react";

import { Button } from "@/components/actions/Button";
import { FormAlert } from "@/components/feedback/FormAlert";
import { OfflineNote } from "@/components/feedback/OfflineNote";
import { ConfirmDialog } from "@/components/surfaces/ConfirmDialog";
import { useOnce } from "@/hooks/useOnce";
import { useOnline } from "@/hooks/useOnline";
import { uuidV7 } from "@/lib/ids";
import { useQueryClient } from "@tanstack/react-query";
import { useDeleteSubscription } from "../hooks/useDeleteSubscription";
import { chargesLine, DELETE_TEXT, offersCancel } from "../lib/delete";
import { DIALOG_TEXT } from "../lib/dialog";
import { refreshAfterSubscriptionWrite } from "../lib/refresh";
import type { SubscriptionItem } from "../lib/types";
import { readSubscriptionDeleteError } from "../lib/write-errors";

export type DeleteDialogProps = {
	isOpen: boolean;
	/** The Subscription to delete, at the version the page holds. */
	item: SubscriptionItem;
	onClose: () => void;
	/** "cancel it instead", which opens Cancel on the same Subscription (BR-F05-44). */
	onCancelInstead: (item: SubscriptionItem) => void;
	/** The delete is confirmed: its charges stay as ordinary expenses. */
	onDeleted?: (item: SubscriptionItem) => void;
};

/**
 * "Delete Netflix?" (BR-F05-14, BR-F05-44): what becomes of its charges, that Daybook stops adding
 * them and forgets the schedule and skipped dates, and for one that is neither upcoming nor
 * ended "To keep it under Ended, cancel it instead." with a link that opens Cancel. The buttons
 * are "Keep Netflix" and "Delete Netflix", in the danger style. Delete sends `DELETE` at the
 * version it opened with and a new key per press, and a 404 counts as done. A refusal keeps it
 * open with its line; a 409 says it changed on another device and reads the page again, until
 * the conflict view arrives with the notices. Before M5 it is disabled offline.
 */
export function DeleteDialog({
	isOpen,
	item,
	onClose,
	onCancelInstead,
	onDeleted,
}: Readonly<DeleteDialogProps>) {
	// The Subscription as it was when the dialog opened (BR-F05-34).
	const [opened] = useState(item);
	const online = useOnline();
	const queryClient = useQueryClient();
	const remove = useDeleteSubscription();
	const sending = useOnce();
	const [failure, setFailure] = useState<string | null>(null);
	const name = opened.name;

	const confirm = async () => {
		const request = sending.run(() =>
			remove.mutateAsync({
				id: opened.id,
				version: opened.version,
				body: { changedAt: new Date().toISOString() },
				idempotencyKey: uuidV7(),
			}),
		);
		if (request === null) return;
		setFailure(null);
		try {
			await request;
			onDeleted?.(opened);
			onClose();
		} catch (error) {
			const outcome = readSubscriptionDeleteError(error);
			if (outcome.kind === "handled") return;
			if (outcome.kind === "conflict") {
				setFailure(DIALOG_TEXT.conflict);
				await refreshAfterSubscriptionWrite(queryClient, {
					count: false,
					charges: false,
				});
			} else setFailure(outcome.message);
		}
	};

	return (
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
			onConfirm={() => void confirm()}
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
				{failure && <FormAlert>{failure}</FormAlert>}
			</div>
		</ConfirmDialog>
	);
}
