"use client";

import { useQueryClient } from "@tanstack/react-query";
import { type ReactNode, useEffect, useRef, useState } from "react";

import { TransactionRow } from "@/components/data/TransactionRow";
import { dismissToast, showToast } from "@/components/feedback/showToast";
import { ConfirmDialog } from "@/components/surfaces/ConfirmDialog";
import { useMe } from "@/hooks/useMe";
import { uuidV7 } from "@/lib/ids";
import type { ProfileBlock } from "@/lib/profile";
import { todayIn } from "@/lib/time";
import type { TransactionDeleteInput } from "@/lib/transactions/schemas";
import { useDeleteTransaction } from "../hooks/useDeleteTransaction";
import {
	DeleteDialogOpenContext,
	DeletedRowsContext,
	type RestoredAnswer,
	type TransactionDeletesApi,
	TransactionDeletesContext,
} from "../hooks/useTransactionDeletes";
import { conflictRows } from "../lib/conflict";
import { rowDisplay } from "../lib/labels";
import { TRANSACTIONS_TEXT } from "../lib/messages";
import { refreshAfterTransactionWrite } from "../lib/refresh";
import type { TransactionAnswer } from "../lib/types";
import { readDeleteError } from "../lib/write-errors";
import { ConflictDialog } from "./ConflictDialog";

export type TransactionDeletesHostProps = {
	/** The profile as the server read it, for the conflict view's formats; `/api/me` takes over
	 * once it answers. */
	profile: ProfileBlock;
	children: ReactNode;
};

/** How long Undo is offered before the request is sent (BR-F03-26, D-84). */
export const UNDO_MS = 5000;

/** A delete whose Undo window is open: its timer and its toast. */
type Waiting = { timer: ReturnType<typeof setTimeout>; toast: string | number };

/** A delete waiting for the confirm, and what its caller does once it is confirmed. */
type Asking = { row: TransactionAnswer; onConfirmed: () => void };

/** A delete the server refused with 409: the row as it was deleted, and as it is saved now. */
type Conflict = { row: TransactionAnswer; current: TransactionAnswer };

/** A charge's cached Subscription and due date go with its delete (BR-F03-17). */
function hintOf(row: TransactionAnswer): TransactionDeleteInput {
	return row.subscriptionId !== null && row.dueOn !== null ?
			{ subscriptionId: row.subscriptionId, dueOn: row.dueOn }
		:	{};
}

const noAnswer: RestoredAnswer = () => {};

/**
 * Deletes with Undo for every logged-in page (BR-F03-26, D-84, D-556). Each first asks "Delete
 * this Transaction?", showing the row as the list does; Cancel keeps it. Until M5's write queue, the
 * 5-second hold is a timer in the tab, so moving between pages keeps it and closing the tab
 * cancels it. A row leaves every list at once and stays out once the server confirms; Undo
 * brings it back and the page that answers selects it.
 *
 * After the window: a 404 counts as done (D-239); a 409 opens the conflict view, where "Delete
 * anyway" deletes at the saved version and "Keep it" brings the row back as saved; any other
 * refusal, or no answer, brings the row back with its reason in a toast.
 */
export function TransactionDeletesHost({
	profile,
	children,
}: Readonly<TransactionDeletesHostProps>) {
	const { data: me } = useMe();
	const shown = me?.profile ?? profile;
	const queryClient = useQueryClient();
	const send = useDeleteTransaction();
	const [deleted, setDeleted] = useState<ReadonlySet<string>>(() => new Set());
	const [conflicts, setConflicts] = useState<readonly Conflict[]>([]);
	// The row the confirm asks about, and what its caller does once it is confirmed.
	const [asking, setAsking] = useState<Asking | null>(null);
	const waiting = useRef(new Map<string, Waiting>());
	const restored = useRef<RestoredAnswer>(noAnswer);

	const hide = (id: string) => setDeleted((ids) => new Set(ids).add(id));
	const unhide = (id: string) =>
		setDeleted((ids) => {
			const rest = new Set(ids);
			rest.delete(id);
			return rest;
		});

	/** Sends the delete at `version`, and answers what the server says. */
	const sendDelete = async (row: TransactionAnswer, version: number) => {
		try {
			await send.mutateAsync({
				id: row.id,
				version,
				idempotencyKey: uuidV7(),
				hint: hintOf(row),
			});
		} catch (error) {
			const outcome = readDeleteError(error);
			if (outcome.kind === "conflict") {
				setConflicts((list) => [
					...list.filter((each) => each.row.id !== row.id),
					{ row, current: outcome.current },
				]);
				return;
			}
			unhide(row.id);
			if (outcome.kind === "refused") {
				showToast(outcome.message, { tone: "error" });
			}
		}
	};

	// The timers outlive renders, so they call the latest `sendDelete`.
	const sendDeleteRef = useRef(sendDelete);
	useEffect(() => {
		sendDeleteRef.current = sendDelete;
	});

	/** Starts the Undo window for a confirmed delete. */
	const start = (row: TransactionAnswer) => {
		if (waiting.current.has(row.id)) return;
		hide(row.id);
		const undo = () => {
			const held = waiting.current.get(row.id);
			if (!held) return;
			clearTimeout(held.timer);
			waiting.current.delete(row.id);
			unhide(row.id);
			restored.current(row);
		};
		const toast = showToast(TRANSACTIONS_TEXT.deleted, {
			action: TRANSACTIONS_TEXT.undo,
			onAction: undo,
			// The timer closes it; this only keeps Sonner from closing it first.
			duration: UNDO_MS + 1000,
		});
		const timer = setTimeout(() => {
			waiting.current.delete(row.id);
			dismissToast(toast);
			void sendDeleteRef.current(row, row.version);
		}, UNDO_MS);
		waiting.current.set(row.id, { timer, toast });
	};

	const [api] = useState<TransactionDeletesApi>(() => ({
		remove: (row, options) => {
			if (waiting.current.has(row.id)) return;
			setAsking(
				(current) =>
					current ?? {
						row,
						onConfirmed: options?.onConfirmed ?? (() => {}),
					},
			);
		},
		answerRestores: (answer) => {
			restored.current = answer;
			return () => {
				if (restored.current === answer) restored.current = noAnswer;
			};
		},
	}));

	// Closing the tab, or logging out, cancels what is still waiting (BR-F03-26, before M5).
	useEffect(() => {
		const held = waiting.current;
		return () => {
			for (const { timer, toast } of held.values()) {
				clearTimeout(timer);
				dismissToast(toast);
			}
			held.clear();
		};
	}, []);

	const conflict = conflicts[0];
	const locale = { ...shown, today: todayIn(shown.timezone, new Date()) };
	const close = (id: string) =>
		setConflicts((list) => list.filter((each) => each.row.id !== id));

	return (
		<TransactionDeletesContext value={api}>
			<DeletedRowsContext value={deleted}>
				<DeleteDialogOpenContext
					value={asking !== null || conflict !== undefined}
				>
					{children}
					{asking && (
						<ConfirmDialog
							title={TRANSACTIONS_TEXT.deleteTitle}
							isOpen
							onOpenChange={(open) => {
								if (!open) setAsking(null);
							}}
							confirmLabel="Delete"
							onConfirm={() => {
								setAsking(null);
								asking.onConfirmed();
								start(asking.row);
							}}
						>
							<div className="flex flex-col gap-3">
								<TransactionRow
									{...rowDisplay(asking.row, "none", locale)}
									className="border-line rounded-control border px-3"
								/>
								<p>{TRANSACTIONS_TEXT.deleteBody}</p>
							</div>
						</ConfirmDialog>
					)}
					{conflict && (
						<ConflictDialog
							key={conflict.row.id}
							isOpen
							isDelete
							rows={conflictRows(
								conflict.row,
								{},
								conflict.current,
								locale,
							)}
							onOpenChange={(open) => {
								if (!open) keepIt(conflict);
							}}
							onKeepMine={() => {
								close(conflict.row.id);
								void sendDelete(
									conflict.row,
									conflict.current.version,
								);
							}}
							onKeepTheirs={() => keepIt(conflict)}
						/>
					)}
				</DeleteDialogOpenContext>
			</DeletedRowsContext>
		</TransactionDeletesContext>
	);

	/** Keep it (BR-F03-26): the row comes back as it is saved now, and the page selects it. */
	function keepIt({ row, current }: Conflict) {
		close(row.id);
		unhide(row.id);
		void refreshAfterTransactionWrite(queryClient, {
			kind: "edit",
			row: current,
		});
		restored.current(current);
	}
}
