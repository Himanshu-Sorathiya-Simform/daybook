"use client";

import type { ExpenseCategory } from "@/lib/subscriptions/model";
import type { SubscriptionsView } from "../lib/view";
import {
	SubscriptionCalendar,
	type SubscriptionCalendarProps,
} from "./SubscriptionCalendar";
import { SubscriptionList, type SubscriptionListProps } from "./SubscriptionList";
import { SubscriptionTable, type SubscriptionTableProps } from "./SubscriptionTable";

export type SubscriptionsViewsProps = {
	/** The view to show: the list, the calendar or the table. */
	view: SubscriptionsView;
	/** What the list and the table show: the list the category filter left. The calendar
	 * always takes `items`. */
	shown: SubscriptionListProps["list"];
	/** Every Subscription of the list. */
	items: SubscriptionCalendarProps["items"];
	formats: SubscriptionCalendarProps["formats"];
	selected: string | null;
	onSelect: (id: string | null) => void;
	arrows: NonNullable<SubscriptionListProps["arrows"]>;
	category: ExpenseCategory | null;
	onClearCategory: () => void;
	/** The list's own state: its Ended group. */
	endedOpen: boolean;
	onEndedOpenChange: (open: boolean) => void;
	endedAll: boolean;
	onEndedAllChange: (all: boolean) => void;
	onAction: SubscriptionListProps["onAction"];
	/** The table's sort, held by the page so it outlives the table (D-570). */
	sorting: SubscriptionTableProps["sorting"];
	onSortingChange: SubscriptionTableProps["onSortingChange"];
	/** The calendar's own state. */
	isWide: boolean;
	markedDue: string | null;
	onSelectItem: SubscriptionCalendarProps["onSelectItem"];
};

/**
 * The view of the Subscriptions page (BR-F05-21): the list, the calendar or the table. The list
 * and the table show the Subscriptions the category filter left; the calendar shows them all.
 */
export function SubscriptionsViews({
	view,
	shown,
	items,
	formats,
	selected,
	onSelect,
	arrows,
	category,
	onClearCategory,
	endedOpen,
	onEndedOpenChange,
	endedAll,
	onEndedAllChange,
	onAction,
	sorting,
	onSortingChange,
	isWide,
	markedDue,
	onSelectItem,
}: Readonly<SubscriptionsViewsProps>) {
	if (view === "calendar") {
		return (
			<SubscriptionCalendar
				items={items}
				formats={formats}
				isWide={isWide}
				selected={selected}
				markedDue={markedDue}
				onSelectItem={onSelectItem}
			/>
		);
	}
	if (view === "table") {
		return (
			<SubscriptionTable
				list={shown}
				formats={formats}
				sorting={sorting}
				onSortingChange={onSortingChange}
				selected={selected}
				onSelect={onSelect}
				arrows={arrows}
				category={category}
				onClearCategory={onClearCategory}
			/>
		);
	}
	return (
		<SubscriptionList
			list={shown}
			formats={formats}
			selected={selected}
			onSelect={onSelect}
			endedOpen={endedOpen}
			onEndedOpenChange={onEndedOpenChange}
			endedAll={endedAll}
			onEndedAllChange={onEndedAllChange}
			onAction={onAction}
			arrows={arrows}
			category={category}
			onClearCategory={onClearCategory}
		/>
	);
}
