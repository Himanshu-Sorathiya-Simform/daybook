"use client";

import { type ReactNode, type Ref, useId } from "react";

import { Button, type ButtonProps } from "@/components/actions/Button";
import { FormAlert } from "@/components/feedback/FormAlert";
import { OfflineNote } from "@/components/feedback/OfflineNote";
import { Dialog, type DialogProps } from "@/components/surfaces/Dialog";
import { useOnline } from "@/hooks/useOnline";
import { DIALOG_TEXT } from "../lib/dialog";

export type WriteDialogProps = {
	title: string;
	isOpen: boolean;
	onClose: () => void;
	size?: DialogProps["size"];
	/** A write is out: the choices wait, and so does closing. */
	isPending: boolean;
	/** The refusal's line, above the fields. */
	failure: string | null;
	/** The button that closes without a write; phones close with the dialog's own Close. */
	dismissLabel: string;
	confirmLabel: string;
	confirmVariant?: ButtonProps["variant"];
	/** The write can go once online: the dialog has what it needs. */
	isReady: boolean;
	onConfirm: () => void;
	formRef?: Ref<HTMLFormElement>;
	children: ReactNode;
};

/**
 * The frame of a Subscription dialog that sends one write: the title, a form named after it
 * whose Enter confirms, the offline note and the refusal's line above the fields, and a footer
 * with the dismiss button and the confirm button. Confirm waits until the dialog is ready and
 * online; before M5 a write is disabled offline.
 */
export function WriteDialog({
	title,
	isOpen,
	onClose,
	size,
	isPending,
	failure,
	dismissLabel,
	confirmLabel,
	confirmVariant = "primary",
	isReady,
	onConfirm,
	formRef,
	children,
}: Readonly<WriteDialogProps>) {
	const online = useOnline();
	const formId = useId();
	const canSave = online && isReady;
	return (
		<Dialog
			title={title}
			isOpen={isOpen}
			// It only ever reports closing.
			onOpenChange={onClose}
			{...(size ? { size } : {})}
			isPending={isPending}
			footer={
				<>
					<span className="flex-1" />
					<Button
						variant="secondary"
						isDisabled={isPending}
						onPress={onClose}
						className="max-md:hidden"
					>
						{dismissLabel}
					</Button>
					<Button
						variant={confirmVariant}
						isDisabled={!canSave}
						isPending={isPending}
						// The footer sits outside the form, so the button names it: pressing it and Enter
						// in any field both submit.
						type="submit"
						form={formId}
					>
						{confirmLabel}
					</Button>
				</>
			}
		>
			<form
				id={formId}
				{...(formRef ? { ref: formRef } : {})}
				noValidate
				aria-label={title}
				className="flex flex-col gap-4"
				onSubmit={(event) => {
					event.preventDefault();
					event.stopPropagation();
					if (canSave) onConfirm();
				}}
			>
				{!online && <OfflineNote>{DIALOG_TEXT.offline}</OfflineNote>}
				{failure && <FormAlert>{failure}</FormAlert>}
				{children}
			</form>
		</Dialog>
	);
}
