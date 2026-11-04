"use client";

import { LoaderCircle } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
	GridList as AriaGridList,
	GridListHeader as AriaGridListHeader,
	GridListLoadMoreItem as AriaGridListLoadMoreItem,
	GridListSection as AriaGridListSection,
} from "react-aria-components";

import { Button } from "@/components/actions/Button";
import { GroupHeader } from "@/components/data/GroupHeader";
import { EmptyState } from "@/components/feedback/EmptyState";
import { Skeleton } from "@/components/feedback/Skeleton";
import { Section } from "@/components/surfaces/Section";
import { cn } from "@/lib/cn";
import type { ListParams, TransactionFilter } from "@/lib/transactions/url";
import { useInView } from "../hooks/useInView";
import { useTransactionList } from "../hooks/useTransactionList";
import {
	groupFigures,
	groupLabel,
	type LabelLocale,
	loadedMessage,
} from "../lib/labels";
import { sectionsOf } from "../lib/sections";
import { TransactionListItem } from "./TransactionListItem";

export type TransactionListProps = {
	filter: TransactionFilter;
	list: ListParams;
	locale: LabelLocale;
	/** Clears the filter, from the filtered empty state. */
	onClearFilters: () => void;
	className?: string;
};

/** The number of skeleton rows while the first page loads. */
const SKELETON_ROWS = 7;

/** How many frames a focus move waits for its row to reach the page. */
const FOCUS_FRAMES = 10;

/**
 * The Transactions list (BR-F03-29 to BR-F03-31, BR-F03-55 to BR-F03-57, D-36): a React Aria
 * GridList of the loaded pages, in sections under sticky group headers with their totals.
 * - **Paging:** the next page loads when the end scrolls into view, and from Load more, which
 *   shows while there is a next page (NFR-5). Pages trimmed from the top (`maxPages`) reload
 *   the same ways from above. Each load is announced politely (D-530).
 * - **States:** skeleton rows while the first page loads; "No Transactions yet." with no
 *   filter; "No Transactions match these filters." with Clear filters; and the error with
 *   Retry.
 */
export function TransactionList({
	filter,
	list,
	locale,
	onClearFilters,
	className,
}: Readonly<TransactionListProps>) {
	const query = useTransactionList({ filter, list, currency: locale.currency });
	const [announcement, setAnnouncement] = useState({ text: "", count: 0 });
	const top = useRef<HTMLDivElement>(null);
	const loadMore = useRef<HTMLDivElement>(null);
	const grid = useRef<HTMLDivElement>(null);
	// The row that takes focus from Load more when the last page takes the button away (D-535).
	const focusNext = useRef<string | null>(null);
	const {
		data,
		hasNextPage,
		hasPreviousPage,
		isFetchingNextPage,
		isFetchingPreviousPage,
	} = query;

	const loadNext = async () => {
		if (!hasNextPage || isFetchingNextPage) return;
		// Load more is on the page whenever there is a next page to load.
		const pressed = loadMore.current!.contains(document.activeElement);
		const result = await query.fetchNextPage();
		const loaded = result.data?.pages.at(-1);
		if (result.isFetchNextPageError || !loaded) return;
		if (pressed && !result.hasNextPage)
			focusNext.current = loaded.items[0]?.id ?? null;
		setAnnouncement((last) => ({
			text: loadedMessage(loaded.items.length),
			count: last.count + 1,
		}));
	};
	useEffect(() => {
		const id = focusNext.current;
		if (id === null) return;
		// React Aria adds new rows to the page a commit after this one, so wait a few frames.
		let tries = FOCUS_FRAMES;
		let frame = 0;
		const focus = () => {
			const row = grid.current?.querySelector<HTMLElement>(
				`[data-key="${id}"]`,
			);
			if (row) {
				focusNext.current = null;
				row.focus();
			} else if (--tries > 0) frame = requestAnimationFrame(focus);
		};
		focus();
		return () => cancelAnimationFrame(frame);
	});
	const loadEarlier = () => {
		if (hasPreviousPage && !isFetchingPreviousPage)
			void query.fetchPreviousPage();
	};
	useInView(top, hasPreviousPage, loadEarlier);

	const frame = cn("px-5 pt-1.5 pb-3.5 max-md:px-4", className);
	const filtered = Object.keys(filter).length > 0;
	// Offline, a read with nothing cached waits for the connection (D-534).
	const waiting = query.fetchStatus === "paused";
	if (!data) {
		if (waiting && filtered) {
			return (
				<Section className={frame}>
					<EmptyState
						title="You're offline. Filters need a connection."
						action="Clear filters"
						onAction={onClearFilters}
					/>
				</Section>
			);
		}
		if (query.isError || waiting) {
			return (
				<Section className={frame}>
					<EmptyState
						title="Transactions could not be loaded."
						body="Check your connection, then try again. Your data is safe."
						action="Retry"
						onAction={() => void query.refetch()}
					/>
				</Section>
			);
		}
		return (
			<Section
				className={frame}
				as="div"
			>
				<div
					aria-busy="true"
					aria-label="Loading Transactions"
					role="status"
				>
					{Array.from({ length: SKELETON_ROWS }, (_, index) => (
						<div
							key={index}
							className="flex h-13.5 items-center gap-3.5"
						>
							<Skeleton className="size-9 rounded-full" />
							<div className="flex flex-1 flex-col gap-1.5">
								<Skeleton className="h-3 w-2/5" />
								<Skeleton className="h-2.5 w-1/4" />
							</div>
							<Skeleton className="h-3.5 w-22" />
						</div>
					))}
				</div>
			</Section>
		);
	}

	const sections = sectionsOf(data.pages, list.group);
	if (sections.length === 0) {
		return (
			<Section className={frame}>
				{filtered ?
					<EmptyState
						title="No Transactions match these filters."
						action="Clear filters"
						onAction={onClearFilters}
					/>
				:	<EmptyState
						title="No Transactions yet."
						body="Add your first Transaction to see your month take shape."
					/>
				}
			</Section>
		);
	}

	const { group } = list;
	return (
		<Section className={frame}>
			{hasPreviousPage && (
				<div
					ref={top}
					className="flex justify-center pt-2"
				>
					<Button
						variant="secondary"
						size="sm"
						isPending={isFetchingPreviousPage}
						onPress={loadEarlier}
					>
						Load earlier
					</Button>
				</div>
			)}
			<AriaGridList
				ref={grid}
				aria-label="Transactions"
				className="flex flex-col outline-none"
			>
				{sections.map((section) => {
					const rows = section.rows.map((row) => (
						<TransactionListItem
							key={row.id}
							row={row}
							group={group}
							locale={locale}
						/>
					));
					if (group === "none") return rows;
					const total = section.total ?? { key: section.key, label: null };
					return (
						<AriaGridListSection
							key={section.key}
							id={`group:${section.key}`}
							className="flex flex-col"
						>
							<AriaGridListHeader className="bg-section sticky top-0 z-10">
								<GroupHeader
									label={groupLabel(group, total, locale)}
									{...(section.total && {
										figures: groupFigures(
											group,
											section.total,
											locale,
										),
									})}
								/>
							</AriaGridListHeader>
							{rows}
						</AriaGridListSection>
					);
				})}
				<AriaGridListLoadMoreItem
					onLoadMore={() => void loadNext()}
					isLoading={isFetchingNextPage}
					className="flex h-12 items-center justify-center"
				>
					<LoaderCircle
						aria-label="Loading more Transactions"
						className="text-ink-3 size-4 animate-spin motion-reduce:animate-none"
					/>
				</AriaGridListLoadMoreItem>
			</AriaGridList>
			{hasNextPage && (
				<div
					ref={loadMore}
					className="flex justify-center pt-3"
				>
					<Button
						variant="secondary"
						isPending={isFetchingNextPage}
						onPress={() => void loadNext()}
					>
						Load more
					</Button>
				</div>
			)}
			<p
				role="status"
				className="sr-only"
			>
				<span key={announcement.count}>{announcement.text}</span>
			</p>
		</Section>
	);
}
