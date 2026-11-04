"use client";

import type { ReactNode } from "react";

import { Button } from "@/components/actions/Button";
import { Dialog } from "@/components/surfaces/Dialog";

export type ConfirmDialogProps = {
	/** The question, "Discard changes?" or "Delete this view?". It names the dialog. */
	title: string;
	isOpen: boolean;
	onOpenChange: (isOpen: boolean) => void;
	/** What happens if the user confirms, "What you've typed here won't be saved." */
	children?: ReactNode;
	/** The confirm button's words, "Discard" or "Delete": a verb, never "OK". */
	confirmLabel: string;
	onConfirm: () => void;
	/** The cancel button's words, "Keep editing". "Cancel" by default. */
	cancelLabel?: string;
	/** `danger` for an action that loses data; `primary` for any other. */
	tone?: "danger" | "primary";
	/** While the confirmed action runs: the confirm button shows a spinner and takes no second
	 * press, and Escape, Cancel and Close wait. */
	isPending?: boolean;
	className?: string;
};

/**
 * A confirmation that needs an answer: an alert dialog with the question, what it means, Cancel
 * and the action. Focus starts on Cancel, so Enter never confirms by accident. The caller
 * closes it, after `onConfirm` or once the action has finished.
 */
export function ConfirmDialog({
	title,
	isOpen,
	onOpenChange,
	children,
	confirmLabel,
	onConfirm,
	cancelLabel = "Cancel",
	tone = "danger",
	isPending = false,
	className,
}: Readonly<ConfirmDialogProps>) {
	return (
		<Dialog
			title={title}
			role="alertdialog"
			size="sm"
			isOpen={isOpen}
			onOpenChange={(next) => {
				if (!isPending) onOpenChange(next);
			}}
			footer={
				<>
					<span className="flex-1" />
					<Button
						variant="secondary"
						autoFocus
						isDisabled={isPending}
						onPress={() => onOpenChange(false)}
					>
						{cancelLabel}
					</Button>
					<Button
						variant={tone}
						isPending={isPending}
						onPress={onConfirm}
					>
						{confirmLabel}
					</Button>
				</>
			}
			{...(className ? { className } : {})}
		>
			{children && <div className="text-body text-ink-2">{children}</div>}
		</Dialog>
	);
}
