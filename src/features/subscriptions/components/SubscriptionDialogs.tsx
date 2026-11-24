"use client";

import type { SubscriptionNotices } from "../hooks/useSubscriptionNotice";
import { conflictRows, fieldsOf } from "../lib/conflict";
import type { DialogKind } from "../lib/dialog";
import type { Confirmed } from "../lib/notices";
import type { SubscriptionItem, SubscriptionsLocale } from "../lib/types";
import { CancelDialog } from "./CancelDialog";
import { ConflictDialog } from "./ConflictDialog";
import { DeleteDialog } from "./DeleteDialog";
import { PauseDialog } from "./PauseDialog";
import { ResumeDialog } from "./ResumeDialog";
import { SubscriptionDialog } from "./SubscriptionDialog";

/** The dialog that is open and the Subscription it is about: `null` for Add. */
export type OpenDialog = { kind: DialogKind; item: SubscriptionItem | null };

export type SubscriptionDialogsProps = {
	/** The dialog to show, or `null` for none. */
	dialog: OpenDialog | null;
	/** Every Subscription, for the cost line of an Edit. */
	items: readonly SubscriptionItem[];
	locale: SubscriptionsLocale;
	/** Closes the dialog without a write. */
	onClose: () => void;
	/** A write from a dialog is confirmed. */
	onSaved: (write: Confirmed) => void;
	/** "Cancel it instead" in Delete swaps the dialog for Cancel on the same Subscription. */
	onCancelInstead: (item: SubscriptionItem) => void;
	/** The refused write's conflict view, and what its buttons do. */
	notices: Pick<
		SubscriptionNotices,
		"conflict" | "isUndoing" | "closeConflict" | "keepMine" | "keepTheirs"
	>;
};

/**
 * The dialog the page has open (BR-F05-24 to BR-F05-32), and the conflict view of a refused
 * write (BR-F05-35). Add and Edit are one dialog; Cancel, Resume, Pause and Delete need the
 * Subscription they are about.
 */
export function SubscriptionDialogs({
	dialog,
	items,
	locale,
	onClose,
	onSaved,
	onCancelInstead,
	notices,
}: Readonly<SubscriptionDialogsProps>) {
	const common = { isOpen: true, locale, onClose } as const;
	const item = dialog?.item ?? null;
	return (
		<>
			{(dialog?.kind === "add" || dialog?.kind === "edit") && (
				<SubscriptionDialog
					{...common}
					item={dialog.item}
					items={items}
					onSaved={onSaved}
				/>
			)}
			{item && dialog?.kind === "cancel" && (
				<CancelDialog
					{...common}
					item={item}
					onSaved={onSaved}
				/>
			)}
			{item && dialog?.kind === "resume" && (
				<ResumeDialog
					{...common}
					item={item}
					onSaved={onSaved}
				/>
			)}
			{item && dialog?.kind === "pause" && (
				<PauseDialog
					{...common}
					item={item}
					onSaved={onSaved}
				/>
			)}
			{notices.conflict && (
				<ConflictDialog
					isOpen
					// It only ever reports closing.
					onOpenChange={notices.closeConflict}
					rows={conflictRows(
						notices.conflict.yours,
						fieldsOf(notices.conflict.current),
						locale,
					)}
					keepMineLine={notices.conflict.line}
					isDelete={notices.conflict.isDelete}
					isPending={notices.isUndoing}
					onKeepMine={notices.keepMine}
					onKeepTheirs={notices.keepTheirs}
				/>
			)}
			{item && dialog?.kind === "delete" && (
				<DeleteDialog
					{...common}
					item={item}
					onCancelInstead={onCancelInstead}
					onDeleted={onSaved}
				/>
			)}
		</>
	);
}
