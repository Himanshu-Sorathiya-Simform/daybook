"use client";

import { useState } from "react";

import { FilterChips } from "@/components/forms/FilterChips";
import { cn } from "@/lib/cn";
import type { WeekStart } from "@/lib/geo";
import type { ListParams, TransactionFilter } from "@/lib/transactions/url";
import { useFacets } from "../hooks/useFacets";
import { useHistogram } from "../hooks/useHistogram";
import { activeChips, type FilterLocale, omitFields } from "../lib/filter-labels";
import { quickRanges } from "../lib/quick-ranges";
import { AmountMenu } from "./AmountMenu";
import { CategoryMenu } from "./CategoryMenu";
import { DateMenu } from "./DateMenu";
import { FilterSheet } from "./FilterSheet";
import { GroupSortMenu } from "./GroupSortMenu";
import { MoreMenu } from "./MoreMenu";
import { SearchBox } from "./SearchBox";
import { TypeMenu } from "./TypeMenu";

export type FilterBarProps = {
	filter: TransactionFilter;
	list: ListParams;
	/** Commits a new filter, keeping the list's grouping and sort. */
	onFilterChange: (filter: TransactionFilter) => void;
	onListChange: (list: ListParams) => void;
	locale: FilterLocale;
	firstDayOfWeek: WeekStart;
	/** The header's count for the committed filter, once loaded. */
	count: number | undefined;
	isOffline: boolean;
	className?: string;
};

/**
 * The filter controls (BR-F03-39, D-523), in screen order: the search box; from 768 px the
 * Date, Type, Category, Amount and More menus, or below it the Filters sheet; the Group · Sort
 * menu; then the active filters as chips with Clear all. Every change commits to the URL at
 * once. The counts load when a control first opens, and the histogram when the Amount control
 * first opens, so a visit that opens neither costs no request (BR-F03-59, BR-F03-60).
 */
export function FilterBar({
	filter,
	list,
	onFilterChange,
	onListChange,
	locale,
	firstDayOfWeek,
	count,
	isOffline,
	className,
}: Readonly<FilterBarProps>) {
	const [countsWanted, setCountsWanted] = useState(false);
	const [histogramWanted, setHistogramWanted] = useState(false);
	const facets = useFacets({
		filter,
		currency: locale.currency,
		enabled: countsWanted,
	});
	const histogram = useHistogram({
		filter,
		currency: locale.currency,
		enabled: histogramWanted,
	});
	const counts = facets.data;
	const quick = histogram.data ? quickRanges(histogram.data) : [];
	const chips = activeChips(filter, locale, quick);

	const wantCounts = (isOpen: boolean) => {
		if (isOpen) setCountsWanted(true);
	};
	const put = <K extends keyof TransactionFilter>(
		key: K,
		value: TransactionFilter[K] | undefined,
	) =>
		onFilterChange(
			value === undefined ?
				omitFields(filter, key)
			:	{ ...filter, [key]: value },
		);

	return (
		<div className={cn("flex flex-col gap-2.5", className)}>
			<div className="flex flex-wrap items-center gap-2">
				<SearchBox
					q={filter.q}
					onCommit={(q) => put("q", q)}
					currency={locale.currency}
					isOffline={isOffline}
					className="w-72 max-md:w-auto max-md:flex-1"
				/>
				<div className="flex flex-wrap items-center gap-2 max-md:hidden">
					<DateMenu
						filter={filter}
						onChange={(dates) =>
							onFilterChange({
								...omitFields(filter, "from", "to"),
								...dates,
							})
						}
						locale={locale}
						firstDayOfWeek={firstDayOfWeek}
						counts={counts?.date}
						count={count}
						onOpenChange={wantCounts}
					/>
					<TypeMenu
						value={filter.type}
						onChange={(type) => put("type", type)}
						counts={counts?.type}
						onOpenChange={wantCounts}
					/>
					<CategoryMenu
						value={filter.cat}
						onChange={(cat) => put("cat", cat)}
						counts={counts?.category}
						onOpenChange={wantCounts}
					/>
					<AmountMenu
						bounds={filter}
						onChange={(bounds) =>
							onFilterChange({
								...omitFields(filter, "minMinor", "maxMinor"),
								...bounds,
							})
						}
						histogram={histogram.data}
						isLoading={
							!isOffline && histogramWanted && histogram.isPending
						}
						count={count}
						locale={locale}
						onOpenChange={(isOpen) => {
							if (isOpen) setHistogramWanted(true);
						}}
					/>
					<MoreMenu
						value={filter.src}
						onChange={(src) => put("src", src)}
						counts={counts?.source}
						onOpenChange={wantCounts}
					/>
				</div>
				<FilterSheet
					filter={filter}
					onApply={onFilterChange}
					activeCount={chips.length}
					locale={locale}
					className="md:hidden"
				/>
				<span className="flex-1 max-md:hidden" />
				<GroupSortMenu
					list={list}
					onChange={onListChange}
				/>
			</div>
			<FilterChips
				label="Active filters"
				chips={chips.map(({ id, label }) => ({ id, label }))}
				onRemove={(id) =>
					onFilterChange(chips.find((chip) => chip.id === id)!.without)
				}
				onClearAll={() => onFilterChange({})}
			/>
		</div>
	);
}
