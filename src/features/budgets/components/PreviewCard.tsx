import type { BudgetChange, PreviewMonth } from "@/lib/budgets/preview";
import { cn } from "@/lib/cn";
import { formatMonth } from "@/lib/date-format";
import { STATE_TONES } from "../lib/labels";
import {
	type Figures,
	limitText,
	newState,
	oldState,
	type PreviewContext,
	unchangedText,
} from "../lib/preview";
import { LineSkeleton } from "@/components/feedback/LineSkeleton";

export type PreviewCardProps = {
	month: PreviewMonth;
	change: BudgetChange;
	context: PreviewContext;
	figures: Figures;
	/** Drawn dashed, for the months around the one a one-month change names. */
	isDimmed?: boolean;
	className?: string;
};

/**
 * One month of "What changes" (BR-F04-26): the old limit struck through, the new limit, and
 * the new state, with the old state first when it changes ("84.2% Nearing limit → 72.1% · On
 * track"). A month whose limit does not change says why instead. Without spending, only the
 * limits show; while it loads, a line holds the state's place. The strike-through is also
 * said in words, and a dashed edge marks a month that stays as it is, so colour never carries
 * it alone.
 */
export function PreviewCard({
	month,
	change,
	context,
	figures,
	isDimmed = false,
	className,
}: Readonly<PreviewCardProps>) {
	const { formats } = context;
	const dashed = isDimmed || !month.changed;
	const state = figures === "ready" ? newState(month, context) : null;
	const before = figures === "ready" ? oldState(month, formats) : null;
	return (
		<li
			data-month={month.month}
			className={cn(
				"rounded-control border-line-strong text-small figures flex flex-col gap-0.5 border px-2.5 py-2",
				dashed && "text-ink-2 border-dashed",
				className,
			)}
		>
			<span className="text-caption text-ink-3">
				{formatMonth(month.month, formats, "short")}
			</span>
			{month.changed ?
				<>
					<span className="text-ink-3">
						<span className="sr-only">Was </span>
						<s>{limitText(month.oldLimitMinor, formats)}</s>
					</span>
					<span className="font-semibold">
						<span className="sr-only">Now </span>
						{limitText(month.newLimitMinor, formats)}
					</span>
					{figures === "loading" && (
						<LineSkeleton
							size="caption"
							width="w-24"
						/>
					)}
					{state && (
						<span
							className={cn(
								"text-caption text-ink-2",
								before !== null
									&& state.label !== null
									&& cn("font-semibold", STATE_TONES[state.label]),
							)}
						>
							{before !== null && (
								<span className="text-ink-3 font-normal">
									{before} →{" "}
								</span>
							)}
							{state.text}
						</span>
					)}
				</>
			:	<>
					<span>{limitText(month.newLimitMinor, formats)}</span>
					<span className="text-caption">
						{unchangedText(month, change)}
					</span>
				</>
			}
		</li>
	);
}
