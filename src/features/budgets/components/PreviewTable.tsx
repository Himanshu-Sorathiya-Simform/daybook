"use client";

import { useState } from "react";

import { Button } from "@/components/actions/Button";
import type { Month } from "@/lib/budgets/months";
import type {
	BudgetChange,
	BudgetPreview,
	PreviewMonth,
} from "@/lib/budgets/preview";
import { cn } from "@/lib/cn";
import { STATE_TONES } from "../lib/labels";
import {
	type Figures,
	groupText,
	limitText,
	newState,
	oldState,
	onwardLabel,
	PREVIEW_TEXT,
	type PreviewContext,
	showMoreLabel,
	unchangedText,
} from "../lib/preview";
import { LineSkeleton } from "@/components/feedback/LineSkeleton";

export type PreviewTableProps = {
	preview: Extract<BudgetPreview, { blocked: false }>;
	change: BudgetChange;
	context: PreviewContext;
	figures: Figures;
	/** Called with the months of the row under the pointer, `null` when it leaves. */
	onHighlight: (months: { first: Month; last: Month } | null) => void;
	className?: string;
};

/** The groups shown before "Show N more" (BR-F04-26). */
const FIRST_GROUPS = 6;

/**
 * "Months that change" (BR-F04-26), for 5 months or more: a row per run of consecutive months
 * with the same old limit, new limit and spending ("Nov 2023 to Aug 2026", "34 months"), 6 at
 * first and "Show 3 more" for the rest, then "Dec 2026 onward" with the new limit and "carries
 * on until you change it". A row under the pointer tints its columns in the strip. It is the
 * strip's text alternative, so each row says the old state first when it changes.
 */
export function PreviewTable({
	preview,
	change,
	context,
	figures,
	onHighlight,
	className,
}: Readonly<PreviewTableProps>) {
	const [showAll, setShowAll] = useState(false);
	const { formats } = context;
	const { groups, tail } = preview;
	const shown = showAll ? groups : groups.slice(0, FIRST_GROUPS);
	const hidden = groups.length - FIRST_GROUPS;
	return (
		<table
			className={cn("text-small figures w-full border-collapse", className)}
		>
			<caption className="text-label text-ink pb-1 text-left font-semibold">
				{PREVIEW_TEXT.tableCaption}
			</caption>
			<thead>
				<tr className="border-line text-caption text-ink-2 border-b">
					<th className="py-1 pr-2 text-left font-semibold">
						{PREVIEW_TEXT.months}
					</th>
					<th className="py-1 pr-2 text-left font-semibold">
						{PREVIEW_TEXT.limit}
					</th>
					<th className="py-1 text-left font-semibold">
						{PREVIEW_TEXT.state}
					</th>
				</tr>
			</thead>
			<tbody>
				{shown.map((group) => {
					// A group is its first month's figures, which every month in it shares.
					const first: PreviewMonth = { ...group, month: group.first };
					const months = groupText(group, formats);
					const state =
						figures === "ready" ? newState(first, context) : null;
					const before =
						figures === "ready" ? oldState(first, formats) : null;
					return (
						<tr
							key={group.first}
							data-first={group.first}
							className="border-line hover:bg-accent-soft border-t align-top"
							onPointerEnter={() =>
								onHighlight({ first: group.first, last: group.last })
							}
							onPointerLeave={() => onHighlight(null)}
						>
							<th
								scope="row"
								className="py-2 pr-2 text-left font-normal"
							>
								{months.range}
								{months.count && (
									<span className="text-caption text-ink-3 block">
										{months.count}
									</span>
								)}
							</th>
							<td className="py-2 pr-2">
								{group.changed ?
									<>
										<span className="sr-only">Was </span>
										<s className="text-ink-3">
											{limitText(group.oldLimitMinor, formats)}
										</s>
										<span aria-hidden="true"> → </span>
										<span className="sr-only">, now </span>
										{limitText(group.newLimitMinor, formats)}
									</>
								:	limitText(group.newLimitMinor, formats)}
							</td>
							<td className="py-2">
								{figures === "loading" && (
									<LineSkeleton
										size="body"
										width="w-28"
									/>
								)}
								{!group.changed && unchangedText(first, change)}
								{group.changed && state && (
									<span
										className={cn(
											"text-ink-2",
											before !== null
												&& state.label !== null
												&& cn(
													"font-semibold",
													STATE_TONES[state.label],
												),
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
							</td>
						</tr>
					);
				})}
				{hidden > 0 && (
					<tr className="border-line border-t">
						<td
							colSpan={3}
							className="py-1"
						>
							<Button
								variant="ghost"
								size="sm"
								onPress={() => setShowAll((was) => !was)}
							>
								{showAll ?
									PREVIEW_TEXT.showFewer
								:	showMoreLabel(hidden)}
							</Button>
						</td>
					</tr>
				)}
				{tail && (
					<tr className="border-line text-ink-2 border-t align-top">
						<th
							scope="row"
							className="py-2 pr-2 text-left font-normal"
						>
							{onwardLabel(tail.month, formats)}
						</th>
						<td
							colSpan={2}
							className="py-2"
						>
							{limitText(tail.limitMinor, formats)},{" "}
							{PREVIEW_TEXT.carriesOnLower}
						</td>
					</tr>
				)}
			</tbody>
		</table>
	);
}
