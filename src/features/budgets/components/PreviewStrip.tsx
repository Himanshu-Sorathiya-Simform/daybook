import type { Month } from "@/lib/budgets/months";
import type { PreviewMonth } from "@/lib/budgets/preview";
import { cn } from "@/lib/cn";
import { formatMonth } from "@/lib/date-format";
import type { Formats } from "../lib/labels";
import { PREVIEW_TEXT, stripColumn } from "../lib/preview";

export type PreviewStripProps = {
	months: readonly PreviewMonth[];
	/** The first and last month of the table row under the pointer, drawn with a tint. */
	highlight: { first: Month; last: Month } | null;
	/** While the spending loads, an empty strip holds the place. */
	isLoading?: boolean;
	formats: Formats;
	className?: string;
};

/** The bar stops at 160% of the new limit, as the overview's does (BR-F04-15). */
const CAP = 1.6;
/** Up to this many months, each column is named by its month's first letter. */
const LETTERED = 14;
/** Past this many columns, the gaps shrink so the strip still fits. */
const CROWDED = 24;

const percent = (share: number) => `${share * 100}%`;

/**
 * The strip of "What changes" for 5 months or more (BR-F04-26): one column per month showing
 * its spending against the new limit, the part over it in the over colour, a black tick at the
 * old limit, and a dashed empty column for a month with no new limit; a last dashed column
 * stands for every month after. Drawn in SVG, not ECharts (D-249), and hidden from screen
 * readers: the table under it says the same in words.
 */
export function PreviewStrip({
	months,
	highlight,
	isLoading = false,
	formats,
	className,
}: Readonly<PreviewStripProps>) {
	// One slot per month and one for "every month after".
	const slot = 1 / (months.length + 1);
	const gap = months.length > CROWDED ? 0.1 : 0.25;
	const x = (at: number) => (at + gap / 2) * slot;
	const width = (1 - gap) * slot;
	const high = (month: Month) =>
		highlight !== null && month >= highlight.first && month <= highlight.last;
	const label = (month: Month, at: number) => {
		if (months.length <= LETTERED) {
			return formatMonth(month, formats, "shortName").slice(0, 1);
		}
		return at === 0 || month.endsWith("-01") ? `’${month.slice(2, 4)}` : "";
	};
	return (
		<div
			aria-hidden="true"
			className={cn("flex flex-col gap-1", className)}
		>
			<svg
				data-part="strip"
				className="border-line-strong h-15 w-full overflow-visible border-b"
			>
				{months.map((month, at) => {
					const column = stripColumn(month);
					const spent = Math.min(column.spendShare, CAP) / CAP;
					const within = Math.min(spent, 1 / CAP);
					return (
						<g
							key={month.month}
							data-month={month.month}
						>
							{high(month.month) && (
								<rect
									data-part="highlight"
									x={percent(at * slot)}
									y="0"
									width={percent(slot)}
									height="100%"
									className="fill-accent-soft"
								/>
							)}
							{column.noBudget ?
								<rect
									data-part="no-budget"
									x={percent(x(at))}
									y={percent(1 - 1 / CAP)}
									width={percent(width)}
									height={percent(1 / CAP)}
									className="stroke-line-strong fill-none"
									strokeDasharray="3 2"
								/>
							: !isLoading ?
								<>
									{within > 0 && (
										<rect
											data-part="spent"
											x={percent(x(at))}
											y={percent(1 - within)}
											width={percent(width)}
											height={percent(within)}
											className="fill-bar"
										/>
									)}
									{spent > within && (
										<rect
											data-part="over"
											x={percent(x(at))}
											y={percent(1 - spent)}
											width={percent(width)}
											height={percent(spent - within)}
											className="fill-neg"
										/>
									)}
								</>
							:	null}
							{column.tickShare !== null && (
								<line
									data-part="tick"
									x1={percent(at * slot)}
									x2={percent((at + 1) * slot)}
									y1={percent(
										1 - Math.min(column.tickShare, CAP) / CAP,
									)}
									y2={percent(
										1 - Math.min(column.tickShare, CAP) / CAP,
									)}
									strokeWidth={2}
									className="stroke-ink"
								/>
							)}
						</g>
					);
				})}
				<rect
					data-part="onward"
					x={percent(x(months.length))}
					y={percent(1 - 1 / CAP)}
					width={percent(width)}
					height={percent(1 / CAP)}
					className="stroke-line-strong fill-none"
					strokeDasharray="3 2"
				/>
			</svg>
			<div className="text-axis text-ink-3 flex">
				{months.map((month, at) => (
					<span
						key={month.month}
						className="flex-1 text-center whitespace-nowrap"
					>
						{label(month.month, at)}
					</span>
				))}
				<span className="flex-1 text-center">→</span>
			</div>
			<p className="text-caption text-ink-3">{PREVIEW_TEXT.stripCaption}</p>
		</div>
	);
}
