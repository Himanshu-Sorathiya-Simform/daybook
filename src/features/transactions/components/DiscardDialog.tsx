"use client";

import { ConfirmDialog } from "@/components/surfaces/ConfirmDialog";
import { ENTRY_TEXT } from "../lib/entry";

export type DiscardDialogProps = {
	isOpen: boolean;
	onOpenChange: (isOpen: boolean) => void;
	/** Discard: the entry dialog closes with its changes. */
	onDiscard: () => void;
};

/** "Discard your changes?" (BR-F03-49): closing the entry dialog with changes asks first. */
export function DiscardDialog({
	isOpen,
	onOpenChange,
	onDiscard,
}: Readonly<DiscardDialogProps>) {
	return (
		<ConfirmDialog
			title={ENTRY_TEXT.discardTitle}
			isOpen={isOpen}
			onOpenChange={onOpenChange}
			confirmLabel="Discard"
			cancelLabel="Keep editing"
			onConfirm={onDiscard}
		>
			{ENTRY_TEXT.discardBody}
		</ConfirmDialog>
	);
}
