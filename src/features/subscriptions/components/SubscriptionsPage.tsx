"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { EmptyState } from "@/components/feedback/EmptyState";
import { Section } from "@/components/surfaces/Section";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { useOnline } from "@/hooks/useOnline";
import { useStoredChoice } from "@/hooks/useStoredChoice";
import { cn } from "@/lib/cn";
import { useOpenParam } from "../hooks/useOpenParam";
import { useSubscriptions } from "../hooks/useSubscriptions";
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
import { SubscriptionList } from "./SubscriptionList";
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

/**
 * The Subscriptions page (F05 section 6), from top to bottom: the header (BR-F05-21), then
 * the summary and the view. Loading shows a skeleton summary and four rows. A list with no
 * Subscription shows only the empty message, and a failed load, or no connection with nothing
 * saved, only the error with Retry; both leave out the view switch. Offline, the saved list
 * shows with "as of" beside the title. The remembered view is List, Calendar or Table, and a
 * stored Table shows the list below 768 px (BR-F05-21).
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
	const [endedOpen, setEndedOpen] = useState(false);
	const [endedAll, setEndedAll] = useState(false);
	// A Subscription that is gone from the list is no longer selected, and stays unselected if
	// it comes back (BR-F05-21). Set while rendering, React's pattern for state that follows
	// what was read.
	const gone =
		list !== undefined
		&& picked !== null
		&& !list.items.some((item) => item.id === picked);
	if (gone) setPicked(null);
	const selected = gone ? null : picked;
	useOpenParam(list?.items, (target: OpenTarget | null) => {
		setPicked(target?.id ?? null);
		// An ended Subscription is selected with its group open and showing every row.
		if (target?.ended) {
			setEndedOpen(true);
			setEndedAll(true);
		}
	});
	const act = (action: MenuAction, id: string) => {
		if (action === "viewCharges") router.push(chargesHref(id));
	};
	const failed = !list && (query.isError || query.fetchStatus === "paused");
	const isEmpty = list !== undefined && list.items.length === 0;

	const body = () => {
		if (list && !isEmpty) {
			return (
				<>
					<SubscriptionsSummary
						list={list}
						formats={locale}
					/>
					{
						view === "list" ?
							<SubscriptionList
								list={list}
								formats={locale}
								isWide={isWide}
								selected={selected}
								onSelect={setPicked}
								endedOpen={endedOpen}
								onEndedOpenChange={setEndedOpen}
								endedAll={endedAll}
								onEndedAllChange={setEndedAll}
								onAction={act}
							/>
							// The calendar and table replace this as each arrives.
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
				"flex min-w-0 flex-col gap-4 px-8 py-7 max-md:px-4 max-md:py-5",
				className,
			)}
		>
			<SubscriptionsHeader
				asOf={asOfText(online, query.dataUpdatedAt, locale)}
				view={view}
				onViewChange={setStored}
				isWide={isWide}
				hasSwitch={!failed && !isEmpty}
			/>
			{body()}
		</div>
	);
}
