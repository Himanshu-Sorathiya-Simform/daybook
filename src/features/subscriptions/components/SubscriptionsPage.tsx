"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { EmptyState } from "@/components/feedback/EmptyState";
import { showToast } from "@/components/feedback/showToast";
import { Section } from "@/components/surfaces/Section";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { useOnline } from "@/hooks/useOnline";
import type { RowArrows } from "@/hooks/useRowArrows";
import { useShortcut } from "@/hooks/useShortcut";
import { useStoredChoice } from "@/hooks/useStoredChoice";
import { cn } from "@/lib/cn";
import type { ExpenseCategory, MonthItem } from "@/lib/subscriptions/model";
import { useOpenParam } from "../hooks/useOpenParam";
import { useSubscriptions } from "../hooks/useSubscriptions";
import { CALENDAR_TEXT } from "../lib/calendar";
import { filterByCategory, isFilterable } from "../lib/category-filter";
import { chargesHref, type OpenTarget } from "../lib/deep-link";
import type { MenuAction } from "../lib/menu";
import { asOfText, PAGE_TEXT } from "../lib/messages";
import type { SubscriptionsLocale } from "../lib/types";
import {
	shownView,
	SUBSCRIPTION_VIEWS,
	type SubscriptionsView,
	VIEW_KEY,
} from "../lib/view";
import { SubscriptionCalendar } from "./SubscriptionCalendar";
import { SubscriptionList } from "./SubscriptionList";
import { SubscriptionPanel } from "./SubscriptionPanel";
import { SubscriptionsHeader } from "./SubscriptionsHeader";
import { SubscriptionsSkeleton } from "./SubscriptionsSkeleton";
import { SubscriptionsSummary } from "./SubscriptionsSummary";

export type SubscriptionsPageProps = {
	/** The profile's formats and its today, from the server render (TIME-5). */
	locale: SubscriptionsLocale;
	className?: string;
};

/** From here up the Table shows in the switch (BR-F05-21, D-512). */
const WIDE = "(min-width: 48rem)";

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
	className,
}: Readonly<SubscriptionsPageProps>) {
	const online = useOnline();
	const query = useSubscriptions();
	const [stored, setStored] = useStoredChoice<SubscriptionsView>(
		VIEW_KEY,
		SUBSCRIPTION_VIEWS,
		"list",
	);
	// The server can't know the width: it renders the narrow header, and the browser follows.
	const isWide = useMediaQuery(WIDE, false);
	const view = shownView(stored, isWide);
	const list = query.data;
	const router = useRouter();
	const [picked, setPicked] = useState<string | null>(null);
	// The charge a calendar item stood for: its Subscription and due date, which the panel's
	// timeline marks while that Subscription stays selected (BR-F05-38).
	const [marked, setMarked] = useState<{ id: string; date: string } | null>(null);
	const [endedOpen, setEndedOpen] = useState(false);
	const [endedAll, setEndedAll] = useState(false);
	const [filtered, setFiltered] = useState<ExpenseCategory | null>(null);
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
	const act = (action: MenuAction, id: string) => {
		if (action === "viewCharges") router.push(chargesHref(id));
	};
	const failed = !list && (query.isError || query.fetchStatus === "paused");
	const isEmpty = list !== undefined && list.items.length === 0;
	// The server can't know the width: it renders the docked panel, which CSS hides below 1180 px.
	const docked = useMediaQuery(DOCKED, true);
	const showPanel = list !== undefined && !isEmpty;
	const drawerOpen = showPanel && !docked && selected !== null;

	useShortcut("Escape", () => choose(null), {
		enabled: selected !== null,
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
						// The table replaces this when it arrives.
					:	<Section>
							<p className="text-body text-ink-2">
								{`${PAGE_TEXT.viewNames[view]} is coming soon.`}
							</p>
						</Section>
					}
				</>
			);
		}
		if (isEmpty) {
			return (
				<Section>
					<EmptyState
						title={PAGE_TEXT.emptyTitle}
						body={PAGE_TEXT.emptyBody}
					/>
				</Section>
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
					isWide={isWide}
					hasSwitch={!failed && !isEmpty}
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
					selectedDue={markedDue}
					activeCategory={category}
					onCategory={filterTo}
				/>
			)}
		</div>
	);
}
