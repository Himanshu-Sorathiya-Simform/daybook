"use client";

import { useEffect, useRef, useState } from "react";

import { Banner } from "@/components/feedback/Banner";
import { showToast } from "@/components/feedback/showToast";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { useOnline } from "@/hooks/useOnline";
import { useShortcut } from "@/hooks/useShortcut";
import { cn } from "@/lib/cn";
import { formatTime } from "@/lib/date-format";
import type { WeekStart } from "@/lib/geo";
import { isGoalType } from "@/lib/transactions/model";
import { matchesFilter } from "@/lib/transactions/match";
import {
	useCreatedAnswer,
	useEntryDialog,
	useEntryDialogOpen,
	useGoneAnswer,
} from "../hooks/useEntryDialog";
import { useSelectedTransaction } from "../hooks/useSelectedTransaction";
import {
	useDeleteDialogOpen,
	useDeletedRows,
	useRestoredAnswer,
	useTransactionDeletes,
} from "../hooks/useTransactionDeletes";
import { useTransactionSummary } from "../hooks/useTransactionSummary";
import { useTransactionsUrl } from "../hooks/useTransactionsUrl";
import { ENTRY_TEXT } from "../lib/entry";
import type { LabelLocale } from "../lib/labels";
import type { TransactionAnswer } from "../lib/types";
import { TRANSACTIONS_TEXT } from "../lib/messages";
import { FilterBar } from "./FilterBar";
import { HeaderTotals } from "./HeaderTotals";
import { TransactionList } from "./TransactionList";
import { TransactionPanel } from "./TransactionPanel";
import { type ViewDialog, ViewsBar } from "./ViewsBar";

export type TransactionsPageProps = {
	/** The profile's formats and its today, from the server render (TIME-5). */
	locale: LabelLocale;
	/** The profile's week start, the first column of the calendars (D-537). */
	weekStart: WeekStart;
	className?: string;
};

/** How many frames a focus move after a delete waits for the confirm to close. */
const FOCUS_FRAMES = 30;

/** The id of the row after `id` in the list as shown, else the one before: where focus goes
 * after a delete from the keyboard (BR-F03-73). */
function neighbourOf(list: HTMLElement | null, id: string): string | null {
	const keys = [
		...(list?.querySelectorAll<HTMLElement>('[role="row"][data-key]') ?? []),
	]
		.map((row) => row.dataset["key"])
		.filter((key): key is string => key !== undefined);
	const at = keys.indexOf(id);
	if (at === -1) return null;
	return keys[at + 1] ?? keys[at - 1] ?? null;
}

/** From this width the panel docks beside the list (BR-F03-70); the `dock` breakpoint. */
const DOCKED = "(min-width: 1180px)";

/**
 * The Transactions page (F03 section 6), from top to bottom: the title, with "as of" while
 * offline (D-533); the saved views bar (BR-F03-63 to BR-F03-69); the search box, the filter controls and the Group · Sort menu, then the
 * active filters as chips; the invalid-link notice (D-531); the header totals; and the list.
 * Beside them from 1180 px, the panel; below, its drawer while a row is selected (BR-F03-70).
 * Everything follows the URL (FIL-4), which the page reads and writes through
 * `useTransactionsUrl`, the selected row as `txn` (BR-F03-73).
 *
 * Keys (BR-F03-52): the arrow keys select, Enter and `E` edit the selected row, `D` duplicates
 * it, Delete or Backspace deletes it with Undo, and Escape clears it, none of them while a
 * dialog is open or in a text field. Rows deleted in this tab leave the list at once
 * (BR-F03-26).
 *
 * It answers the entry dialog's creates (BR-F03-21, BR-F03-22, D-548): a plain Save of a row the
 * filter shows selects it, and a row the filter hides says so, with Show to clear the filters.
 * `new=1` opens the dialog, and closing it removes the parameter (BR-F03-53).
 */
export function TransactionsPage({
	locale,
	weekStart,
	className,
}: Readonly<TransactionsPageProps>) {
	const url = useTransactionsUrl(locale.currency);
	const online = useOnline();
	const summary = useTransactionSummary({
		filter: url.filter,
		currency: locale.currency,
	});
	const entry = useEntryDialog();
	const deletes = useTransactionDeletes();
	const deleted = useDeletedRows();
	const dialogOpen = useEntryDialogOpen();
	const deleteOpen = useDeleteDialogOpen();
	const [viewDialog, setViewDialog] = useState<ViewDialog | null>(null);
	const listArea = useRef<HTMLDivElement>(null);
	// The row that takes focus once a delete from the keyboard is confirmed.
	const [focusAfter, setFocusAfter] = useState<{ id: string } | null>(null);
	// The server can't know the width: it renders the docked panel, which CSS hides below 1180 px.
	const isDocked = useMediaQuery(DOCKED, true);
	const selection = useSelectedTransaction({
		id: url.txn,
		filter: url.filter,
		list: url.list,
		currency: locale.currency,
		onMissing: () => url.select(null),
	});
	const shown = selection?.state === "shown" ? selection.row : null;
	// Goal rows wait for M2's Goal fields to be edited or copied (D-241).
	const anyDialog = dialogOpen || deleteOpen || viewDialog !== null;
	const actionable = shown !== null && !isGoalType(shown.type) && !anyDialog;
	const edit = () => {
		if (actionable) entry.openEdit(shown);
	};
	const duplicate = () => {
		if (actionable) entry.openDuplicate(shown);
	};
	/** Deletes a row after the confirm. From the keyboard, focus then moves on to the next row,
	 * or the one before when it was the last, with nothing selected (BR-F03-73). */
	const removeRow = (row: TransactionAnswer, byKeyboard: boolean) => {
		const next = byKeyboard ? neighbourOf(listArea.current, row.id) : null;
		deletes.remove(row, {
			onConfirmed: () => {
				if (next !== null) setFocusAfter({ id: next });
			},
		});
	};
	const remove = () => {
		if (actionable) removeRow(shown, true);
	};
	useEffect(() => {
		if (focusAfter === null) return;
		// The confirm gives focus back as it closes, so wait until it has gone.
		let tries = FOCUS_FRAMES;
		let frame = 0;
		const move = () => {
			const target = listArea.current?.querySelector<HTMLElement>(
				`[role="row"][data-key="${CSS.escape(focusAfter.id)}"]`,
			);
			if (target && !document.querySelector('[role="alertdialog"]')) {
				target.focus();
			} else if (--tries > 0) frame = requestAnimationFrame(move);
		};
		move();
		return () => cancelAnimationFrame(frame);
	}, [focusAfter]);
	useShortcut("E", edit, { enabled: actionable });
	useShortcut("D", duplicate, { enabled: actionable });
	useShortcut("Delete", remove, { enabled: actionable });
	useShortcut("Backspace", remove, { enabled: actionable });
	useShortcut("Escape", () => url.select(null), {
		enabled: url.txn !== null && !anyDialog,
		// Escape in a text field, a menu or the drawer belongs to them.
		ignoreInputs: true,
		ignoreDefaultPrevented: true,
	});

	useGoneAnswer(() => url.select(null));

	// A deleted row leaves the selection, and comes back selected after Undo or Keep it
	// (BR-F03-73).
	const { txn, select } = url;
	const selectedDeleted = txn !== null && deleted.has(txn);
	useEffect(() => {
		if (selectedDeleted) select(null);
	}, [selectedDeleted, select]);
	useRestoredAnswer((row) => url.select(row.id));

	useCreatedAnswer((row, kind) => {
		if (!matchesFilter(row, url.filter, locale.currency)) {
			showToast(ENTRY_TEXT.hidden, {
				action: ENTRY_TEXT.show,
				onAction: () => url.setFilter({}),
			});
			return;
		}
		if (kind === "save") url.select(row.id);
		showToast(ENTRY_TEXT.saved);
	});

	const { isNew, setNew } = url;
	useEffect(() => {
		if (isNew) entry.openNew({ onClose: () => setNew(false) });
	}, [isNew, entry, setNew]);

	return (
		<div
			className={cn(
				"dock:grid dock:grid-cols-[minmax(0,1fr)_minmax(20rem,25rem)] dock:items-start gap-5 px-8 py-7 max-md:px-4 max-md:py-5",
				className,
			)}
		>
			<div className="flex min-w-0 flex-col gap-3.5">
				<div className="flex flex-wrap items-baseline gap-x-3.5">
					<h1 className="text-title text-ink">Transactions</h1>
					{!online && summary.dataUpdatedAt > 0 && (
						<span className="text-label text-ink-2">
							as of{" "}
							{formatTime(new Date(summary.dataUpdatedAt), locale)}
						</span>
					)}
				</div>
				<ViewsBar
					filter={url.filter}
					list={url.list}
					viewId={url.view}
					locale={locale}
					isOffline={!online}
					onApply={(view, state) =>
						url.applyView(view, state.filter, state.list)
					}
					onMark={url.markView}
					dialog={viewDialog}
					onDialogChange={setViewDialog}
				/>
				<FilterBar
					filter={url.filter}
					list={url.list}
					onFilterChange={(filter, mode) =>
						url.setFilter(filter, url.list, mode)
					}
					onListChange={url.setList}
					locale={locale}
					firstDayOfWeek={weekStart}
					count={summary.data?.count}
					isOffline={!online}
				/>
				{url.notice && (
					<Banner
						kind="info"
						action="Dismiss"
						className="rounded-section border"
						onAction={url.dismissNotice}
					>
						{TRANSACTIONS_TEXT.invalidLink}
					</Banner>
				)}
				<HeaderTotals
					summary={summary.data}
					isError={
						summary.isError
						|| (!summary.data && summary.fetchStatus === "paused")
					}
					onRetry={() => void summary.refetch()}
					locale={locale}
				/>
				<div ref={listArea}>
					<TransactionList
						filter={url.filter}
						list={url.list}
						locale={locale}
						onClearFilters={() => url.setFilter({})}
						onAdd={() => entry.openNew()}
						hiddenIds={deleted}
						selectedId={url.txn}
						onSelect={url.select}
						onOpen={edit}
						selectionFollowsFocus={isDocked}
					/>
				</div>
			</div>
			<TransactionPanel
				isDocked={isDocked}
				selection={selection}
				summary={summary.isError ? undefined : summary.data}
				isSummaryPending={
					summary.isPending && summary.fetchStatus !== "paused"
				}
				locale={locale}
				isOnline={online}
				onClose={() => url.select(null)}
				onEdit={(row) => entry.openEdit(row)}
				onDuplicate={(row) => entry.openDuplicate(row)}
				onDelete={removeRow}
			/>
		</div>
	);
}
