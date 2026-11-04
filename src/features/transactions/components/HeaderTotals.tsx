"use client";

import { CircleAlert } from "lucide-react";

import { Button } from "@/components/actions/Button";
import { Money } from "@/components/data/Money";
import { Skeleton } from "@/components/feedback/Skeleton";
import { Section } from "@/components/surfaces/Section";
import { cn } from "@/lib/cn";
import type { LabelLocale } from "../lib/labels";
import type { SummaryAnswer } from "../lib/types";

export type HeaderTotalsProps = {
	/** The summary's answer once it has one. */
	summary: SummaryAnswer | undefined;
	/** Whether the summary failed with nothing to show. */
	isError: boolean;
	onRetry: () => void;
	locale: Pick<LabelLocale, "currency" | "numberLocale">;
	className?: string;
};

const FIGURES = [
	["In", "incomeMinor"],
	["Out", "spendingMinor"],
	["To Goals", "toGoalsMinor"],
] as const;

/**
 * The header totals of the committed filter (BR-F03-41, D-82): Count, In, Out and To Goals.
 * Skeleton figures while loading, zeros when nothing matches, and "Totals could not be
 * loaded." with Retry when the summary fails. A negative figure shows its minus (TXN-7).
 */
export function HeaderTotals({
	summary,
	isError,
	onRetry,
	locale,
	className,
}: Readonly<HeaderTotalsProps>) {
	if (!summary && isError) {
		return (
			<Section
				className={cn("flex items-center gap-3 px-5 py-3.5", className)}
			>
				<CircleAlert
					aria-hidden="true"
					className="text-neg size-4 shrink-0"
				/>
				<p
					role="alert"
					className="text-body text-ink"
				>
					Totals could not be loaded.
				</p>
				<Button
					size="sm"
					variant="secondary"
					onPress={onRetry}
				>
					Retry
				</Button>
			</Section>
		);
	}
	const figure = "text-figure text-ink mt-0.5";
	return (
		<Section className={cn("px-5 py-3.5", className)}>
			<dl
				aria-busy={summary ? undefined : true}
				className="grid grid-cols-[repeat(auto-fit,minmax(9.5rem,1fr))] gap-3"
			>
				<div>
					<dt className="text-label text-ink-2">Count</dt>
					<dd className={cn(figure, "figures")}>
						{summary ? summary.count : <Skeleton className="h-6 w-16" />}
					</dd>
				</div>
				{FIGURES.map(([label, field]) => (
					<div key={field}>
						<dt className="text-label text-ink-2">{label}</dt>
						<dd className={figure}>
							{summary ?
								<Money
									minor={summary[field]}
									currency={locale.currency}
									numberLocale={locale.numberLocale}
								/>
							:	<Skeleton className="h-6 w-28" />}
						</dd>
					</div>
				))}
			</dl>
		</Section>
	);
}
