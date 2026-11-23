"use client";

import { Check, CircleAlert, X } from "lucide-react";

import { Button } from "@/components/actions/Button";
import { IconButton } from "@/components/actions/IconButton";
import { cn } from "@/lib/cn";

/** The words of the two buttons, the same on every page that has a notice. */
export const NOTICE_TEXT = { undo: "Undo", dismiss: "Dismiss" } as const;

export type UndoNoticeProps = {
	/** What was done, or what went wrong. */
	text: string;
	/** The text is a failure: no Undo, and it is announced at once. */
	isFailure?: boolean;
	/** Undo has been sent and is waiting for the answer. */
	isPending?: boolean;
	/** Undoes the write; left out for a failure. */
	onUndo?: () => void;
	onDismiss: () => void;
	className?: string;
};

/**
 * The inline notice after a write (BR-F04-29, BR-F05-33), in the panel or above the list: what was
 * done, with Undo and Dismiss, never a toast. A failed Undo or Remove reads its failure with
 * Dismiss alone, and is announced at once; the rest politely. While Undo is on its way the
 * button waits and Dismiss rests, so the answer finds the notice where it was.
 */
export function UndoNotice({
	text,
	isFailure = false,
	isPending = false,
	onUndo,
	onDismiss,
	className,
}: Readonly<UndoNoticeProps>) {
	const Icon = isFailure ? CircleAlert : Check;
	return (
		<div
			role={isFailure ? "alert" : "status"}
			className={cn(
				"rounded-section border-line-strong bg-page text-label text-ink flex items-center gap-2.5 border py-2 pr-2 pl-3 font-medium",
				className,
			)}
		>
			<Icon
				aria-hidden="true"
				className={cn(
					"size-4 shrink-0",
					isFailure ? "text-neg" : "text-ink-2",
				)}
			/>
			<span className="min-w-0 flex-1">{text}</span>
			{onUndo && (
				<Button
					variant="ghost"
					size="sm"
					isPending={isPending}
					onPress={onUndo}
				>
					{NOTICE_TEXT.undo}
				</Button>
			)}
			<IconButton
				icon={X}
				label={NOTICE_TEXT.dismiss}
				variant="plain"
				size="sm"
				isDisabled={isPending}
				onPress={onDismiss}
			/>
		</div>
	);
}
