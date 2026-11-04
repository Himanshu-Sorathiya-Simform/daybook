"use client";

import { useDebouncer } from "@tanstack/react-pacer";
import { useState } from "react";

import { AmountInput } from "@/components/forms/AmountInput";
import { RangeSlider } from "@/components/forms/RangeSlider";
import { ToggleChips } from "@/components/forms/ToggleChips";
import { Skeleton } from "@/components/feedback/Skeleton";
import { amountMessage, formatAmountInput, parseAmount } from "@/lib/amount";
import { cn } from "@/lib/cn";
import { formatMoneyShort } from "@/lib/money";
import { boundsOf, type Thumbs, thumbsOf } from "../lib/amount-stops";
import {
	type FilterLocale,
	quickRangeLabel,
	sameBounds,
} from "../lib/filter-labels";
import { transactionCount } from "../lib/labels";
import { FILTER_TEXT } from "../lib/messages";
import { type AmountBounds, quickRanges } from "../lib/quick-ranges";
import type { HistogramAnswer } from "../lib/types";

/** Min and Max commit this long after typing stops (BR-F03-39). */
export const AMOUNT_COMMIT_MS = 300;

export type AmountBlockProps = {
	/** The bounds shown: the committed ones, or the phone sheet's draft. */
	bounds: AmountBounds;
	/** New bounds, none for any amount. */
	onChange: (bounds: AmountBounds) => void;
	/** The amounts under every other filter (BR-F03-60); undefined until it answers. */
	histogram: Pick<HistogramAnswer, "edges" | "counts"> | undefined;
	/** Whether the histogram is still on its way; offline it never comes (section 10). */
	isLoading: boolean;
	/** How many Transactions the filter holds: the header's count, or the sheet's. */
	count: number | undefined;
	locale: FilterLocale;
	className?: string;
};

type Field = { text: string; error: string | undefined };

/** The placeholder's bars while the histogram loads: uneven, so it reads as a histogram. */
const BAR_HEIGHTS = [
	"h-5",
	"h-9",
	"h-4",
	"h-12",
	"h-7",
	"h-3",
	"h-10",
	"h-6",
	"h-11",
	"h-8",
	"h-4",
	"h-6",
];

const fieldOf = (minor: number | undefined, locale: FilterLocale): Field => ({
	text: minor === undefined ? "" : formatAmountInput(minor, locale),
	error: undefined,
});

/** An amount field's text as a bound: none when empty, or the reason it is not one. */
function readBound(
	text: string,
	locale: FilterLocale,
): { ok: true; minor: number | undefined } | { ok: false; error: string } {
	if (text.trim() === "") return { ok: true, minor: undefined };
	const read = parseAmount(text, locale);
	return read.ok ?
			{ ok: true, minor: read.minor }
		:	{ ok: false, error: amountMessage(read.error, locale) };
}

/**
 * The Amount block (BR-F03-39): "4 Transactions"; the histogram's bars, those between the
 * thumbs highlighted; the two-thumb slider on the bars' edges (D-539), committing when a thumb
 * is released; Min and Max in the user's format, committing 300 ms after typing stops; and the
 * quick ranges (BR-F03-74). Bars, slider and quick ranges need the histogram, so they wait for
 * it and are left out offline and when no row matches. A Min above Max keeps the bounds as they
 * were and says "Choose a Min at or below Max." (D-543).
 */
export function AmountBlock({
	bounds,
	onChange,
	histogram,
	isLoading,
	count,
	locale,
	className,
}: Readonly<AmountBlockProps>) {
	const [min, setMin] = useState(() => fieldOf(bounds.minMinor, locale));
	const [max, setMax] = useState(() => fieldOf(bounds.maxMinor, locale));
	const [given, setGiven] = useState(bounds);
	const [preview, setPreview] = useState<Thumbs | null>(null);
	// The fields follow bounds set from elsewhere while rendering, React's pattern for state
	// that follows a prop.
	if (!sameBounds(bounds, given)) {
		setGiven(bounds);
		setMin(fieldOf(bounds.minMinor, locale));
		setMax(fieldOf(bounds.maxMinor, locale));
		setPreview(null);
	}

	const settle = (minText: string, maxText: string) => {
		const low = readBound(minText, locale);
		const high = readBound(maxText, locale);
		let minError = low.ok ? undefined : low.error;
		const maxError = high.ok ? undefined : high.error;
		const reversed =
			low.ok
			&& high.ok
			&& low.minor !== undefined
			&& high.minor !== undefined
			&& low.minor > high.minor;
		if (reversed) minError = FILTER_TEXT.minAboveMax;
		setMin((field) => ({ ...field, error: minError }));
		setMax((field) => ({ ...field, error: maxError }));
		if (!low.ok || !high.ok || reversed) return;
		const next = {
			...(low.minor === undefined ? {} : { minMinor: low.minor }),
			...(high.minor === undefined ? {} : { maxMinor: high.minor }),
		};
		if (!sameBounds(next, bounds)) onChange(next);
	};
	const debouncer = useDebouncer(settle, { wait: AMOUNT_COMMIT_MS });

	const edges = histogram?.edges ?? [];
	const ranges = histogram ? quickRanges(histogram) : [];
	// The slider holds its own position while dragging; it gets the committed one, and the
	// preview only colours the bars, so a release always differs from what it was given.
	const thumbs = edges.length >= 2 ? thumbsOf(edges, bounds) : null;
	const shown = preview ?? thumbs;
	const tallest = Math.max(1, ...(histogram?.counts ?? []));
	const money = (minor: number) =>
		formatMoneyShort(minor, locale.currency, locale.numberLocale);
	const chosenRange = ranges.findIndex((range) => sameBounds(range, bounds));

	return (
		<div className={cn("flex flex-col gap-2.5", className)}>
			<div className="flex items-baseline gap-2">
				<span className="text-label text-ink font-semibold">Amount</span>
				<span className="flex-1" />
				{count !== undefined && (
					<span className="figures text-caption text-ink-2">
						{transactionCount(count)}
					</span>
				)}
			</div>
			{isLoading && (
				<div
					data-testid="amountLoading"
					className="flex flex-col"
				>
					<div className="flex h-13 items-end gap-0.5">
						{BAR_HEIGHTS.map((height, i) => (
							<Skeleton
								key={i}
								className={cn("flex-1 rounded-b-none", height)}
							/>
						))}
					</div>
					<div className="flex h-7 items-center">
						<Skeleton className="h-1" />
					</div>
					<div className="flex justify-between">
						<Skeleton className="h-2.75 w-9" />
						<Skeleton className="h-2.75 w-11" />
					</div>
				</div>
			)}
			{thumbs && histogram && (
				<>
					<div
						aria-hidden="true"
						data-testid="amountBars"
						className="flex h-13 items-end gap-0.5"
					>
						{histogram.counts.map((rows, i) => (
							<div
								key={edges[i]}
								className={cn(
									"rounded-t-bar min-h-0.5 flex-1",
									i >= shown![0] && i < shown![1] ?
										"bg-accent"
									:	"bg-track",
								)}
								style={{ height: `${(rows / tallest) * 100}%` }}
							/>
						))}
					</div>
					<RangeSlider
						label="Amount"
						thumbLabels={["Minimum amount", "Maximum amount"]}
						stops={edges.length}
						value={thumbs}
						onChange={setPreview}
						onChangeEnd={(next) => onChange(boundsOf(edges, next))}
						valueText={(stop) => money(edges[stop]!)}
					/>
					<div
						aria-hidden="true"
						className="figures text-axis text-ink-3 flex justify-between"
					>
						<span>{money(edges[0]!)}</span>
						<span>{money(edges.at(-1)!)}</span>
					</div>
				</>
			)}
			<div className="grid grid-cols-2 gap-2">
				<AmountInput
					label="Min"
					size="md"
					placeholder="Any"
					currency={locale.currency}
					numberLocale={locale.numberLocale}
					value={min.text}
					error={min.error}
					onChange={(text) => {
						setMin({ text, error: undefined });
						debouncer.maybeExecute(text, max.text);
					}}
				/>
				<AmountInput
					label="Max"
					size="md"
					placeholder="Any"
					currency={locale.currency}
					numberLocale={locale.numberLocale}
					value={max.text}
					error={max.error}
					onChange={(text) => {
						setMax({ text, error: undefined });
						debouncer.maybeExecute(min.text, text);
					}}
				/>
			</div>
			{isLoading && (
				<div className="flex gap-1.5">
					<Skeleton className="h-10 w-24 rounded-full" />
					<Skeleton className="h-10 w-28 rounded-full" />
					<Skeleton className="h-10 w-24 rounded-full" />
				</div>
			)}
			{ranges.length > 0 && (
				<ToggleChips
					label="Quick ranges"
					selectionMode="single"
					options={ranges.map((range, i) => ({
						value: String(i),
						label: quickRangeLabel(range, locale),
					}))}
					value={chosenRange === -1 ? [] : [String(chosenRange)]}
					onChange={([key]) => {
						const { minMinor, maxMinor } = ranges[Number(key)]!;
						onChange({
							...(minMinor === undefined ? {} : { minMinor }),
							...(maxMinor === undefined ? {} : { maxMinor }),
						});
					}}
				/>
			)}
		</div>
	);
}
