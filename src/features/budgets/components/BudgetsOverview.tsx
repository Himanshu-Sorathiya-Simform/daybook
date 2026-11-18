"use client";

import { BudgetBar } from "@/components/data/BudgetBar";
import { Money } from "@/components/data/Money";
import { Section } from "@/components/surfaces/Section";
import { type StateLabel, stateLabel } from "@/lib/budgets/model";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/cn";
import {
	dayOfMonth,
	type Formats,
	LIST_TEXT,
	overviewFigures,
	overviewLabel,
	STATE_TONES,
	tickCaption,
	todayCaption,
} from "../lib/labels";
import type { BudgetMonthAnswer } from "../lib/types";
import { StateCount } from "./StateCount";

export type BudgetsOverviewProps = {
	/** The month's view, with at least one Budget. */
	view: BudgetMonthAnswer;
	formats: Formats;
	/** The profile's today, when the view is of the current month: it adds today's marker. */
	today: string | null;
	/** The state the list is filtered to, or `null`. */
	filter: StateLabel | null;
	onFilterChange: (filter: StateLabel | null) => void;
	className?: string;
};

/** The counts' order (BR-F04-15): At limit sits between Over budget and Nearing limit. */
const STATES: readonly StateLabel[] = ["over", "at", "warning", "ok"];

/**
 * The month's overview (BR-F04-15): "Budgeted spending in October", the budgeted spent as the
 * readout, "of ₹11,000.00 · 119.7% · Over by ₹2,168.00", and the overall bar with its
 * captions; beside it, the four state counts that filter the list (BR-F04-31), then Not
 * budgeted and Total spending, which always add up (BR-F04-11). It raises no alert
 * (BR-F04-10). The two columns stack when the space is narrow.
 */
export function BudgetsOverview({
	view,
	formats,
	today,
	filter,
	onFilterChange,
	className,
}: Readonly<BudgetsOverviewProps>) {
	const overall = {
		limitMinor: view.overall.limitMinor,
		spentMinor: view.overall.spentMinor,
		// The overview shows only for a month with a Budget, which always has a utilization.
		utilizationTenths: view.overall.utilizationTenths as number,
	};
	const figures = overviewFigures(overall, formats);
	const tone = STATE_TONES[stateLabel(overall.utilizationTenths)];
	const counts = Object.fromEntries(
		STATES.map((state) => [
			state,
			view.budgets.filter((row) => stateLabel(row.utilizationTenths) === state)
				.length,
		]),
	) as Record<StateLabel, number>;
	const day = today === null ? null : dayOfMonth(today);
	const money = (minor: number) =>
		formatMoney(minor, formats.currency, formats.numberLocale);

	return (
		<Section className={cn("@container px-6 py-5.5 max-md:p-4.5", className)}>
			<div className="grid grid-cols-1 gap-4.5 @xl:grid-cols-[minmax(0,1.4fr)_minmax(13.75rem,1fr)] @xl:gap-8">
				<div className="flex min-w-0 flex-col gap-1.5">
					<span className="text-label text-ink-2">
						{overviewLabel(view.month, formats)}
					</span>
					<Money
						minor={overall.spentMinor}
						currency={formats.currency}
						numberLocale={formats.numberLocale}
						variant="readout"
						tone="neutral"
					/>
					<p className="text-body-lg text-ink-2 figures">
						{figures.total} ·{" "}
						<span className={cn("font-semibold", tone)}>
							{figures.state}
						</span>
					</p>
					<BudgetBar
						utilizationTenths={overall.utilizationTenths}
						size="lg"
						className="mt-3"
						{...(day ? { todayShare: day.share } : {})}
					/>
					<p className="text-caption text-ink-3 mt-1 flex flex-wrap gap-x-3">
						<span>{tickCaption(overall, formats)}</span>
						{day && (
							<span className="text-accent">
								{todayCaption(day.day, day.days)}
							</span>
						)}
					</p>
				</div>
				<div className="border-line flex min-w-0 flex-col @xl:border-l @xl:pl-6">
					{STATES.map((state) => (
						<StateCount
							key={state}
							state={state}
							count={counts[state]}
							isSelected={filter === state}
							onChange={(isSelected) =>
								onFilterChange(isSelected ? state : null)
							}
						/>
					))}
					<div className="border-line-strong my-2 border-t" />
					<p className="text-label flex min-h-8 items-baseline gap-2">
						<span className="text-ink-2 flex-1">
							{LIST_TEXT.notBudgeted}
						</span>
						<span className="figures text-ink font-semibold">
							{money(view.unbudgetedMinor)}
						</span>
					</p>
					<p className="text-label text-ink-2 flex min-h-7 items-baseline gap-2">
						<span className="flex-1">{LIST_TEXT.totalSpending}</span>
						<span className="figures">
							{money(view.totalSpentMinor)}
						</span>
					</p>
				</div>
			</div>
		</Section>
	);
}
