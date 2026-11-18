import { useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";

import type { CurrencyCode } from "@/lib/currency";
import { type BudgetRules, removeMonth } from "@/lib/budgets/model";
import type { Month } from "@/lib/budgets/months";
import type { BudgetRecord } from "@/lib/budgets/view";
import { useOnce } from "@/hooks/useOnce";
import { uuidV7 } from "@/lib/ids";
import { CONFLICT_TEXT, keepMineLine } from "../lib/conflict";
import type { Formats } from "../lib/labels";
import {
	removalNotice,
	rulesOf,
	type UndoPlan,
	type WriteNotice,
} from "../lib/notices";
import { refreshAfterBudgetWrite } from "../lib/refresh";
import type { BudgetAnswer } from "../lib/types";
import {
	type BudgetNoticeOutcome,
	readBudgetNoticeError,
} from "../lib/write-errors";
import { useCreateBudget } from "./useCreateBudget";
import { useDeleteBudget } from "./useDeleteBudget";
import { useEditBudget } from "./useEditBudget";
import { useRemoveMonthLimit } from "./useRemoveMonthLimit";

/** The notice on the page (BR-F04-29): a confirmed write with Undo, or the failure of an Undo or
 * a Remove, which has no Undo left. `id` tells one notice from the next. */
export type BudgetNotice = Omit<WriteNotice, "undo"> & {
	id: number;
	/** The month it was shown in: a change of month ends it. */
	month: Month;
	undo: UndoPlan | null;
	failure: string | null;
};

/** A 409 on an Undo or a Remove: what the conflict view shows (BR-F04-23). */
export type BudgetNoticeConflict = {
	/** The Budget saved now. */
	current: BudgetAnswer;
	/** The user's version: what Undo puts back, or the Budget with the one-month limit gone. */
	yours: BudgetRules;
	/** What Keep mine saves; a delete's view has none. */
	line: string | null;
	/** An Undo that deletes (after a create): "Delete anyway" and "Keep it". */
	isDelete: boolean;
};

/** The write whose conflict is shown, and the month the page showed when it was sent: a change
 * of month, or for an Undo a new notice, ends the view with what it was about. */
type Pending = { viewed: Month } & (
	| { source: "undo"; noticeId: number; plan: UndoPlan }
	| { source: "remove"; record: BudgetRecord; month: Month }
);

/** What the page shows of the notice and the writes behind it. */
export type BudgetNotices = {
	notice: BudgetNotice | null;
	/** A confirmed write's notice replaces the one before it. */
	show: (notice: WriteNotice) => void;
	/** Sends what Undo undoes, once at a time; the notice ends when it is confirmed and reads
	 * the failure when it is not. */
	undo: () => void;
	dismiss: () => void;
	/** Remove on a one-month limit in the limit history (BR-F04-25). */
	remove: (record: BudgetRecord, month: Month) => void;
	isUndoing: boolean;
	isRemoving: boolean;
	/** The conflict view's content after a 409 on Undo or Remove, or `null`. */
	conflict: BudgetNoticeConflict | null;
	/** Keep mine, or "Delete anyway": the write again, against the saved version. */
	keepMine: () => void;
	/** Keep theirs, or "Keep it": nothing is sent, the saved Budget shows, an Undo notice ends. */
	keepTheirs: () => void;
	/** Closing the view without a choice: nothing is sent and the notice stays. */
	closeConflict: () => void;
};

/**
 * The page's inline notice, never a toast (BR-F04-29, D-562), and the writes that come with it:
 * Undo, which sends `DELETE`, a restoring `PATCH` or a restoring `POST` as the notice's plan
 * says, and Remove in the limit history. It lasts until Undo, Dismiss, the next write or a
 * change of `month`. Each write is sent at once with a new key (D-569); offline or refused, the
 * notice reads the failure with Dismiss. A version conflict opens the conflict view instead
 * (BR-F04-23): Keep mine sends the write again against the saved version, which for an Undo
 * that would create a Budget made meanwhile is a restoring `PATCH` of that Budget (D-578). A
 * result that arrives after the notice has been replaced leaves the newer notice alone.
 */
export function useBudgetNotices({
	month,
	currency,
	formats,
}: {
	month: Month;
	currency: CurrencyCode;
	formats: Formats;
}): BudgetNotices {
	const queryClient = useQueryClient();
	const [notice, setNotice] = useState<BudgetNotice | null>(null);
	const [conflictOf, setConflictOf] = useState<
		(BudgetNoticeConflict & { pending: Pending }) | null
	>(null);
	const counter = useRef(0);
	// One write at a time for Undo and one for Remove, taken on the press itself (D-575).
	const undoing = useOnce();
	const removing = useOnce();
	const create = useCreateBudget();
	const edit = useEditBudget();
	const remove = useDeleteBudget();
	const removeLimit = useRemoveMonthLimit();

	// A change of month ends the notice, React's pattern for state that follows what was read.
	if (notice !== null && notice.month !== month) setNotice(null);
	// A conflict that arrives after what it was about has ended is not shown: the page has moved
	// on to another month, or the Undo's notice was replaced or dismissed (D-575).
	if (
		conflictOf !== null
		&& (conflictOf.pending.viewed !== month
			|| (conflictOf.pending.source === "undo"
				&& notice?.id !== conflictOf.pending.noticeId))
	) {
		setConflictOf(null);
	}

	const show = (next: WriteNotice) => {
		counter.current += 1;
		setNotice({ ...next, id: counter.current, month, failure: null });
	};
	/** The notice reads `message` instead, if it is still the one that was asked for. */
	const fail = (id: number, message: string) =>
		setNotice((was) =>
			was?.id === id ? { ...was, undo: null, failure: message } : was,
		);
	const clear = (id: number) => setNotice((was) => (was?.id === id ? null : was));
	/** A failed Remove has no notice to turn into a failure, so it shows one of its own. */
	const failRemove = (record: BudgetRecord, message: string) => {
		counter.current += 1;
		setNotice({
			category: record.category,
			text: "",
			inPanel: true,
			id: counter.current,
			month,
			undo: null,
			failure: message,
		});
	};

	/** Sends an Undo against `version`, the notice's own or after a conflict the saved one. */
	const send = (plan: UndoPlan, saved?: BudgetAnswer) => {
		if (saved) {
			// Against the saved Budget, every Undo is a write to it: a delete deletes it, anything
			// else restores it (a restoring `POST` would find it there).
			return plan.kind === "delete" ?
					remove.mutateAsync({
						id: saved.id,
						version: saved.version,
						idempotencyKey: uuidV7(),
					})
				:	edit.mutateAsync({
						id: saved.id,
						version: saved.version,
						body: { ...rulesOf(plan.rules), currency },
						idempotencyKey: uuidV7(),
					});
		}
		switch (plan.kind) {
			case "delete":
				return remove.mutateAsync({
					id: plan.id,
					version: plan.version,
					idempotencyKey: uuidV7(),
				});
			case "restore":
				return edit.mutateAsync({
					id: plan.id,
					version: plan.version,
					body: { ...rulesOf(plan.rules), currency },
					idempotencyKey: uuidV7(),
				});
			case "recreate":
				return create.mutateAsync({
					body: {
						id: uuidV7(),
						category: plan.category,
						...rulesOf(plan.rules),
						currency,
					},
					idempotencyKey: uuidV7(),
				});
		}
	};
	const isUndoing = create.isPending || edit.isPending || remove.isPending;

	/** What an Undo's refusal does: the conflict view, or the notice's failure. */
	const refusedUndo = (
		outcome: BudgetNoticeOutcome,
		id: number,
		plan: UndoPlan,
	) => {
		if (outcome.kind === "conflict") {
			setConflictOf({
				current: outcome.current,
				yours: rulesOf(plan.rules),
				line: plan.kind === "delete" ? null : CONFLICT_TEXT.undoLine,
				isDelete: plan.kind === "delete",
				pending: { source: "undo", noticeId: id, plan, viewed: month },
			});
			return;
		}
		setConflictOf(null);
		if (outcome.kind === "handled") return;
		if (outcome.kind === "gone")
			void refreshAfterBudgetWrite(queryClient, "count");
		fail(id, outcome.message);
	};

	const undo = () => {
		if (notice === null || notice.undo === null) return;
		const { id, undo: plan } = notice;
		void undoing
			.run(() => send(plan))
			?.then(
				() => clear(id),
				(error: unknown) =>
					refusedUndo(readBudgetNoticeError(error), id, plan),
			);
	};

	/** What a Remove's refusal does: the conflict view, or a failure notice. */
	const refusedRemove = (
		outcome: BudgetNoticeOutcome,
		record: BudgetRecord,
		limitMonth: Month,
	) => {
		if (outcome.kind === "conflict") {
			setConflictOf({
				current: outcome.current,
				// Remove is offered only on a one-month limit the Budget holds.
				yours: removeMonth(record, limitMonth) as BudgetRules,
				line: keepMineLine({ kind: "removal", month: limitMonth }, formats),
				isDelete: false,
				pending: {
					source: "remove",
					record,
					month: limitMonth,
					viewed: month,
				},
			});
			return;
		}
		setConflictOf(null);
		if (outcome.kind === "handled") return;
		if (outcome.kind === "gone")
			void refreshAfterBudgetWrite(queryClient, "count");
		failRemove(record, outcome.message);
	};

	const removeOne = (record: BudgetRecord, limitMonth: Month) => {
		void removing
			.run(() =>
				removeLimit.mutateAsync({
					id: record.id,
					month: limitMonth,
					version: record.version,
					idempotencyKey: uuidV7(),
				}),
			)
			?.then(
				(saved) =>
					show(
						removalNotice({
							month: limitMonth,
							before: record,
							saved,
							formats,
						}),
					),
				(error: unknown) =>
					refusedRemove(readBudgetNoticeError(error), record, limitMonth),
			);
	};

	const keepMine = () => {
		if (conflictOf === null || undoing.isRunning() || removing.isRunning())
			return;
		const { pending, current } = conflictOf;
		if (pending.source === "undo") {
			const { noticeId, plan } = pending;
			void undoing
				.run(() => send(plan, current))
				?.then(
					() => {
						setConflictOf(null);
						clear(noticeId);
					},
					(error: unknown) =>
						refusedUndo(readBudgetNoticeError(error), noticeId, plan),
				);
			return;
		}
		const { record, month: limitMonth } = pending;
		void removing
			.run(() =>
				removeLimit.mutateAsync({
					id: current.id,
					month: limitMonth,
					version: current.version,
					idempotencyKey: uuidV7(),
				}),
			)
			?.then(
				(saved) => {
					setConflictOf(null);
					show(
						removalNotice({
							month: limitMonth,
							before: current,
							saved,
							formats,
						}),
					);
				},
				(error: unknown) =>
					refusedRemove(readBudgetNoticeError(error), record, limitMonth),
			);
	};

	const keepTheirs = () => {
		if (conflictOf === null) return;
		const { pending } = conflictOf;
		setConflictOf(null);
		void refreshAfterBudgetWrite(queryClient, "rules");
		if (pending.source === "undo") clear(pending.noticeId);
	};

	return {
		notice,
		show,
		undo,
		dismiss: () => setNotice(null),
		remove: removeOne,
		isUndoing,
		isRemoving: removeLimit.isPending,
		conflict:
			conflictOf === null ? null : (
				{
					current: conflictOf.current,
					yours: conflictOf.yours,
					line: conflictOf.line,
					isDelete: conflictOf.isDelete,
				}
			),
		keepMine,
		keepTheirs,
		closeConflict: () => setConflictOf(null),
	};
}
