"use client";

import { useRef, useState } from "react";

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

type Control = "date" | "type" | "category" | "amount" | "more";

export type FilterBarProps = {
	filter: TransactionFilter;
	list: ListParams;
	/** Commits a new filter, keeping the list's grouping and sort, as a new history entry or
	 * in place of the current one. */
	onFilterChange: (filter: TransactionFilter, mode: "push" | "replace") => void;
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
 * once. A visit to a menu, or typing in the search box until it loses focus, is one history
 * entry: its first change adds one and the later ones replace it, so Back returns to before
 * the visit; a chip, Clear all and the sheet's Show each add their own (D-547). The counts load only while a control that shows them is open, and the histogram only
 * while the Amount control is, each kept fresh for 30 seconds, so closed controls never follow
 * the filter and a visit that opens neither costs no request (BR-F03-59, BR-F03-60, D-523).
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
	const [open, setOpen] = useState<Control | null>(null);
	const countsOn = open !== null && open !== "amount";
	const facets = useFacets({
		filter,
		currency: locale.currency,
		enabled: countsOn,
	});
	const histogram = useHistogram({
		filter,
		currency: locale.currency,
		enabled: open === "amount",
	});
	const countsPending = countsOn && !isOffline && facets.isPending;
	const counts = facets.data;
	const quick = histogram.data ? quickRanges(histogram.data) : [];
	const chips = activeChips(filter, locale, quick);

	/** Follows which control is open, for what to load. A close that arrives after another
	 * control opened leaves that one open; React Aria closes first, but nothing promises it. */
	const opened = (control: Control, isOpen: boolean) => {
		if (isOpen) startVisit();
		setOpen((current) => {
			if (isOpen) return control;
			return current === control ? null : current;
		});
	};

	// Whether the visit under way, a menu opened or the search box focused, has added its
	// history entry yet (D-547). Every change below comes from inside a visit.
	const pushed = useRef(false);
	const startVisit = () => {
		pushed.current = false;
	};
	/** A change from a control: the visit's first adds a history entry, the rest replace it. */
	const change = (next: TransactionFilter) => {
		onFilterChange(next, pushed.current ? "replace" : "push");
		pushed.current = true;
	};
	const put = <K extends keyof TransactionFilter>(
		key: K,
		value: TransactionFilter[K] | undefined,
	) =>
		change(
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
					onFocusChange={(isFocused) => {
						if (isFocused) startVisit();
					}}
					className="w-72 max-md:w-auto max-md:flex-1"
				/>
				<div className="flex flex-wrap items-center gap-2 max-md:hidden">
					<DateMenu
						filter={filter}
						onChange={(dates) =>
							change({
								...omitFields(filter, "from", "to"),
								...dates,
							})
						}
						locale={locale}
						firstDayOfWeek={firstDayOfWeek}
						counts={counts?.date}
						countsPending={countsPending}
						count={count}
						onOpenChange={(isOpen) => opened("date", isOpen)}
					/>
					<TypeMenu
						value={filter.type}
						onChange={(type) => put("type", type)}
						counts={counts?.type}
						countsPending={countsPending}
						onOpenChange={(isOpen) => opened("type", isOpen)}
					/>
					<CategoryMenu
						value={filter.cat}
						onChange={(cat) => put("cat", cat)}
						counts={counts?.category}
						countsPending={countsPending}
						onOpenChange={(isOpen) => opened("category", isOpen)}
					/>
					<AmountMenu
						bounds={filter}
						onChange={(bounds) =>
							change({
								...omitFields(filter, "minMinor", "maxMinor"),
								...bounds,
							})
						}
						histogram={histogram.data}
						isLoading={
							!isOffline && open === "amount" && histogram.isPending
						}
						count={count}
						locale={locale}
						onOpenChange={(isOpen) => opened("amount", isOpen)}
					/>
					<MoreMenu
						value={filter.src}
						onChange={(src) => put("src", src)}
						counts={counts?.source}
						countsPending={countsPending}
						onOpenChange={(isOpen) => opened("more", isOpen)}
					/>
				</div>
				<FilterSheet
					filter={filter}
					onApply={(next) => onFilterChange(next, "push")}
					activeCount={chips.length}
					locale={locale}
					firstDayOfWeek={firstDayOfWeek}
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
					onFilterChange(
						chips.find((chip) => chip.id === id)!.without,
						"push",
					)
				}
				onClearAll={() => onFilterChange({}, "push")}
			/>
		</div>
	);
}
