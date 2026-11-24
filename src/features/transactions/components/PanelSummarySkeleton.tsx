"use client";

import { LineSkeleton } from "@/components/feedback/LineSkeleton";
import { Skeleton } from "@/components/feedback/Skeleton";
import { cn } from "@/lib/cn";
import { PANEL_TEXT } from "../lib/panel";

/** How many category bars and payee rows it holds a place for: about what a month's list has. */
const BARS = ["w-full", "w-4/5", "w-3/5", "w-2/5", "w-1/4"] as const;
const PAYEES = 4;

export type PanelSummarySkeletonProps = {
	className?: string;
};

/**
 * The docked panel with nothing selected while the filter's summary loads (BR-F03-71): the
 * panel as `PanelSummary` draws it, with every fixed word in place, "This list", "Out by
 * category", "Top payees by Out" and the hint, and bars only where the figures go. The rows are
 * the same height as the real ones, so the panel does not move when the summary arrives. One
 * busy status; the bars are hidden from screen readers.
 */
export function PanelSummarySkeleton({
	className,
}: Readonly<PanelSummarySkeletonProps>) {
	return (
		<div
			role="status"
			aria-busy="true"
			aria-label="Loading the summary"
			className={cn("flex flex-col gap-5.5", className)}
		>
			<div>
				<p className="text-label text-ink-2">{PANEL_TEXT.list}</p>
				<LineSkeleton
					size="heading"
					width="w-40"
				/>
				<LineSkeleton
					size="caption"
					width="w-32"
				/>
			</div>
			<section className="flex flex-col gap-2.5">
				<h3 className="text-body text-ink font-semibold">
					{PANEL_TEXT.byCategory}
				</h3>
				<div className="grid grid-cols-[minmax(0,8rem)_minmax(0,1fr)_max-content] items-center gap-2.5">
					{BARS.map((width) => (
						<div
							key={width}
							className="col-span-3 -mx-2 grid grid-cols-subgrid items-center px-2 py-1"
						>
							<LineSkeleton
								size="body"
								width="w-20"
							/>
							<Skeleton className={cn("rounded-bar h-2", width)} />
							<LineSkeleton
								size="body"
								width="w-16"
							/>
						</div>
					))}
				</div>
			</section>
			<section className="flex flex-col gap-1.5">
				<h3 className="text-body text-ink font-semibold">
					{PANEL_TEXT.topPayees}
				</h3>
				<div className="flex flex-col">
					{Array.from({ length: PAYEES }, (_, index) => (
						<div
							key={index}
							className="flex h-9 items-center gap-2.5"
						>
							<Skeleton className="size-7 shrink-0 rounded-full" />
							<LineSkeleton
								size="body"
								width="w-28"
							/>
							<span className="flex-1" />
							<LineSkeleton
								size="body"
								width="w-20"
							/>
						</div>
					))}
				</div>
			</section>
			<p className="text-caption text-ink-3">{PANEL_TEXT.summaryHint}</p>
		</div>
	);
}
