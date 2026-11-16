import { useRef, useState } from "react";

import type { CurrencyCode } from "@/lib/currency";
import type { Month } from "@/lib/budgets/months";
import type { BudgetRecord } from "@/lib/budgets/view";
import { uuidV7 } from "@/lib/ids";
import { BUDGETS_TEXT } from "../lib/messages";
import {
	removalNotice,
	rulesOf,
	type UndoPlan,
	type WriteNotice,
} from "../lib/notices";
import type { Formats } from "../lib/labels";
import { readBudgetNoticeError } from "../lib/write-errors";
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
};

/**
 * The page's inline notice, never a toast (BR-F04-29, D-562), and the writes that come with it:
 * Undo, which sends `DELETE`, a restoring `PATCH` or a restoring `POST` as the notice's plan
 * says, and Remove in the limit history. It lasts until Undo, Dismiss, the next write or a
 * change of `month`. Each write is sent at once with a new key (D-569); offline or refused, the
 * notice reads the failure with Dismiss. A refusal that is a version conflict waits for the
 * conflict view; until then it reads the failure too. A result that arrives after the notice
 * has been replaced leaves the newer notice alone.
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
	const [notice, setNotice] = useState<BudgetNotice | null>(null);
	const counter = useRef(0);
	const create = useCreateBudget();
	const edit = useEditBudget();
	const remove = useDeleteBudget();
	const removeLimit = useRemoveMonthLimit();

	// A change of month ends the notice, React's pattern for state that follows what was read.
	if (notice !== null && notice.month !== month) setNotice(null);

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

	const send = (plan: UndoPlan) => {
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

	const undo = () => {
		if (notice === null || notice.undo === null || isUndoing) return;
		const { id, undo: plan } = notice;
		void send(plan).then(
			() => clear(id),
			(error: unknown) => {
				const outcome = readBudgetNoticeError(error);
				// The conflict view comes with C9b; until then the notice says it failed.
				if (outcome.kind === "failed") fail(id, outcome.message);
				else if (outcome.kind === "conflict") {
					fail(id, BUDGETS_TEXT.noticeFailed);
				}
			},
		);
	};

	const removeOne = (record: BudgetRecord, limitMonth: Month) => {
		if (removeLimit.isPending) return;
		void removeLimit
			.mutateAsync({
				id: record.id,
				month: limitMonth,
				version: record.version,
				idempotencyKey: uuidV7(),
			})
			.then(
				(saved) =>
					show(
						removalNotice({
							month: limitMonth,
							before: record,
							saved,
							formats,
						}),
					),
				(error: unknown) => {
					const outcome = readBudgetNoticeError(error);
					if (outcome.kind === "handled") return;
					counter.current += 1;
					setNotice({
						category: record.category,
						text: "",
						inPanel: true,
						id: counter.current,
						month,
						undo: null,
						failure:
							outcome.kind === "failed" ?
								outcome.message
							:	BUDGETS_TEXT.noticeFailed,
					});
				},
			);
	};

	return {
		notice,
		show,
		undo,
		dismiss: () => setNotice(null),
		remove: removeOne,
		isUndoing,
		isRemoving: removeLimit.isPending,
	};
}
