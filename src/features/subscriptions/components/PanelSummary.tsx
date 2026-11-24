"use client";

import { Button as AriaButton } from "react-aria-components";

import { categoryColor } from "@/lib/categories";
import { cn } from "@/lib/cn";
import type { ExpenseCategory } from "@/lib/subscriptions/model";
import type { Formats } from "../lib/labels";
import { categoryCosts, PANEL_TEXT } from "../lib/panel";
import type { SubscriptionList } from "../lib/types";

export type PanelSummaryProps = {
	list: Pick<SubscriptionList, "items" | "totals">;
	formats: Formats;
	/** The category the list is filtered to: its row reads as pressed. */
	activeCategory?: ExpenseCategory | null;
	/** A press on a category: it filters the list to it, or clears the filter (D-622). */
	onCategory?: (category: ExpenseCategory) => void;
	className?: string;
};

/**
 * The docked panel with nothing selected (BR-F05-40): "Your Subscriptions" and "Monthly cost by
 * category", each category's monthly equivalent and its share with a bar, largest first; the
 * box "How charges work"; and the hint. The bars are drawn in the category's own colour, with
 * the figures beside them, so colour is never the only carrier. Each category is a button that
 * filters the list to it (D-622): the whole row presses it, and the category the list is
 * filtered to reads as pressed.
 */
export function PanelSummary({
	list,
	formats,
	activeCategory = null,
	onCategory,
	className,
}: Readonly<PanelSummaryProps>) {
	const costs = categoryCosts(list, formats);
	return (
		<div className={cn("flex flex-col gap-5", className)}>
			<div>
				<h2 className="text-heading text-ink">{PANEL_TEXT.summaryTitle}</h2>
				<p className="text-label text-ink-2">{PANEL_TEXT.summarySubtitle}</p>
			</div>
			{costs.length > 0 && (
				<ul
					aria-label={PANEL_TEXT.summarySubtitle}
					className="flex flex-col gap-1"
				>
					{costs.map((cost) => {
						const active = cost.category === activeCategory;
						return (
							<li
								key={cost.category}
								className={cn(
									"rounded-control hover:bg-soft has-focus-visible:focus-ring relative -mx-2 flex cursor-pointer flex-col gap-1 px-2 py-1.5 transition-colors duration-(--dur-fast) ease-out",
									active && "bg-accent-soft hover:bg-accent-soft",
								)}
							>
								<div className="text-label figures flex items-baseline gap-2">
									<AriaButton
										aria-pressed={active}
										onPress={() => onCategory?.(cost.category)}
										className="text-ink min-w-0 flex-1 cursor-pointer truncate text-left font-medium outline-none after:absolute after:inset-0 after:content-['']"
									>
										{cost.label}
									</AriaButton>
									<span className="text-ink font-semibold">
										{cost.monthly}
									</span>
									<span className="text-ink-2 w-12 text-right">
										{cost.share}
									</span>
								</div>
								<div
									aria-hidden="true"
									className="bg-track h-1.5 overflow-hidden rounded-full"
								>
									<div
										className="h-full rounded-full"
										style={{
											width: `${cost.shareTenths / 10}%`,
											background: categoryColor(cost.category),
										}}
									/>
								</div>
							</li>
						);
					})}
				</ul>
			)}
			<section
				aria-label={PANEL_TEXT.howTitle}
				className="bg-soft rounded-control text-body text-ink-2 flex flex-col gap-1.5 px-3.5 py-3"
			>
				<h3 className="text-ink font-semibold">{PANEL_TEXT.howTitle}</h3>
				{PANEL_TEXT.how.map((line) => (
					<p key={line}>{line}</p>
				))}
			</section>
			<p className="text-caption text-ink-3">{PANEL_TEXT.selectHint}</p>
		</div>
	);
}
