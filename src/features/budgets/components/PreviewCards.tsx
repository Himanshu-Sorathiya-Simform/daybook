import type { BudgetChange, BudgetPreview } from "@/lib/budgets/preview";
import { cn } from "@/lib/cn";
import {
	type Figures,
	limitText,
	onwardLabel,
	PREVIEW_TEXT,
	type PreviewContext,
} from "../lib/preview";
import { PreviewCard } from "./PreviewCard";

export type PreviewCardsProps = {
	preview: Extract<BudgetPreview, { blocked: false }>;
	change: BudgetChange;
	context: PreviewContext;
	figures: Figures;
	className?: string;
};

/**
 * "What changes" for up to 4 months, or any one-month change (BR-F04-26): a card per month,
 * then for a change from a month onward a card "Dec 2026 onward" with the new limit and
 * "Carries on until you change it". For one month only the changed month is solid and the
 * months beside it dashed.
 */
export function PreviewCards({
	preview,
	change,
	context,
	figures,
	className,
}: Readonly<PreviewCardsProps>) {
	const { formats } = context;
	return (
		<ul
			className={cn(
				"grid grid-cols-[repeat(auto-fit,minmax(7.5rem,1fr))] gap-1.5",
				className,
			)}
		>
			{preview.months.map((month) => (
				<PreviewCard
					key={month.month}
					month={month}
					change={change}
					context={context}
					figures={figures}
					isDimmed={
						change.scope === "month" && month.month !== change.month
					}
				/>
			))}
			{preview.tail && (
				<li
					data-part="tail"
					className="rounded-control border-line-strong text-small text-ink-2 figures flex flex-col gap-0.5 border border-dashed px-2.5 py-2"
				>
					<span className="text-caption text-ink-3">
						{onwardLabel(preview.tail.month, formats)}
					</span>
					<span>{limitText(preview.tail.limitMinor, formats)}</span>
					<span className="text-caption">{PREVIEW_TEXT.carriesOn}</span>
				</li>
			)}
		</ul>
	);
}
