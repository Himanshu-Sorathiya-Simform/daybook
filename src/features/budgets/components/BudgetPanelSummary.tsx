import { type Month, shiftMonth } from "@/lib/budgets/months";
import { cn } from "@/lib/cn";
import { formatMonth } from "@/lib/date-format";
import type { Formats } from "../lib/labels";
import { comparedWith, compareRows, PANEL_TEXT } from "../lib/panel";
import type { BudgetMonthAnswer } from "../lib/types";
import { LineSkeleton } from "@/components/feedback/LineSkeleton";

export type BudgetPanelSummaryProps = {
	/** The month shown. */
	month: Month;
	/** Its view, or undefined while it loads. */
	view: BudgetMonthAnswer | undefined;
	formats: Formats;
	className?: string;
};

/** The rows' labels, known before the month loads. */
const LABELS = [PANEL_TEXT.budgetedSpending, PANEL_TEXT.limits, PANEL_TEXT.overOrAt];

/**
 * The docked panel with nothing selected (BR-F04-30): "This month" and the month; "Compared
 * with September", three rows each with a note; the box "How limits work"; and the hint.
 * While the month loads, everything but the rows' figures and notes shows as it will, with
 * skeleton lines in their place (section 6).
 */
export function BudgetPanelSummary({
	month,
	view,
	formats,
	className,
}: Readonly<BudgetPanelSummaryProps>) {
	const previous = comparedWith(shiftMonth(month, -1), formats);
	const rows =
		view ?
			compareRows(view, formats)
		:	LABELS.map((label) => ({ label, value: undefined, note: undefined }));
	return (
		<div
			aria-busy={view === undefined}
			className={cn("flex flex-col gap-5", className)}
		>
			<div>
				<p className="text-label text-ink-2">{PANEL_TEXT.thisMonth}</p>
				<h2 className="text-heading text-ink">
					{formatMonth(month, formats)}
				</h2>
			</div>
			<section aria-label={previous}>
				<h3 className="text-body text-ink font-semibold">{previous}</h3>
				<dl className="border-line mt-2 border-t">
					{rows.map((row) => (
						<div
							key={row.label}
							className="border-line grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 border-b py-2.5"
						>
							<dt className="text-label text-ink-2">{row.label}</dt>
							<dd className="text-ink figures text-right font-semibold">
								{row.value ?? (
									<LineSkeleton
										size="body"
										width="w-24"
									/>
								)}
							</dd>
							<dd className="text-caption text-ink-3 col-span-full">
								{row.note ?? (
									<LineSkeleton
										size="caption"
										width="w-48"
									/>
								)}
							</dd>
						</div>
					))}
				</dl>
			</section>
			<section
				aria-label={PANEL_TEXT.howLimitsWork}
				className="bg-soft rounded-control text-body text-ink-2 flex flex-col gap-1.5 px-3.5 py-3"
			>
				<h3 className="text-ink font-semibold">
					{PANEL_TEXT.howLimitsWork}
				</h3>
				{PANEL_TEXT.howLimitsWorkLines.map((line) => (
					<p key={line}>{line}</p>
				))}
			</section>
			<p className="text-caption text-ink-3">{PANEL_TEXT.summaryHint}</p>
		</div>
	);
}
