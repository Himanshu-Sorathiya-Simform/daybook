"use client";

import type { SortingState } from "@tanstack/react-table";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { EmptyState } from "@/components/feedback/EmptyState";
import { UndoNotice } from "@/components/feedback/UndoNotice";
import { showToast } from "@/components/feedback/showToast";
import { Section } from "@/components/surfaces/Section";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { useWideWindow } from "@/hooks/useWideWindow";
import { useOnline } from "@/hooks/useOnline";
import type { RowArrows } from "@/hooks/useRowArrows";
import { useShortcut } from "@/hooks/useShortcut";
import { useStoredChoice } from "@/hooks/useStoredChoice";
import { cn } from "@/lib/cn";
import type { ExpenseCategory, MonthItem } from "@/lib/subscriptions/model";
import { useOpenParam } from "../hooks/useOpenParam";
import { useQuickWrites } from "../hooks/useQuickWrites";
import { useSubscriptionNotice } from "../hooks/useSubscriptionNotice";
import { useSubscriptions } from "../hooks/useSubscriptions";
import { CALENDAR_TEXT } from "../lib/calendar";
import { filterByCategory, isFilterable } from "../lib/category-filter";
import { conflictRows, fieldsOf } from "../lib/conflict";
import { chargesHref, type OpenTarget } from "../lib/deep-link";
import type { DialogKind } from "../lib/dialog";
import { type MenuAction, shortcutAction, type ShortcutKey } from "../lib/menu";
import { asOfText, PAGE_TEXT } from "../lib/messages";
import type { Confirmed } from "../lib/notices";
import type { PanelActionKey, StatusAction } from "../lib/panel";
import { DEFAULT_SORTING } from "../lib/table";
import type { SubscriptionItem, SubscriptionsLocale } from "../lib/types";
import {
	shownView,
	SUBSCRIPTION_VIEWS,
	type SubscriptionsView,
	VIEW_KEY,
} from "../lib/view";
import { SubscriptionCalendar } from "./SubscriptionCalendar";
import { CancelDialog } from "./CancelDialog";
import { ConflictDialog } from "./ConflictDialog";
import { DeleteDialog } from "./DeleteDialog";
import { PauseDialog } from "./PauseDialog";
import { ResumeDialog } from "./ResumeDialog";
import { SubscriptionDialog } from "./SubscriptionDialog";
import { SubscriptionList } from "./SubscriptionList";
import { SubscriptionPanel } from "./SubscriptionPanel";
import { SubscriptionsHeader } from "./SubscriptionsHeader";
import { SubscriptionsSkeleton } from "./SubscriptionsSkeleton";
import { SubscriptionsSummary } from "./SubscriptionsSummary";
import { SubscriptionTable } from "./SubscriptionTable";

export type SubscriptionsPageProps = {
	/** The profile's formats and its today, from the server render (TIME-5). */
	locale: SubscriptionsLocale;
	/** The view this device remembers and whether its window was last wide, from the cookies
	 * the server reads, so the first draw is the right one (D-629). */
	initialView?: SubscriptionsView;
	initialWide?: boolean;
	className?: string;
};

/** From here up the panel docks beside the list (BR-F05-40); the `dock` breakpoint. */
const DOCKED = "(min-width: 1180px)";

/** What Up and Down do in the list: nothing while the drawer is open, select with the panel
 * docked, else only move focus (BR-F05-45, D-571). */
function arrowsFor(isCovered: boolean, isDocked: boolean): RowArrows {
	if (isCovered) return "off";
	return isDocked ? "select" : "focus";
}

/**
 * The Subscriptions page (F05 section 6), from top to bottom: the header (BR-F05-21), then
 * the summary and the view. Loading shows a skeleton summary and four rows. A list with no
 * Subscription shows only the empty message, and a failed load, or no connection with nothing
 * saved, only the error with Retry; both leave out the view switch. Offline, the saved list
 * shows with "as of" beside the title. The remembered view is List, Calendar or Table, and a
 * stored Table shows the list below 768 px (BR-F05-21).
 * - **The panel** (BR-F05-40): beside the list from 1180 px, where Up and Down select; below,
 *   a drawer while a Subscription is selected, where they only move focus, and nothing while
 *   the drawer is open (BR-F05-45). It is left out while loading, on error and with no
 *   Subscription. Escape clears the selection.
 */
export function SubscriptionsPage({
	locale,
	initialView = "list",
	initialWide = false,
	className,
}: Readonly<SubscriptionsPageProps>) {
	const online = useOnline();
	const query = useSubscriptions();
	const [stored, setStored] = useStoredChoice<SubscriptionsView>(
		VIEW_KEY,
		SUBSCRIPTION_VIEWS,
		"list",
		initialView,
	);
	// The server knows the window class the device last had, from a cookie, and the browser
	// corrects it where it was wrong.
	const isWide = useWideWindow(initialWide);
	const view = shownView(stored, isWide);
	const list = query.data;
	const router = useRouter();
	const [picked, setPicked] = useState<string | null>(null);
	// The charge a calendar item stood for: its Subscription and due date, which the panel's
	// timeline marks while that Subscription stays selected (BR-F05-38).
	const [marked, setMarked] = useState<{ id: string; date: string } | null>(null);
	const [endedOpen, setEndedOpen] = useState(false);
	const [endedAll, setEndedAll] = useState(false);
	// The table's sort lives here, so it outlives the table while the view changes (D-570).
	const [sorting, setSorting] = useState<SortingState>(DEFAULT_SORTING);
	const [filtered, setFiltered] = useState<ExpenseCategory | null>(null);
	// The dialog while it is open, and the Subscription it is about: `null` for Add.
	const [dialog, setDialog] = useState<{
		kind: DialogKind;
		item: SubscriptionItem | null;
	} | null>(null);
	const notices = useSubscriptionNotice(locale);
	const quick = useQuickWrites(locale, notices);
	// A Subscription that is gone from the list is no longer selected, and stays unselected if
	// it comes back (BR-F05-21). Set while rendering, React's pattern for state that follows
	// what was read.
	const gone =
		list !== undefined
		&& picked !== null
		&& !list.items.some((item) => item.id === picked);
	if (gone) {
		setPicked(null);
		setMarked(null);
	}
	const selected = gone ? null : picked;
	const markedDue = marked?.date ?? null;
	/** Selects a Subscription from the list, a link or the keyboard: no calendar date marked. */
	const choose = (id: string | null) => {
		setPicked(id);
		setMarked(null);
	};
	// A category that has lost its last Subscription filters nothing any more and clears.
	const stale =
		filtered !== null && list !== undefined && !isFilterable(list, filtered);
	if (stale) setFiltered(null);
	const category = stale ? null : filtered;
	const shown =
		list && category !== null ? filterByCategory(list, category) : list;
	useOpenParam(list?.items, (target: OpenTarget | null) => {
		choose(target?.id ?? null);
		// A deep link shows its row, so a filter that would hide it goes.
		if (target) setFiltered(null);
		// An ended Subscription is selected with its group open and showing every row.
		if (target?.ended) {
			setEndedOpen(true);
			setEndedAll(true);
		}
	});
	/** A press on a category of the panel's summary: filter to it, or clear it when it already
	 * is the filter (BR-F05-50). A selection the filter would hide clears with it. */
	const filterTo = (next: ExpenseCategory) => {
		const target = next === category ? null : next;
		setFiltered(target);
		const item = list?.items.find((each) => each.id === selected);
		if (target !== null && item && item.category !== target) choose(null);
	};
	/** A press on a calendar item (BR-F05-38): its Subscription is selected and its date marked
	 * in the timeline; a charge whose Subscription was deleted says so instead. A filter that
	 * would hide the Subscription goes, as a deep link's does. */
	const openItem = (item: MonthItem) => {
		if (item.subscriptionId === null) {
			showToast(CALENDAR_TEXT.deletedCharge);
			return;
		}
		const subscription = list?.items.find(
			(each) => each.id === item.subscriptionId,
		);
		if (
			subscription
			&& category !== null
			&& subscription.category !== category
		) {
			setFiltered(null);
		}
		setPicked(item.subscriptionId);
		setMarked({ id: item.subscriptionId, date: item.date });
	};
	/** Opens a dialog about a Subscription of the list. */
	const open = (kind: Exclude<DialogKind, "add">, id: string) => {
		const item = list?.items.find((each) => each.id === id);
		if (item) setDialog({ kind, item });
	};
	/** A confirmed write that is not a delete: the Subscription becomes the selection when the
	 * panel is docked or something is selected, and a filter that would hide it goes
	 * (BR-F05-33). */
	const saved = (subscription: { id: string; category: ExpenseCategory }) => {
		if (!docked && selected === null) return;
		if (category !== null && subscription.category !== category) {
			setFiltered(null);
		}
		choose(subscription.id);
	};
	/** A write from a dialog is confirmed: its notice, and the selection (BR-F05-33). A delete
	 * clears the selection. */
	const confirmed = (write: Confirmed) => {
		notices.confirm(write);
		if (write.kind === "delete") choose(null);
		else saved(write.saved);
	};
	/** A write with no dialog: the Subscription is selected once it is confirmed. */
	const quickly = async (
		id: string,
		write: (item: SubscriptionItem) => Promise<boolean>,
	) => {
		const item = list?.items.find((each) => each.id === id);
		if (item && (await write(item))) saved(item);
	};
	const act = (action: MenuAction | PanelActionKey, id: string) => {
		switch (action) {
			case "viewCharges":
				router.push(chargesHref(id));
				return;
			case "edit":
				open("edit", id);
				return;
			case "skip":
				void quickly(id, quick.skipNext);
				return;
			case "resumeNow":
				void quickly(id, quick.resumeNow);
				return;
			case "pause":
			case "changePause":
				open("pause", id);
				return;
			case "cancel":
			case "changeEnd":
				open("cancel", id);
				return;
			case "resume":
			case "keepGoing":
				open("resume", id);
				return;
			case "delete":
				open("delete", id);
				return;
		}
	};
	/** A button of the panel's status box (BR-F05-40). */
	const actStatus = (action: StatusAction, id: string) => {
		if (action === "skip") void quickly(id, quick.skipNext);
		else if (action === "resumeNow") void quickly(id, quick.resumeNow);
		else if (action === "change") open("pause", id);
		else open("resume", id);
	};
	const failed = !list && (query.isError || query.fetchStatus === "paused");
	const isEmpty = list !== undefined && list.items.length === 0;
	// The server can't know the width: it renders the docked panel, which CSS hides below 1180 px.
	const docked = useMediaQuery(DOCKED, true);
	const showPanel = list !== undefined && !isEmpty;
	const drawerOpen = showPanel && !docked && selected !== null;

	// The notice shows in the panel while the Subscription it is about is selected, else above the
	// view (BR-F05-33); a delete's never shows in the panel.
	const notice = notices.notice;
	const noticeInPanel =
		notice !== null
		&& notice.inPanel
		&& showPanel
		&& selected === notice.subscriptionId;
	const noticeNode =
		notice === null ? null : (
			<UndoNotice
				text={notice.failure ?? notice.text}
				isFailure={notice.failure !== null}
				isPending={notices.isUndoing}
				{...(notice.undo ? { onUndo: notices.undo } : {})}
				onDismiss={notices.dismiss}
			/>
		);
	const noticeAbove = noticeInPanel ? null : noticeNode;

	// A dialog, or the conflict view of a refused write, takes the keys: the page behind rests.
	const covered = dialog !== null || notices.conflict !== null;
	useShortcut("E", () => selected !== null && open("edit", selected), {
		enabled: selected !== null && !covered,
	});
	// The other keys act as the selection's menu items do, and only where it offers them, so a
	// press that finds none does nothing (D-630).
	const selectedItem = list?.items.find((each) => each.id === selected) ?? null;
	const keyed = (key: ShortcutKey) =>
		selectedItem !== null
		&& !covered
		&& shortcutAction(key, selectedItem, locale) !== null;
	const press = (key: ShortcutKey) => () => {
		const action = selectedItem && shortcutAction(key, selectedItem, locale);
		if (selectedItem && action) act(action, selectedItem.id);
	};
	useShortcut("S", press("S"), { enabled: keyed("S") });
	useShortcut("P", press("P"), { enabled: keyed("P") });
	useShortcut("R", press("R"), { enabled: keyed("R") });
	useShortcut("C", press("C"), { enabled: keyed("C") });
	useShortcut("Delete", press("Delete"), { enabled: keyed("Delete") });
	useShortcut("Backspace", press("Delete"), { enabled: keyed("Delete") });
	useShortcut("Escape", () => choose(null), {
		enabled: selected !== null && !covered,
		// Escape in a text field, a menu or a dialog belongs to them.
		ignoreInputs: true,
		ignoreDefaultPrevented: true,
	});

	const body = () => {
		if (list && !isEmpty) {
			return (
				<>
					<SubscriptionsSummary
						list={list}
						formats={locale}
					/>
					{noticeAbove}
					{view === "list" ?
						<SubscriptionList
							list={shown ?? list}
							formats={locale}
							selected={selected}
							onSelect={choose}
							endedOpen={endedOpen}
							onEndedOpenChange={setEndedOpen}
							endedAll={endedAll}
							onEndedAllChange={setEndedAll}
							onAction={act}
							arrows={arrowsFor(drawerOpen, docked)}
							category={category}
							onClearCategory={() => setFiltered(null)}
						/>
					: view === "calendar" ?
						<SubscriptionCalendar
							items={list.items}
							formats={locale}
							isWide={isWide}
							selected={selected}
							markedDue={markedDue}
							onSelectItem={openItem}
						/>
					:	<SubscriptionTable
							list={shown ?? list}
							formats={locale}
							sorting={sorting}
							onSortingChange={setSorting}
							selected={selected}
							onSelect={choose}
							arrows={arrowsFor(drawerOpen, docked)}
							category={category}
							onClearCategory={() => setFiltered(null)}
						/>
					}
				</>
			);
		}
		if (isEmpty) {
			return (
				<>
					{noticeAbove}
					<Section>
						<EmptyState
							title={PAGE_TEXT.emptyTitle}
							body={PAGE_TEXT.emptyBody}
							action={PAGE_TEXT.add}
							onAction={() => setDialog({ kind: "add", item: null })}
						/>
					</Section>
				</>
			);
		}
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
		return <SubscriptionsSkeleton />;
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
				<SubscriptionsHeader
					asOf={asOfText(online, query.dataUpdatedAt, locale)}
					view={view}
					onViewChange={setStored}
					hasSwitch={!failed && !isEmpty}
					onAdd={() => setDialog({ kind: "add", item: null })}
				/>
				{body()}
			</div>
			{showPanel && (
				<SubscriptionPanel
					isDocked={docked}
					list={list}
					selected={selected}
					formats={locale}
					onClose={() => choose(null)}
					onViewCharges={(id) => router.push(chargesHref(id))}
					onAction={act}
					onStatusAction={actStatus}
					onUndoSkip={(dueOn, id) =>
						void quickly(id, (item) => quick.undoSkip(item, dueOn))
					}
					selectedDue={markedDue}
					notice={noticeInPanel ? noticeNode : null}
					activeCategory={category}
					onCategory={filterTo}
				/>
			)}
			{dialog !== null
				&& (dialog.kind === "add" || dialog.kind === "edit") && (
					<SubscriptionDialog
						isOpen
						item={dialog.item}
						items={list?.items ?? []}
						locale={locale}
						onClose={() => setDialog(null)}
						onSaved={confirmed}
					/>
				)}
			{dialog?.item && dialog.kind === "cancel" && (
				<CancelDialog
					isOpen
					item={dialog.item}
					locale={locale}
					onClose={() => setDialog(null)}
					onSaved={confirmed}
				/>
			)}
			{dialog?.item && dialog.kind === "resume" && (
				<ResumeDialog
					isOpen
					item={dialog.item}
					locale={locale}
					onClose={() => setDialog(null)}
					onSaved={confirmed}
				/>
			)}
			{dialog?.item && dialog.kind === "pause" && (
				<PauseDialog
					isOpen
					item={dialog.item}
					locale={locale}
					onClose={() => setDialog(null)}
					onSaved={confirmed}
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
			{dialog?.item && dialog.kind === "delete" && (
				<DeleteDialog
					isOpen
					item={dialog.item}
					locale={locale}
					onClose={() => setDialog(null)}
					// "cancel it instead" swaps the confirmation for Cancel on the same Subscription.
					onCancelInstead={(item) => setDialog({ kind: "cancel", item })}
					onDeleted={confirmed}
				/>
			)}
		</div>
	);
}
