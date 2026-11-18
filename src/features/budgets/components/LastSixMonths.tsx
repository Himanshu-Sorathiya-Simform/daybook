"use client";

import { useId, useState } from "react";

import { Button } from "@/components/actions/Button";
import { type Month, monthsStarting, shiftMonth } from "@/lib/budgets/months";
import { cn } from "@/lib/cn";
import { formatMonth } from "@/lib/date-format";
import type { Formats } from "../lib/labels";
import { chartLabel, type HistoryMonth, monthCells, PANEL_TEXT } from "../lib/panel";
import { PANEL_MONTHS } from "../lib/queries";
import { LineSkeleton } from "./LineSkeleton";

export type LastSixMonthsProps = {
	/** The months ending at the viewed one, oldest first (BR-F04-35), or undefined while they
	 * load. */
	months: readonly HistoryMonth[] | undefined;
	/** The viewed month, shown bold. */
	month: Month;
	/** While the months load: whether any has a limit, known from the Budget record, so the
	 * caption holds its place. */
	expectsLimits?: boolean;
	formats: Formats;
	className?: string;
};

/** Headroom above the tallest bar or limit, so a dashed line never sits on the top edge. */
const HEADROOM = 1.12;
/** Each bar's share of its month's slot. */
const BAR = 0.6;
/** The skeleton bars' heights while the months load, as shares of the chart. */
const SKELETON_BARS = [0.35, 0.5, 0.42, 0.62, 0.55, 0.75];

const percent = (share: number) => `${share * 100}%`;

/**
 * "Last 6 months" (BR-F04-30): a bar per month with a dashed line at that month's limit and
 * the spending above it in the over colour, captioned when any month has a limit; "View as
 * table" switches to Month, Limit, Spent and Used, and "View as chart" back. Drawn in SVG, not
 * ECharts (D-249); the chart's text for screen readers lists each month's figures, and the
 * table says the same. While the months load, the heading, the switch and the month names
 * show as they will, with skeleton bars or cells where the figures go (D-571).
 */
export function LastSixMonths({
	months,
	month,
	expectsLimits = false,
	formats,
	className,
}: Readonly<LastSixMonthsProps>) {
	const heading = useId();
	const [asTable, setAsTable] = useState(false);
	const names =
		months?.map((each) => each.month)
		?? monthsStarting(shiftMonth(month, 1 - PANEL_MONTHS), PANEL_MONTHS);
	const slot = 1 / Math.max(names.length, 1);
	const captioned =
		months ? months.some((each) => each.limitMinor !== null) : expectsLimits;

	const table = () => (
		<table className="text-body figures w-full border-collapse">
			<thead>
				<tr className="border-line text-caption text-ink-2 border-b">
					<th className="py-1 text-left font-semibold">
						{PANEL_TEXT.month}
					</th>
					<th className="py-1 text-right font-semibold">
						{PANEL_TEXT.limit}
					</th>
					<th className="py-1 text-right font-semibold">
						{PANEL_TEXT.spent}
					</th>
					<th className="py-1 text-right font-semibold">
						{PANEL_TEXT.used}
					</th>
				</tr>
			</thead>
			<tbody>
				{names.map((name, at) => {
					const each = months?.[at];
					const cells = each && monthCells(each, formats);
					const cell = (text: string | undefined, width: string) =>
						text ?? (
							<LineSkeleton
								size="body"
								width={width}
								className="justify-end"
							/>
						);
					return (
						<tr
							key={name}
							className={cn(name === month && "font-bold")}
						>
							<th
								scope="row"
								className="py-1.5 text-left [font-weight:inherit]"
							>
								{formatMonth(name, formats, "short")}
							</th>
							<td className="py-1.5 text-right">
								{cell(cells?.limit, "w-18")}
							</td>
							<td className="py-1.5 text-right">
								{cell(cells?.spent, "w-18")}
							</td>
							<td className="py-1.5 text-right">
								{cell(cells?.used, "w-11")}
							</td>
						</tr>
					);
				})}
			</tbody>
		</table>
	);

	const bars = (shown: readonly HistoryMonth[]) => {
		const top =
			Math.max(
				1,
				...shown.map((each) =>
					Math.max(each.spentMinor, each.limitMinor ?? 0),
				),
			) * HEADROOM;
		return shown.map((each, at) => {
			const spent = Math.max(0, each.spentMinor) / top;
			const limit = each.limitMinor === null ? null : each.limitMinor / top;
			const within = limit === null ? spent : Math.min(spent, limit);
			const x = (at + (1 - BAR) / 2) * slot;
			const width = BAR * slot;
			return (
				<g
					key={each.month}
					data-month={each.month}
				>
					{within > 0 && (
						<rect
							data-part="spent"
							x={percent(x)}
							y={percent(1 - within)}
							width={percent(width)}
							height={percent(within)}
							className={cn(
								"fill-bar",
								each.month !== month && "opacity-55",
							)}
						/>
					)}
					{limit !== null && spent > limit && (
						<rect
							data-part="over"
							x={percent(x)}
							y={percent(1 - spent)}
							width={percent(width)}
							height={percent(spent - limit)}
							className="fill-neg"
						/>
					)}
					{limit !== null && (
						<line
							data-part="limit"
							x1={percent(at * slot + slot * 0.1)}
							x2={percent((at + 1) * slot - slot * 0.1)}
							y1={percent(1 - limit)}
							y2={percent(1 - limit)}
							strokeWidth={2}
							strokeDasharray="4 3"
							className="stroke-ink"
						/>
					)}
				</g>
			);
		});
	};

	const chart = () => (
		<>
			{months ?
				<svg
					role="img"
					aria-label={chartLabel(months, formats)}
					className="border-line-strong h-23 w-full overflow-visible border-b"
				>
					{bars(months)}
				</svg>
			:	<div
					aria-hidden="true"
					data-part="skeleton-chart"
					className="border-line-strong relative h-23 w-full border-b"
				>
					{SKELETON_BARS.map((height, at) => (
						<span
							key={names[at]}
							data-part="skeleton-bar"
							className="bg-track absolute bottom-0"
							// Placed like the real bars, at shares worked out at run time.
							style={{
								left: percent((at + (1 - BAR) / 2) * slot),
								width: percent(BAR * slot),
								height: percent(height),
							}}
						/>
					))}
				</div>
			}
			<div
				aria-hidden="true"
				className="text-axis text-ink-3 flex"
			>
				{names.map((name) => (
					<span
						key={name}
						className={cn(
							"flex-1 text-center",
							name === month && "text-ink font-bold",
						)}
					>
						{formatMonth(name, formats, "shortName")}
					</span>
				))}
			</div>
			{captioned && (
				<p className="text-caption text-ink-3">{PANEL_TEXT.chartCaption}</p>
			)}
		</>
	);

	return (
		<section
			aria-labelledby={heading}
			aria-busy={months === undefined}
			className={cn("flex flex-col gap-2", className)}
		>
			<div className="flex items-baseline justify-between gap-3">
				<h3
					id={heading}
					className="text-body text-ink font-semibold"
				>
					{PANEL_TEXT.lastSixMonths}
				</h3>
				<Button
					variant="ghost"
					size="sm"
					onPress={() => setAsTable(!asTable)}
				>
					{asTable ? PANEL_TEXT.viewAsChart : PANEL_TEXT.viewAsTable}
				</Button>
			</div>
			{asTable ? table() : chart()}
		</section>
	);
}
