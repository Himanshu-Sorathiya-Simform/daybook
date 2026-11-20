"use client";

import { ChevronRight } from "lucide-react";
import {
	Button as AriaButton,
	Disclosure as AriaDisclosure,
	DisclosurePanel as AriaDisclosurePanel,
	GridList as AriaGridList,
	GridListHeader as AriaGridListHeader,
	GridListSection as AriaGridListSection,
	type Key as AriaKey,
	type Selection as AriaSelection,
} from "react-aria-components";

import { Button } from "@/components/actions/Button";
import { GroupHeader } from "@/components/data/GroupHeader";
import { Section } from "@/components/surfaces/Section";
import { cn } from "@/lib/cn";
import {
	endedToggle,
	groupHeader,
	listGroups,
	NO_RUNNING,
	shownRows,
} from "../lib/groups";
import type { Formats } from "../lib/labels";
import type { MenuAction } from "../lib/menu";
import { LIST_TEXT } from "../lib/messages";
import type { SubscriptionList as SubscriptionListData } from "../lib/types";
import { SubscriptionRow } from "./SubscriptionRow";

export type SubscriptionListProps = {
	list: SubscriptionListData;
	formats: Formats;
	isWide: boolean;
	/** The selected Subscription's id, or `null`. */
	selected: string | null;
	onSelect: (id: string | null) => void;
	/** Whether the Ended group is open, and whether it shows all its rows (BR-F05-37). */
	endedOpen: boolean;
	onEndedOpenChange: (open: boolean) => void;
	endedAll: boolean;
	onEndedAllChange: (all: boolean) => void;
	onAction: (action: MenuAction, id: string) => void;
	className?: string;
};

/** The id a selection change chose, or `null` for a cleared one. Single selection never
 * reports "all". */
const pickedId = (keys: AriaSelection) => {
	const [key] = keys as Set<AriaKey>;
	return key === undefined ? null : String(key);
};

const selectedIn = (ids: readonly string[], selected: string | null) =>
	selected !== null && ids.includes(selected) ? [selected] : [];

/**
 * The Subscriptions as a list (BR-F05-37): the groups that are not ended under their headers,
 * each with the figure of its charges in the next 30 days, then Ended, collapsed until pressed,
 * newest end first, showing 5 and then "Show all 8" or "Show fewer". With none running, the
 * line "No running Subscriptions…" stands above. It is a React Aria grid list (D-171), and
 * Ended a second one inside a disclosure. A row selects its Subscription, and selecting it
 * again clears it.
 */
export function SubscriptionList({
	list,
	formats,
	isWide,
	selected,
	onSelect,
	endedOpen,
	onEndedOpenChange,
	endedAll,
	onEndedAllChange,
	onAction,
	className,
}: Readonly<SubscriptionListProps>) {
	const { groups, hasRunning } = listGroups(
		list.items,
		list.upcoming,
		formats.today,
	);
	const running = groups.filter((group) => group.key !== "ended");
	const ended = groups.find((group) => group.key === "ended");
	const runningIds = running.flatMap((group) => group.rows.map((r) => r.item.id));
	const endedRows = ended ? shownRows(ended, { endedAll }) : [];
	const endedIds = endedRows.map((row) => row.item.id);
	const toggle = ended ? endedToggle(ended.rows.length, endedAll) : null;

	const rowOf = (row: (typeof endedRows)[number]) => (
		<SubscriptionRow
			key={row.item.id}
			row={row}
			formats={formats}
			isWide={isWide}
			onAction={onAction}
		/>
	);

	return (
		<Section className={cn("px-5 pt-1 pb-3 max-md:px-4", className)}>
			{!hasRunning && (
				<p className="text-body text-ink-2 pt-4 pb-1">{NO_RUNNING}</p>
			)}
			{running.length > 0 && (
				<AriaGridList
					aria-label={LIST_TEXT.label}
					selectionMode="single"
					selectedKeys={selectedIn(runningIds, selected)}
					onSelectionChange={(picked) => onSelect(pickedId(picked))}
					// Letters are the page's shortcuts (BR-F05-45).
					disallowTypeAhead
					className="flex flex-col outline-none"
				>
					{running.map((group) => {
						const header = groupHeader(group, formats);
						return (
							<AriaGridListSection
								key={group.key}
								id={`group:${group.key}`}
								className="flex flex-col"
							>
								<AriaGridListHeader>
									<GroupHeader
										label={header.label}
										{...(header.figure === null ?
											{}
										:	{ figures: header.figure })}
									/>
								</AriaGridListHeader>
								{group.rows.map(rowOf)}
							</AriaGridListSection>
						);
					})}
				</AriaGridList>
			)}
			{ended && (
				<AriaDisclosure
					isExpanded={endedOpen}
					onExpandedChange={onEndedOpenChange}
				>
					<AriaButton
						slot="trigger"
						className="text-caption text-ink-2 focus-visible:focus-ring rounded-control flex w-full cursor-pointer items-center gap-1.5 pt-4 pb-1.5 text-left font-semibold outline-none max-md:min-h-11"
					>
						<ChevronRight
							aria-hidden="true"
							className={cn(
								"size-3.5 shrink-0 transition-transform duration-(--dur-fast) ease-out",
								endedOpen && "rotate-90",
							)}
						/>
						<span className="flex-1">
							{groupHeader(ended, formats).label}
						</span>
						{endedOpen && (
							<span className="text-ink-3 font-normal">
								{LIST_TEXT.newestFirst}
							</span>
						)}
					</AriaButton>
					<AriaDisclosurePanel>
						<AriaGridList
							aria-label={groupHeader(ended, formats).label}
							selectionMode="single"
							selectedKeys={selectedIn(endedIds, selected)}
							onSelectionChange={(picked) =>
								onSelect(pickedId(picked))
							}
							disallowTypeAhead
							className="flex flex-col outline-none"
						>
							{endedRows.map(rowOf)}
						</AriaGridList>
						{toggle !== null && (
							<Button
								size="sm"
								variant="row"
								onPress={() => onEndedAllChange(!endedAll)}
							>
								{toggle}
							</Button>
						)}
					</AriaDisclosurePanel>
				</AriaDisclosure>
			)}
		</Section>
	);
}
