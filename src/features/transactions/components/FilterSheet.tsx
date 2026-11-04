"use client";

import { useQuery } from "@tanstack/react-query";
import { useDebouncedValue } from "@tanstack/react-pacer";
import { SlidersHorizontal } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/actions/Button";
import { ToggleChips } from "@/components/forms/ToggleChips";
import { Dialog } from "@/components/surfaces/Dialog";
import { useOnline } from "@/hooks/useOnline";
import {
	type CategoryKey,
	categoryLabel,
	EXPENSE_CATEGORIES,
	INCOME_CATEGORIES,
} from "@/lib/categories";
import { cn } from "@/lib/cn";
import {
	RANGE_PRESETS,
	type RangePreset,
	SOURCES,
	type Source,
	type TxnType,
} from "@/lib/transactions/model";
import { presetRange } from "@/lib/transactions/presets";
import type { TransactionFilter } from "@/lib/transactions/url";
import type { WeekStart } from "@/lib/geo";
import { useHistogram } from "../hooks/useHistogram";
import {
	FILTER_TYPES,
	type FilterLocale,
	omitFields,
	PRESET_LABELS,
	presetOfFilter,
	SOURCE_LABELS,
	TYPE_LABELS,
} from "../lib/filter-labels";
import { transactionCount } from "../lib/labels";
import { FILTER_TEXT } from "../lib/messages";
import { transactionSummaryOptions } from "../lib/queries";
import { PAGE_BREAKDOWNS } from "../lib/types";
import { AmountBlock } from "./AmountBlock";
import { CustomRange } from "./CustomRange";

/** The draft's count is asked for this long after its last change (BR-F03-39). */
export const DRAFT_COUNT_MS = 300;

export type FilterSheetProps = {
	/** The committed filter, which a new draft starts from. */
	filter: TransactionFilter;
	/** Applies the draft as one URL change. */
	onApply: (filter: TransactionFilter) => void;
	/** How many chips the committed filter shows, for "Filters (2)". */
	activeCount: number;
	locale: FilterLocale;
	/** The profile's week start, the custom calendar's first column. */
	firstDayOfWeek: WeekStart;
	className?: string;
};

/** The fields the sheet edits; the search, a Goal and a Subscription stay as they are. */
const SHEET_FIELDS = [
	"from",
	"to",
	"type",
	"cat",
	"src",
	"minMinor",
	"maxMinor",
] as const satisfies readonly (keyof TransactionFilter)[];

/** The draft with one list replaced, dropping it when empty. */
function withList<K extends "type" | "cat">(
	draft: TransactionFilter,
	key: K,
	values: NonNullable<TransactionFilter[K]>,
): TransactionFilter {
	return values.length ? { ...draft, [key]: values } : omitFields(draft, key);
}

/**
 * Filters on phones (BR-F03-39, D-523): "Filters", or "Filters (2)" with active chips, opens a
 * sheet of chips for the date presets and Custom range, Type, Category and Source, and the
 * amount block. Custom range shows From and To over a one-month range calendar, which set the
 * draft's dates (D-523). Changes stay a draft until "Show 4 Transactions" applies them as one URL change; the
 * count is the draft's summary, and the amount block's histogram is the draft's, both asked
 * 300 ms after its last change. With none it reads "No matches". Until the summary answers it
 * reads "Show Transactions" with a spinner and waits; offline it reads "Show Transactions"
 * and applies at once (D-545). A custom range from a link opens on Custom range. Clear all
 * clears the draft's fields; closing drops it.
 */
export function FilterSheet({
	filter,
	onApply,
	activeCount,
	locale,
	firstDayOfWeek,
	className,
}: Readonly<FilterSheetProps>) {
	const [isOpen, setOpen] = useState(false);
	const [custom, setCustom] = useState(false);
	const [draft, setDraft] = useState(filter);
	const online = useOnline();
	const [settled] = useDebouncedValue(draft, { wait: DRAFT_COUNT_MS });
	const summary = useQuery({
		...transactionSummaryOptions({
			filter: settled,
			by: PAGE_BREAKDOWNS,
			currency: locale.currency,
		}),
		enabled: isOpen,
	});
	const histogram = useHistogram({
		filter: settled,
		currency: locale.currency,
		enabled: isOpen,
	});

	const set = (next: TransactionFilter) => setDraft(next);
	const preset = presetOfFilter(draft, locale.today);
	const counted = online && settled === draft ? summary.data?.count : undefined;
	// While online, the count is on its way until the draft settles and its summary answers.
	const counting = online && counted === undefined;
	const showLabel =
		counted === undefined ? "Show Transactions"
		: counted === 0 ? FILTER_TEXT.noMatches
		: `Show ${transactionCount(counted)}`;

	const showCustom = custom || preset === "custom";
	const dateOptions = [
		{ value: "all", label: PRESET_LABELS.all },
		...RANGE_PRESETS.map((key) => ({ value: key, label: PRESET_LABELS[key] })),
		{ value: "custom", label: PRESET_LABELS.custom },
	];
	const categories = [...EXPENSE_CATEGORIES, ...INCOME_CATEGORIES];

	return (
		<>
			<Button
				variant="secondary"
				onPress={() => {
					setDraft(filter);
					setCustom(false);
					setOpen(true);
				}}
				className={cn(
					"gap-1.5",
					activeCount > 0 && "border-accent border-[1.5px]",
					className,
				)}
			>
				<SlidersHorizontal
					aria-hidden="true"
					className="size-3.75"
				/>
				{activeCount > 0 ? `Filters (${activeCount})` : "Filters"}
			</Button>
			<Dialog
				title="Filters"
				isOpen={isOpen}
				onOpenChange={setOpen}
				isDismissable
				footer={
					<>
						<Button
							variant="secondary"
							size="lg"
							onPress={() => set(omitFields(draft, ...SHEET_FIELDS))}
							className="flex-1 justify-center"
						>
							Clear all
						</Button>
						<Button
							size="lg"
							isPending={counting}
							onPress={() => {
								onApply(draft);
								setOpen(false);
							}}
							className="flex-[1.6] justify-center"
						>
							{showLabel}
						</Button>
					</>
				}
			>
				<div className="flex flex-col gap-2">
					<p
						aria-hidden="true"
						className="text-label text-ink font-semibold"
					>
						Date
					</p>
					<ToggleChips
						label="Date"
						selectionMode="single"
						options={dateOptions}
						value={[showCustom ? "custom" : preset]}
						onChange={([key]) => {
							// Custom range shows its fields and keeps the draft's dates until a
							// range is chosen.
							setCustom(key === "custom");
							if (key === "custom") return;
							const rest = omitFields(draft, "from", "to");
							set(
								key === "all" ? rest : (
									{
										...rest,
										...presetRange(
											key as RangePreset,
											locale.today,
										),
									}
								),
							);
						}}
					/>
					{showCustom && (
						<CustomRange
							value={
								draft.from === undefined ?
									null
								:	{ start: draft.from, end: draft.to! }
							}
							onChange={({ start, end }) =>
								set({
									...omitFields(draft, "from", "to"),
									from: start,
									to: end,
								})
							}
							today={locale.today}
							firstDayOfWeek={firstDayOfWeek}
							count={counted}
							months={1}
							className="mt-1"
						/>
					)}
				</div>
				<div className="flex flex-col gap-2">
					<p
						aria-hidden="true"
						className="text-label text-ink font-semibold"
					>
						Type
					</p>
					<ToggleChips
						label="Type"
						options={FILTER_TYPES.map((type) => ({
							value: type,
							label: TYPE_LABELS[type],
						}))}
						value={draft.type ?? []}
						onChange={(types) =>
							set(withList(draft, "type", types as TxnType[]))
						}
					/>
				</div>
				<div className="flex flex-col gap-2">
					<p
						aria-hidden="true"
						className="text-label text-ink font-semibold"
					>
						Category
					</p>
					<ToggleChips
						label="Category"
						options={categories.map((category) => ({
							value: category,
							label: categoryLabel(category),
						}))}
						value={draft.cat ?? []}
						onChange={(cats) =>
							set(withList(draft, "cat", cats as CategoryKey[]))
						}
					/>
				</div>
				<AmountBlock
					bounds={draft}
					onChange={({ minMinor, maxMinor }) => {
						set({
							...omitFields(draft, "minMinor", "maxMinor"),
							...(minMinor === undefined ? {} : { minMinor }),
							...(maxMinor === undefined ? {} : { maxMinor }),
						});
					}}
					histogram={histogram.data}
					isLoading={online && histogram.isPending}
					count={counted}
					locale={locale}
				/>
				<div className="flex flex-col gap-2">
					<p
						aria-hidden="true"
						className="text-label text-ink font-semibold"
					>
						Source
					</p>
					<ToggleChips
						label="Source"
						selectionMode="single"
						options={(["any", ...SOURCES] as const).map((source) => ({
							value: source,
							label: SOURCE_LABELS[source],
						}))}
						value={[draft.src ?? "any"]}
						onChange={([key]) => {
							const rest = omitFields(draft, "src");
							set(
								key === "any" ? rest : (
									{ ...rest, src: key as Source }
								),
							);
						}}
					/>
				</div>
			</Dialog>
		</>
	);
}
