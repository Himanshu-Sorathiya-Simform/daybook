"use client";

import { type ReactNode, useRef, useState } from "react";

import { showToast } from "@/components/feedback/showToast";
import { useAddSlot } from "@/hooks/useAddSlot";
import { useMe } from "@/hooks/useMe";
import { useShortcut } from "@/hooks/useShortcut";
import type { ProfileBlock } from "@/lib/profile";
import {
	type CreatedAnswer,
	type EntryDialogApi,
	EntryDialogContext,
	EntryDialogOpenContext,
	type GoneAnswer,
} from "../hooks/useEntryDialog";
import { useTransactionDeletes } from "../hooks/useTransactionDeletes";
import { ENTRY_TEXT, type EntryMode } from "../lib/entry";
import { TRANSACTIONS_TEXT } from "../lib/messages";
import { EntryDialog } from "./EntryDialog";

export type EntryDialogHostProps = {
	/** The profile as the server read it; `/api/me` takes over once it answers, so a changed
	 * currency or zone reaches the next dialog. */
	profile: ProfileBlock;
	children: ReactNode;
};

/** Says "Transaction saved." where no page answers creates (D-548). */
const toastSaved: CreatedAnswer = () => {
	showToast(ENTRY_TEXT.saved);
};

const noAnswer: GoneAnswer = () => {};

/**
 * The one entry dialog of the logged-in pages (BR-F03-48, D-548). The shell's Add buttons, `N`
 * outside a text field, and whatever below calls `useEntryDialog` open it, new, as an edit or
 * as a duplicate; each opening starts fresh. A page may answer creates itself with
 * `useCreatedAnswer`, as the Transactions page does to select the new row; elsewhere a create
 * says "Transaction saved.". An edit says "Changes saved." (BR-F03-23), and an edit whose row
 * was deleted elsewhere says so (BR-F03-25), with the page's `useGoneAnswer` after.
 */
export function EntryDialogHost({
	profile,
	children,
}: Readonly<EntryDialogHostProps>) {
	const { data: me } = useMe();
	const deletes = useTransactionDeletes();
	const shown = me?.profile ?? profile;
	// Each opening mounts a new dialog, so nothing typed before survives a close.
	const [opening, setOpening] = useState(0);
	const [isOpen, setOpen] = useState(false);
	const [mode, setMode] = useState<EntryMode>({ kind: "new" });
	// Whether a dialog is open, known at once: two opens in one event make one dialog.
	const opened = useRef(false);
	const onClosed = useRef<(() => void) | undefined>(undefined);
	const answer = useRef<CreatedAnswer>(toastSaved);
	const gone = useRef<GoneAnswer>(noAnswer);

	const [api] = useState<EntryDialogApi>(() => {
		const open = (next: EntryMode, options?: { onClose?: () => void }) => {
			if (opened.current) return;
			opened.current = true;
			onClosed.current = options?.onClose;
			setMode(next);
			setOpen(true);
			setOpening((count) => count + 1);
		};
		return {
			openNew: (options) => open({ kind: "new" }, options),
			openEdit: (row, options) => open({ kind: "edit", row }, options),
			openDuplicate: (row, options) =>
				open({ kind: "duplicate", row }, options),
			answerCreates: (next) => {
				answer.current = next;
				return () => {
					if (answer.current === next) answer.current = toastSaved;
				};
			},
			answerGone: (next) => {
				gone.current = next;
				return () => {
					if (gone.current === next) gone.current = noAnswer;
				};
			},
		};
	});

	useAddSlot(api.openNew);
	useShortcut("N", () => api.openNew(), { enabled: !isOpen });

	const close = () => {
		opened.current = false;
		setOpen(false);
		const after = onClosed.current;
		onClosed.current = undefined;
		after?.();
	};

	return (
		<EntryDialogContext value={api}>
			<EntryDialogOpenContext value={isOpen}>
				{children}
				{opening > 0 && (
					<EntryDialog
						key={opening}
						mode={mode}
						isOpen={isOpen}
						onClose={close}
						onCreated={(row, kind) => answer.current(row, kind)}
						onEdited={() => showToast(ENTRY_TEXT.changesSaved)}
						onGone={(id) => {
							showToast(TRANSACTIONS_TEXT.deletedElsewhere);
							gone.current(id);
						}}
						onDelete={(row, onConfirmed) =>
							deletes.remove(row, { onConfirmed })
						}
						locale={shown}
						firstDayOfWeek={shown.weekStart}
					/>
				)}
			</EntryDialogOpenContext>
		</EntryDialogContext>
	);
}
