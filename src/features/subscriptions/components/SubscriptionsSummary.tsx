"use client";

import { Money } from "@/components/data/Money";
import { Section } from "@/components/surfaces/Section";
import { cn } from "@/lib/cn";
import type { Formats } from "../lib/labels";
import { SUMMARY_TEXT, summaryFigures } from "../lib/summary";
import type { SubscriptionList } from "../lib/types";

export type SubscriptionsSummaryProps = {
	list: SubscriptionList;
	formats: Formats;
	className?: string;
};

/**
 * The summary (BR-F05-21), shown when there is at least one Subscription: the monthly cost as
 * the readout with the yearly cost and the count under it (BR-F05-17); beside it, below it
 * when the space is narrow, this month's name and total, a bar split between charged and still
 * to come with both figures (BR-F05-18), and the next 30 days with their count and total
 * (BR-F05-20). The bar carries no words, so it is hidden from screen readers: the figures
 * beside it say the same in text.
 */
export function SubscriptionsSummary({
	list,
	formats,
	className,
}: Readonly<SubscriptionsSummaryProps>) {
	const figures = summaryFigures(list, formats);
	return (
		<Section className={cn("@container px-6 py-5.5 max-md:p-4.5", className)}>
			<div className="grid grid-cols-1 gap-4.5 @xl:grid-cols-[minmax(0,1.15fr)_minmax(15rem,1fr)] @xl:gap-8">
				<div className="flex min-w-0 flex-col gap-1.5">
					<span className="text-label text-ink-2">
						{SUMMARY_TEXT.monthlyCost}
					</span>
					<Money
						minor={figures.monthlyMinor}
						currency={formats.currency}
						numberLocale={formats.numberLocale}
						variant="readout"
						tone="neutral"
					/>
					<p className="text-body-lg text-ink-2 figures">
						{figures.yearlyLine}
					</p>
				</div>
				<div className="border-line figures flex min-w-0 flex-col gap-2 @xl:border-l @xl:pl-6">
					<p className="text-label flex items-baseline gap-2">
						<span className="text-ink font-medium">
							{figures.monthName}
						</span>
						<span className="flex-1" />
						<span className="text-ink-2">{figures.inAll}</span>
					</p>
					<div
						aria-hidden="true"
						className="bg-track h-2.5 w-full overflow-hidden rounded-full"
					>
						<div
							data-part="charged"
							className="bg-bar h-full"
							style={{ width: `${figures.chargedPercent}%` }}
						/>
					</div>
					<p className="text-caption text-ink-2 flex flex-wrap gap-x-2">
						<span>{figures.charged}</span>
						<span className="flex-1" />
						<span>{figures.stillToCome}</span>
					</p>
					<p className="border-line text-label text-ink flex flex-wrap items-baseline gap-x-2 border-t pt-2 font-medium">
						<span>{figures.nextTitle}</span>
						<span className="flex-1" />
						<span className="font-semibold">{figures.nextTotal}</span>
					</p>
				</div>
			</div>
		</Section>
	);
}
