"use client";

import type { ExpenseCategory } from "@/lib/budgets/model";
import type { BudgetRecord } from "@/lib/budgets/view";
import type { BudgetNotices } from "../hooks/useBudgetNotice";
import type { DialogKind } from "../lib/dialog";
import type { WriteNotice } from "../lib/notices";
import type { BudgetAnswer, BudgetMonthAnswer, BudgetsLocale } from "../lib/types";
import { BudgetDialog } from "./BudgetDialog";
import { DeleteBudgetDialog } from "./DeleteBudgetDialog";
import { DialogConflict } from "./DialogConflict";

/** The dialog open over the page: Add, Change limit or Stop, or Delete's confirmation with the
 * Budget it deletes. `opened` starts each one afresh. */
export type OpenDialog =
	| { kind: DialogKind; category: ExpenseCategory | null; opened: number }
	| { kind: "delete"; record: BudgetRecord; opened: number };

export type BudgetDialogsProps = {
	/** The dialog to show, or `null` for none. */
	dialog: OpenDialog | null;
	/** Whether it is open: it stays mounted while it closes. */
	isOpen: boolean;
	/** The month shown; Add, Change limit and Stop work on it. */
	data: BudgetMonthAnswer | undefined;
	locale: BudgetsLocale;
	onClose: () => void;
	/** A delete is confirmed: the Budget it deleted. */
	onDeleted: (record: BudgetRecord) => void;
	/** A write from the dialog is confirmed, with the notice it earns. */
	onSaved: (saved: BudgetAnswer, written: WriteNotice) => void;
	/** "Delete Budget instead" in Stop swaps the dialog for Delete's confirmation. */
	onDeleteInstead: (record: BudgetRecord) => void;
	/** The refused Undo or Remove's conflict view, and what its buttons do. */
	notices: Pick<
		BudgetNotices,
		| "conflict"
		| "isUndoing"
		| "isRemoving"
		| "closeConflict"
		| "keepMine"
		| "keepTheirs"
	>;
};

/**
 * The dialog the page has open (BR-F04-19 to BR-F04-21, BR-F04-06), and the conflict view of a
 * refused Undo or Remove (BR-F04-23). Add, Change limit and Stop are one dialog; Delete is its
 * own confirmation.
 */
export function BudgetDialogs({
	dialog,
	isOpen,
	data,
	locale,
	onClose,
	onDeleted,
	onSaved,
	onDeleteInstead,
	notices,
}: Readonly<BudgetDialogsProps>) {
	return (
		<>
			{notices.conflict && (
				<DialogConflict
					yours={notices.conflict.yours}
					current={notices.conflict.current}
					formats={locale}
					keepMineLine={notices.conflict.line ?? undefined}
					isDelete={notices.conflict.isDelete}
					isPending={notices.isUndoing || notices.isRemoving}
					onClose={notices.closeConflict}
					onKeepMine={notices.keepMine}
					onKeepTheirs={notices.keepTheirs}
				/>
			)}
			{dialog?.kind === "delete" && (
				<DeleteBudgetDialog
					key={dialog.opened}
					isOpen={isOpen}
					record={dialog.record}
					formats={locale}
					onClose={onClose}
					onDeleted={onDeleted}
				/>
			)}
			{dialog && dialog.kind !== "delete" && data && (
				<BudgetDialog
					key={dialog.opened}
					isOpen={isOpen}
					kind={dialog.kind}
					category={dialog.category}
					view={data}
					locale={locale}
					onClose={onClose}
					onSaved={onSaved}
					onDeleteInstead={onDeleteInstead}
				/>
			)}
		</>
	);
}
