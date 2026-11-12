"use client";

import { type AnyFieldApi, revalidateLogic, useForm } from "@tanstack/react-form";
import { useRef, useState } from "react";

import { Button } from "@/components/actions/Button";
import { FormAlert } from "@/components/feedback/FormAlert";
import { OfflineNote } from "@/components/feedback/OfflineNote";
import { showToast } from "@/components/feedback/showToast";
import { TextInput } from "@/components/forms/TextInput";
import { Dialog } from "@/components/surfaces/Dialog";
import { useFocusFirstInvalid } from "@/hooks/useFocusFirstInvalid";
import { uuidV7 } from "@/lib/ids";
import type { SavedView } from "@/lib/transactions/views";
import { useEditView } from "../hooks/useEditView";
import { VIEW_TEXT } from "../lib/messages";
import { checkViewName } from "../lib/saved-views";
import { readViewError } from "../lib/write-errors";

export type RenameViewDialogProps = {
	/** The view as the list holds it now, so a Save after a reload uses its new version. */
	view: SavedView;
	/** The names of the user's other views, which this one can't take (BR-F03-63). */
	others: readonly string[];
	onClose: () => void;
	isOffline: boolean;
	className?: string;
};

/**
 * Rename (BR-F03-69): a dialog with the view's name. Save checks the name, then on each change,
 * and sends `{ name }` at the view's version with a new key per press, then "View renamed."
 * The same name closes it with no request. A name the server refuses shows under the field; a
 * 409 shows "This view changed on another device. Try again." in the dialog, so the next Save
 * uses the reloaded version; a 404 closes it with "This view was deleted on another device."
 * Offline, Save is disabled with "You are offline. Connect to save." (BR-F03-63).
 */
export function RenameViewDialog({
	view,
	others,
	onClose,
	isOffline,
	className,
}: Readonly<RenameViewDialogProps>) {
	const edit = useEditView();
	const [server, setServer] = useState<string | null>(null);
	const [failure, setFailure] = useState<string | null>(null);
	const formRef = useRef<HTMLFormElement>(null);
	const focusInvalid = useFocusFirstInvalid(formRef);
	const busy = edit.isPending;

	const form = useForm({
		defaultValues: { name: view.name },
		validationLogic: revalidateLogic(),
		validators: {
			onDynamic: ({ value }) => {
				const checked = checkViewName(value.name, others);
				return checked.ok ? undefined : (
						{ fields: { name: checked.message } }
					);
			},
		},
		onSubmitInvalid: focusInvalid,
		onSubmit: async ({ value }) => {
			const checked = checkViewName(value.name, others);
			if (!checked.ok) return;
			if (checked.name === view.name) {
				onClose();
				return;
			}
			setServer(null);
			setFailure(null);
			try {
				await edit.mutateAsync({
					id: view.id,
					version: view.version,
					changes: { name: checked.name },
					idempotencyKey: uuidV7(),
				});
				showToast(VIEW_TEXT.renamed);
				onClose();
			} catch (error) {
				const outcome = readViewError(error);
				if (outcome.kind === "handled") return;
				if (outcome.kind === "gone") {
					showToast(outcome.message, { tone: "error" });
					onClose();
				} else if (outcome.kind === "name") {
					setServer(outcome.message);
					focusInvalid();
				} else {
					setFailure(outcome.message);
				}
			}
		},
	});

	const save = () => {
		if (busy || isOffline) return;
		void form.handleSubmit();
	};

	const messageOf = (field: AnyFieldApi): string | undefined =>
		server ?? (field.state.meta.errors as (string | undefined)[])[0];

	return (
		<Dialog
			title={VIEW_TEXT.renameTitle}
			size="sm"
			isOpen
			onOpenChange={(next) => {
				if (!next && !busy) onClose();
			}}
			isKeyboardDismissDisabled={busy}
			footer={
				<>
					<span className="flex-1" />
					<Button
						variant="secondary"
						isDisabled={busy}
						onPress={onClose}
					>
						Cancel
					</Button>
					<Button
						isDisabled={isOffline}
						isPending={busy}
						onPress={save}
					>
						Save
					</Button>
				</>
			}
			{...(className ? { className } : {})}
		>
			<form
				ref={formRef}
				noValidate
				aria-label={VIEW_TEXT.renameTitle}
				className="flex flex-col gap-3.5"
				onSubmit={(event) => {
					event.preventDefault();
					save();
				}}
			>
				{isOffline && <OfflineNote>{VIEW_TEXT.offline}</OfflineNote>}
				{failure && <FormAlert>{failure}</FormAlert>}
				<form.Field name="name">
					{(field) => (
						<TextInput
							label="Name"
							name="name"
							autoFocus
							value={field.state.value}
							onChange={(text) => {
								field.handleChange(text);
								setServer(null);
								setFailure(null);
							}}
							error={messageOf(field)}
							isDisabled={busy}
						/>
					)}
				</form.Field>
			</form>
		</Dialog>
	);
}
