"use client";

import type { SortingState } from "@tanstack/react-table";
import { useState } from "react";

import { Banner } from "@/components/feedback/Banner";
import { EmptyState } from "@/components/feedback/EmptyState";
import { Section } from "@/components/surfaces/Section";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { useWideWindow } from "@/hooks/useWideWindow";
import { useOnline } from "@/hooks/useOnline";
import type { ExpenseCategory } from "@/lib/budgets/model";
import { type Month, monthOf } from "@/lib/budgets/months";
import { cn } from "@/lib/cn";
import { formatMonth } from "@/lib/date-format";
import { useBudgetMonth } from "../hooks/useBudgetMonth";
import { useBudgetSelection } from "../hooks/useBudgetSelection";
import { useBudgetShortcuts } from "../hooks/useBudgetShortcuts";
import { useBudgetNotices } from "../hooks/useBudgetNotice";
import { useBudgetsUrl } from "../hooks/useBudgetsUrl";
import { useStoredChoice } from "@/hooks/useStoredChoice";
import { useMonthFilter } from "../hooks/useMonthFilter";
import type { RowArrows } from "@/hooks/useRowArrows";
import { dayOfMonth } from "../lib/labels";
import {
	asOfText,
	emptyTitle,
	offlineAction,
	offlineBody,
	PAGE_TEXT,
} from "../lib/messages";
import { recordIn } from "../lib/dialog";
import { deletionNotice } from "../lib/notices";
import { selectionKeys, subjectOf } from "../lib/panel";
import type { BudgetMonthAnswer, BudgetsLocale } from "../lib/types";
import {
	BUDGET_VIEWS,
	type BudgetsView,
	pageShape,
	VIEW_COOKIE,
	VIEW_KEY,
} from "../lib/view";
import { BudgetDialogs, type OpenDialog } from "./BudgetDialogs";
import { BudgetPanel } from "./BudgetPanel";
import { BudgetsHeader } from "./BudgetsHeader";
import { BudgetsOverview } from "./BudgetsOverview";
import { BudgetsSkeleton } from "./BudgetsSkeleton";
import { BudgetsViews } from "./BudgetsViews";
import { UndoNotice } from "@/components/feedback/UndoNotice";

export type BudgetsPageProps = {
	/** The profile's formats and its today, from the server render (TIME-5). */
	locale: BudgetsLocale;
	/** The view this device remembers and whether its window was last wide, from the cookies
	 * the server reads, so the first draw is the right one (D-629). */
	initialView?: BudgetsView;
	initialWide?: boolean;
	className?: string;
};

/** From here up the panel docks beside the list (BR-F04-30); the `dock` breakpoint. */
const DOCKED = "(min-width: 1180px)";

/** What Up and Down do in the list: nothing while a dialog or the drawer is open (D-571,
 * D-573), select with the panel docked, else only move focus. */
function arrowsFor(isCovered: boolean, isDocked: boolean): RowArrows {
	if (isCovered) return "off";
	return isDocked ? "select" : "focus";
}

/**
 * The Budgets page (F04 section 6), from top to bottom: the header (BR-F04-14), the
 * invalid-link notice (FIL-5), then the month: the overview (BR-F04-15) and the list, or the
 * empty message, with Not budgeted and Not active still listed under it. A new user, with
 * neither, sees only the message. Offline, only the current month shows, with "as of"
 * (section 10); another month says it isn't saved on this device. With nothing to show and no
 * connection, or a failed load, the error state offers Retry. Everything follows the URL's
 * `month` (BR-F04-14).
 * - **The filter** (BR-F04-31) belongs to the month it was chosen in: any change of month,
 *   Back included, clears it.
 * - **The selection** (BR-F04-17, D-249) stays across months while its category shows in the
 *   new one, and clears otherwise. Escape clears it (BR-F04-32).
 * - **The view** (BR-F04-14, BR-F04-18, D-570): the remembered Table shows only from 768 px,
 *   where its switch is, and for a month with a Budget; otherwise the list.
 * - **The panel** (BR-F04-30): beside the list from 1180 px, where Up and Down select; below,
 *   a drawer while a category is selected, where they only move focus, and nothing while the
 *   drawer is open (D-571). It is left out in the error, offline-other-month and new-user
 *   states. L opens Change limit for a selection with a Budget record, S Stop budgeting for a
 *   Budget, and Delete or Backspace the Delete confirmation for a Budget or a Not active one
 *   (BR-F04-32, D-573).
 * - **The dialogs** (BR-F04-19 to BR-F04-21, BR-F04-06) open from the header, the empty
 *   message, the rows, the panel and L, over the page; while one is open the page's keys rest.
 */
export function BudgetsPage({
	locale,
	initialView = "list",
	initialWide = false,
	className,
}: Readonly<BudgetsPageProps>) {
	const current = monthOf(locale.today);
	const url = useBudgetsUrl(current);
	const online = useOnline();
	const [view, setView] = useStoredChoice<BudgetsView>(
		VIEW_KEY,
		BUDGET_VIEWS,
		"list",
		initialView,
		VIEW_COOKIE,
	);
	// The server knows the window class the device last had, from a cookie, and the browser
	// corrects it where it was wrong (D-629).
	const wide = useWideWindow(initialWide);
	// The server can't know the width: it renders the docked panel, which CSS hides below 1180 px.
	const docked = useMediaQuery(DOCKED, true);
	const query = useBudgetMonth(url.month);
	const [filter, setFilter] = useMonthFilter(url.month);
	// The table's sort belongs to the page, so it holds across months, a loading one included
	// (BR-F04-18, D-570).
	const [sorting, setSorting] = useState<SortingState>([]);
	const [dialog, setDialog] = useState<OpenDialog | null>(null);
	const [isDialogOpen, setDialogOpen] = useState(false);
	const { dateLocale } = locale;
	const data = query.data;
	const notices = useBudgetNotices({
		month: url.month,
		currency: locale.currency,
		formats: locale,
	});

	const { selected, choose } = useBudgetSelection(data);

	const open = (next: OpenDialog) => {
		setDialog(next);
		setDialogOpen(true);
	};
	const opened = (dialog?.opened ?? 0) + 1;
	const onAdd = (category?: ExpenseCategory) =>
		open({ kind: "add", category: category ?? null, opened });
	const onChangeLimit = (category: ExpenseCategory) =>
		open({ kind: "change", category, opened });
	const onStop = (category: ExpenseCategory) =>
		open({ kind: "stop", category, opened });
	/** A category's Budget record in the month shown, or `null` when the month has not loaded or
	 * the category has none. */
	const recordFor = (category: ExpenseCategory) =>
		data ? recordIn(data, category) : null;
	// Delete is offered only for a Budget record in the month shown, so a press that finds none
	// (the Budget went in a read just now) does nothing.
	const onDelete = (category: ExpenseCategory) => {
		const record = recordFor(category);
		if (record) open({ kind: "delete", record, opened });
	};

	const { offOther, failed, showPanel } = pageShape({
		isOnline: online,
		month: url.month,
		current,
		data,
		loadFailed: query.isError || query.fetchStatus === "paused",
	});
	const drawerOpen = showPanel && !docked && selected !== null;
	// The conflict view of an Undo or a Remove is a dialog too, though the page opens it.
	const isViewOpen = isDialogOpen || notices.conflict !== null;
	const arrows = arrowsFor(isViewOpen || drawerOpen, docked);
	const subject =
		!offOther && data && selected !== null ? subjectOf(data, selected) : null;
	// The keys act as the selection's buttons do, and rest while a dialog is open (D-573).
	const keys =
		subject && !isViewOpen ?
			selectionKeys(subject)
		:	{ changeLimit: false, stop: false, remove: false };
	useBudgetShortcuts({
		selected,
		keys,
		onChangeLimit,
		onStop,
		onDelete,
		onClear: () => choose(null),
	});
	const asOf = asOfText(online, query.dataUpdatedAt, locale);

	// The notice shows in the panel while the Budget it is about is selected, else above the list
	// (BR-F04-29); a delete's never shows in the panel.
	const notice = notices.notice;
	const inPanel =
		notice !== null
		&& notice.inPanel
		&& showPanel
		&& selected === notice.category;
	const undoProps = notice?.undo ? { onUndo: notices.undo } : {};
	const noticeNode =
		notice === null ? null : (
			<UndoNotice
				text={notice.failure ?? notice.text}
				isFailure={notice.failure !== null}
				isPending={notices.isUndoing}
				{...undoProps}
				onDismiss={notices.dismiss}
			/>
		);
	// Remove is offered only on a Budget record in the month shown, so a press that finds none
	// does nothing.
	const removeMonthLimit = (category: ExpenseCategory, limitMonth: Month) => {
		const record = recordFor(category);
		if (record) notices.remove(record, limitMonth);
	};

	const month = (shown: BudgetMonthAnswer) => {
		const hasBudgets = shown.budgets.length > 0;
		const isCurrent = shown.month === current;
		const today = isCurrent ? locale.today : null;
		const todayShare = isCurrent ? dayOfMonth(locale.today).share : null;
		return (
			<>
				{hasBudgets ?
					<BudgetsOverview
						view={shown}
						formats={locale}
						today={today}
						filter={filter}
						onFilterChange={setFilter}
					/>
				:	<Section>
						<EmptyState
							title={emptyTitle(
								formatMonth(shown.month, { dateLocale }),
							)}
							body={PAGE_TEXT.emptyBody}
							action={PAGE_TEXT.add}
							onAction={() => onAdd()}
						/>
					</Section>
				}
				{!inPanel && noticeNode}
				<BudgetsViews
					view={view}
					wide={wide}
					shown={shown}
					formats={locale}
					filter={filter}
					onFilterChange={setFilter}
					selected={selected}
					onSelect={choose}
					arrows={arrows}
					sorting={sorting}
					onSortingChange={setSorting}
					todayShare={todayShare}
					onAdd={onAdd}
					onChangeLimit={onChangeLimit}
					onDelete={onDelete}
				/>
			</>
		);
	};

	const body = () => {
		if (offOther) {
			return (
				<Section>
					<EmptyState
						title={PAGE_TEXT.offlineTitle}
						body={offlineBody(formatMonth(current, { dateLocale }))}
						action={offlineAction(
							formatMonth(current, { dateLocale }, "name"),
						)}
						onAction={() => url.setMonth(current)}
					/>
				</Section>
			);
		}
		if (data) return month(data);
		if (failed) {
			return (
				<Section>
					<EmptyState
						title={PAGE_TEXT.loadFailed}
						body={PAGE_TEXT.loadFailedBody}
						action={PAGE_TEXT.retry}
						onAction={() => void query.refetch()}
					/>
				</Section>
			);
		}
		return <BudgetsSkeleton />;
	};

	return (
		<div
			className={cn(
				showPanel
					&& "dock:grid dock:grid-cols-[minmax(0,1fr)_minmax(20rem,25rem)] dock:items-start gap-5",
				"px-8 py-7 max-md:px-4 max-md:py-5",
				className,
			)}
		>
			<div className="flex min-w-0 flex-col gap-4">
				<BudgetsHeader
					month={url.month}
					current={current}
					dateLocale={dateLocale}
					numberLocale={locale.numberLocale}
					asOf={asOf}
					onMonthChange={url.setMonth}
					view={view}
					onViewChange={setView}
					onAdd={() => onAdd()}
				/>
				{url.notice && (
					<Banner
						kind="info"
						action={PAGE_TEXT.dismiss}
						className="rounded-section border"
						onAction={url.dismissNotice}
					>
						{PAGE_TEXT.invalidLink}
					</Banner>
				)}
				{body()}
			</div>
			{showPanel && (
				<BudgetPanel
					isDocked={docked}
					month={url.month}
					view={data}
					selected={selected}
					formats={locale}
					onClose={() => choose(null)}
					onAdd={onAdd}
					onChangeLimit={onChangeLimit}
					onStop={onStop}
					onDelete={onDelete}
					onRemoveMonthLimit={removeMonthLimit}
					isRemoving={notices.isRemoving}
					notice={inPanel ? noticeNode : null}
				/>
			)}
			<BudgetDialogs
				dialog={dialog}
				isOpen={isDialogOpen}
				data={data}
				locale={locale}
				onClose={() => setDialogOpen(false)}
				onDeleted={(deleted) => {
					notices.show(deletionNotice(deleted.category, deleted));
					choose(null);
				}}
				onSaved={(saved, written) => {
					notices.show(written);
					// The changed Budget is selected where its notice can show: docked, or with
					// a selection already open (BR-F04-29).
					if (docked || selected !== null) choose(saved.category);
				}}
				onDeleteInstead={(found) =>
					open({ kind: "delete", record: found, opened })
				}
				notices={notices}
			/>
		</div>
	);
}
