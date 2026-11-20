"use client";

import { Plus } from "lucide-react";

import { Button } from "@/components/actions/Button";
import { Segmented } from "@/components/forms/Segmented";
import { choiceOf } from "@/lib/device-cookies";
import { SUBSCRIPTION_VIEWS, type SubscriptionsView } from "../lib/view";
import { PAGE_TEXT } from "../lib/messages";

export type SubscriptionsHeaderProps = {
	/** "as of 14:05" while offline, beside the title (section 10), or `null`. */
	asOf: string | null;
	/** The view that shows, which is the stored one except Table below 768 px. */
	view: SubscriptionsView;
	onViewChange: (view: SubscriptionsView) => void;
	/** Whether "Show Subscriptions as" shows: not for an empty list or a failed load. */
	hasSwitch: boolean;
	/** Add a Subscription: an icon button below 768 px (BR-F05-21). */
	onAdd: () => void;
};

/**
 * The page's header (BR-F05-21): the title, with "as of" while offline, and "Show
 * Subscriptions as" with List, Calendar and Table, Table only from 768 px (D-512): CSS hides
 * that option below it, so the server draws the final switch (D-629). The switch is left out
 * when there is nothing to show (section 6). Add a Subscription follows the switch, an
 * icon button below 768 px.
 */
export function SubscriptionsHeader({
	asOf,
	view,
	onViewChange,
	hasSwitch,
	onAdd,
}: Readonly<SubscriptionsHeaderProps>) {
	return (
		<div className="flex flex-wrap items-center gap-3">
			<h1 className="text-title text-ink">{PAGE_TEXT.title}</h1>
			{asOf !== null && <span className="text-label text-ink-2">{asOf}</span>}
			<span className="flex-1" />
			{hasSwitch && (
				<Segmented
					label={PAGE_TEXT.viewLabel}
					size="sm"
					options={SUBSCRIPTION_VIEWS.map((value) => ({
						value,
						label: PAGE_TEXT.viewNames[value],
						...(value === "table" ? { className: "max-md:hidden" } : {}),
					}))}
					value={view}
					onChange={(next) =>
						onViewChange(choiceOf(next, SUBSCRIPTION_VIEWS, "list"))
					}
				/>
			)}
			<Button
				icon={Plus}
				onPress={onAdd}
				className="max-md:w-11 max-md:justify-center max-md:px-0"
			>
				{/* An icon alone below 768 px; the name stays for screen readers. */}
				<span className="max-md:sr-only">{PAGE_TEXT.add}</span>
			</Button>
		</div>
	);
}
