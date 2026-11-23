"use client";

import type { ReactNode } from "react";

import { Drawer } from "@/components/surfaces/Drawer";
import { DockedPanel } from "@/components/surfaces/DockedPanel";
import type { ExpenseCategory } from "@/lib/subscriptions/model";
import type { Formats } from "../lib/labels";
import { PANEL_TEXT, type PanelActionKey, type StatusAction } from "../lib/panel";
import type { SubscriptionList } from "../lib/types";
import { PanelDetail } from "./PanelDetail";
import { PanelSummary } from "./PanelSummary";

export type SubscriptionPanelProps = {
	/** From 1180 px wide the panel sits beside the list; below, it is a drawer (BR-F05-40). */
	isDocked: boolean;
	list: SubscriptionList;
	/** The selected Subscription's id, or `null`. */
	selected: string | null;
	formats: Formats & { currency: string };
	/** Clears the selection: Close details, and the drawer's Escape and scrim. */
	onClose: () => void;
	onViewCharges: (id: string) => void;
	/** A button of the selected Subscription's footer, or "Add a note" (BR-F05-40). */
	onAction: (action: PanelActionKey, id: string) => void;
	/** A button of the selected Subscription's status box (BR-F05-40). */
	onStatusAction: (action: StatusAction, id: string) => void;
	/** Undo skip on the selected Subscription's timeline (BR-F05-27). */
	onUndoSkip: (dueOn: string, id: string) => void;
	/** The date the calendar's selection marks in the timeline, or `null` (BR-F05-38). */
	selectedDue?: string | null;
	/** The notice of a write to the selected Subscription, shown inside its details
	 * (BR-F05-33). */
	notice?: ReactNode;
	/** The category the list is filtered to, and a press on a category of the summary (D-622). */
	activeCategory?: ExpenseCategory | null;
	onCategory?: (category: ExpenseCategory) => void;
	className?: string;
};

/**
 * The Subscriptions panel (BR-F05-40). Docked, it is a sticky column that always shows: the
 * summary of what the Subscriptions cost, or the selected one. Below 1180 px it shows only
 * while one is selected, as a drawer from the right; Close details, Escape or a press on the
 * scrim clears the selection. The page leaves it out while loading, on error and with no
 * Subscription.
 */
export function SubscriptionPanel({
	isDocked,
	list,
	selected,
	formats,
	onClose,
	onViewCharges,
	onAction,
	onStatusAction,
	onUndoSkip,
	selectedDue = null,
	notice = null,
	activeCategory,
	onCategory,
	className,
}: Readonly<SubscriptionPanelProps>) {
	const item = list.items.find((each) => each.id === selected) ?? null;
	const detail =
		item === null ? null : (
			<PanelDetail
				key={item.id}
				item={item}
				formats={formats}
				onClose={onClose}
				onViewCharges={() => onViewCharges(item.id)}
				onAction={(action) => onAction(action, item.id)}
				onStatusAction={(action) => onStatusAction(action, item.id)}
				onUndoSkip={(dueOn) => onUndoSkip(dueOn, item.id)}
				selectedDue={selectedDue}
				notice={notice}
			/>
		);
	if (!isDocked) {
		return (
			<Drawer
				label={PANEL_TEXT.label}
				isOpen={item !== null}
				// It only ever reports closing: a selection is what opens it.
				onOpenChange={onClose}
				className="px-5.5 py-5"
			>
				{detail}
			</Drawer>
		);
	}
	return (
		<DockedPanel
			label={PANEL_TEXT.label}
			{...(className === undefined ? {} : { className })}
		>
			{detail ?? (
				<PanelSummary
					list={list}
					formats={formats}
					{...(activeCategory === undefined ? {} : { activeCategory })}
					{...(onCategory === undefined ? {} : { onCategory })}
				/>
			)}
		</DockedPanel>
	);
}
