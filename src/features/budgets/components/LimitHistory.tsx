"use client";

import { useId } from "react";

import { Button } from "@/components/actions/Button";
import type { BudgetRules } from "@/lib/budgets/model";
import type { Month } from "@/lib/budgets/months";
import { cn } from "@/lib/cn";
import type { Formats } from "../lib/labels";
import { historyItems, inForceText, noBudgetBefore, PANEL_TEXT } from "../lib/panel";

export type LimitHistoryProps = {
	/** The Budget record's schedule and one-month limits. */
	rules: BudgetRules;
	/** The viewed month, whose deciding item is bold. */
	month: Month;
	formats: Formats;
	/** Remove on a one-month limit (BR-F04-25). */
	onRemove: (month: Month) => void;
	/** A Remove is on its way: the buttons rest until it is answered. */
	isRemoving?: boolean;
	className?: string;
};

/**
 * "Limit history" (BR-F04-30): a Budget record's schedule entries and one-month limits, newest
 * first, on a line of dots. The item that decides the viewed month's limit is bold with "In
 * force in October"; a one-month limit reads "One month" with Remove. It ends with "No Budget
 * before Sep 2026".
 */
export function LimitHistory({
	rules,
	month,
	formats,
	onRemove,
	isRemoving = false,
	className,
}: Readonly<LimitHistoryProps>) {
	const heading = useId();
	return (
		<section
			aria-labelledby={heading}
			className={cn("flex flex-col gap-2", className)}
		>
			<h3
				id={heading}
				className="text-body text-ink font-semibold"
			>
				{PANEL_TEXT.limitHistory}
			</h3>
			<ol className="border-line ml-1.25 flex flex-col gap-3 border-l-2 pl-3.5">
				{historyItems(rules, month, formats).map((item) => (
					<li
						key={`${item.kind}:${item.month}`}
						className={cn(
							"text-body figures relative",
							item.inForce ? "text-ink font-semibold" : "text-ink-2",
						)}
					>
						<span
							aria-hidden="true"
							className={cn(
								"absolute top-1 -left-5.25 size-2.5 rounded-full",
								item.inForce ? "bg-ink" : "bg-line-strong",
							)}
						/>
						{item.text}
						{(item.inForce || item.kind === "override") && (
							<span className="text-caption text-ink-3 flex flex-wrap items-center gap-x-2 font-normal">
								{item.inForce && (
									<span>{inForceText(month, formats)}</span>
								)}
								{item.inForce && item.kind === "override" && (
									<span aria-hidden="true">·</span>
								)}
								{item.kind === "override" && (
									<>
										<span>{PANEL_TEXT.oneMonth}</span>
										<Button
											variant="ghost"
											size="sm"
											aria-label={`${PANEL_TEXT.remove} ${item.text}`}
											className="h-auto px-0 py-0.5"
											isDisabled={isRemoving}
											onPress={() => onRemove(item.month)}
										>
											{PANEL_TEXT.remove}
										</Button>
									</>
								)}
							</span>
						)}
					</li>
				))}
				<li className="text-caption text-ink-3 relative">
					<span
						aria-hidden="true"
						className="border-line-strong bg-page absolute top-1 -left-5.25 size-2.5 rounded-full border-[1.5px] border-dashed"
					/>
					{noBudgetBefore(rules, formats)}
				</li>
			</ol>
		</section>
	);
}
