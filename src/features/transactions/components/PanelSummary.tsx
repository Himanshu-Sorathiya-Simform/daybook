"use client";

import { Avatar } from "@/components/data/Avatar";
import { CategoryTag } from "@/components/data/CategoryTag";
import { Money } from "@/components/data/Money";
import { Skeleton } from "@/components/feedback/Skeleton";
import { categoryColor } from "@/lib/categories";
import { cn } from "@/lib/cn";
import type { LabelLocale } from "../lib/labels";
import { categoryBars, PANEL_TEXT, summaryHeading, topPayees } from "../lib/panel";
import type { SummaryAnswer } from "../lib/types";

export type PanelSummaryProps = {
	/** The committed filter's summary, shared with the header totals; none while it loads or
	 * after it failed. */
	summary: SummaryAnswer | undefined;
	/** Whether the summary is still on its way: skeleton lines show meanwhile. */
	isPending: boolean;
	locale: LabelLocale;
	className?: string;
};

/**
 * The docked panel with no row selected (BR-F03-71): "This list" with the count and the date
 * span, "Out by category" as bars in each category's colour, "Top payees by Out", then the
 * hint. Empty parts are left out; a failed summary leaves only the hint.
 */
export function PanelSummary({
	summary,
	isPending,
	locale,
	className,
}: Readonly<PanelSummaryProps>) {
	const money = { currency: locale.currency, numberLocale: locale.numberLocale };
	if (isPending) {
		return (
			<div
				role="status"
				aria-busy="true"
				aria-label="Loading the summary"
				className={cn("flex flex-col gap-3", className)}
			>
				<Skeleton className="h-3.5 w-30" />
				<Skeleton className="h-5.5 w-45" />
				{[0, 1, 2, 3].map((each) => (
					<Skeleton
						key={each}
						className="h-2.5 w-full"
					/>
				))}
			</div>
		);
	}
	const heading = summary && summaryHeading(summary, locale);
	const bars = categoryBars(summary?.byCategory);
	const payees = topPayees(summary?.byPayee);
	return (
		<div className={cn("flex flex-col gap-5.5", className)}>
			{heading && (
				<div>
					<p className="text-label text-ink-2">{PANEL_TEXT.list}</p>
					<p className="text-heading text-ink">{heading.count}</p>
					{heading.span && (
						<p className="text-caption text-ink-2">{heading.span}</p>
					)}
				</div>
			)}
			{bars.length > 0 && (
				<section
					aria-label={PANEL_TEXT.byCategory}
					className="flex flex-col gap-2.5"
				>
					<h3 className="text-body text-ink font-semibold">
						{PANEL_TEXT.byCategory}
					</h3>
					{/* One grid for every row, so the bars start and end together whatever the
					    label or amount; a long category name wraps instead of running over its bar. */}
					<ul className="grid grid-cols-[minmax(0,8rem)_minmax(0,1fr)_max-content] items-center gap-2.5">
						{bars.map((bar) => (
							<li
								key={bar.key}
								className="col-span-3 grid grid-cols-subgrid items-center"
							>
								<CategoryTag
									category={bar.key}
									className="min-w-0 whitespace-normal"
								/>
								<span
									aria-hidden="true"
									className="rounded-bar h-2"
									style={{
										width: `${Math.max(bar.share > 0 ? 2 : 0, bar.share * 100)}%`,
										background: categoryColor(bar.key),
									}}
								/>
								<Money
									minor={bar.outMinor}
									{...money}
									className="text-body text-right font-semibold"
								/>
							</li>
						))}
					</ul>
				</section>
			)}
			{payees.length > 0 && (
				<section
					aria-label={PANEL_TEXT.topPayees}
					className="flex flex-col gap-1.5"
				>
					<h3 className="text-body text-ink font-semibold">
						{PANEL_TEXT.topPayees}
					</h3>
					<ul className="flex flex-col">
						{payees.map((payee) => {
							const name = payee.label ?? payee.key;
							return (
								<li
									key={payee.key}
									className="flex h-9 items-center gap-2.5"
								>
									<Avatar
										payee={name}
										size="sm"
									/>
									<span className="text-body text-ink min-w-0 truncate font-medium">
										{name}
									</span>
									<span className="text-caption text-ink-3">
										{payee.count}
									</span>
									<span className="flex-1" />
									<Money
										minor={payee.outMinor}
										{...money}
										className="font-semibold whitespace-nowrap"
									/>
								</li>
							);
						})}
					</ul>
				</section>
			)}
			<p className="text-caption text-ink-3">{PANEL_TEXT.summaryHint}</p>
		</div>
	);
}
