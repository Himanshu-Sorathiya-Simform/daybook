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
} from "../hooks/useEntryDialog";
import { ENTRY_TEXT } from "../lib/entry";
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

/**
 * The one entry dialog of the logged-in pages (BR-F03-48, D-548). The shell's Add buttons, `N`
 * outside a text field, and whatever below calls `useEntryDialog` open it; each opening starts
 * fresh. A page may answer creates itself with `useCreatedAnswer`, as the Transactions page does
 * to select the new row; elsewhere a create says "Transaction saved.".
 */
export function EntryDialogHost({
	profile,
	children,
}: Readonly<EntryDialogHostProps>) {
	const { data: me } = useMe();
	const shown = me?.profile ?? profile;
	// Each opening mounts a new dialog, so nothing typed before survives a close.
	const [opening, setOpening] = useState(0);
	const [isOpen, setOpen] = useState(false);
	// Whether a dialog is open, known at once: two opens in one event make one dialog.
	const opened = useRef(false);
	const onClosed = useRef<(() => void) | undefined>(undefined);
	const answer = useRef<CreatedAnswer>(toastSaved);

	const [api] = useState<EntryDialogApi>(() => ({
		openNew: (options) => {
			if (opened.current) return;
			opened.current = true;
			onClosed.current = options?.onClose;
			setOpen(true);
			setOpening((count) => count + 1);
		},
		answerCreates: (next) => {
			answer.current = next;
			return () => {
				if (answer.current === next) answer.current = toastSaved;
			};
		},
	}));

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
			{children}
			{opening > 0 && (
				<EntryDialog
					key={opening}
					isOpen={isOpen}
					onClose={close}
					onCreated={(row, kind) => answer.current(row, kind)}
					locale={shown}
					firstDayOfWeek={shown.weekStart}
				/>
			)}
		</EntryDialogContext>
	);
}
