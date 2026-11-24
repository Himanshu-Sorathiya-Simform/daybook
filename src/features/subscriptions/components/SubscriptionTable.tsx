"use client";

import {
	type Column,
	createColumnHelper,
	rowSortingFeature,
	type SortingState,
	tableFeatures,
	useTable,
} from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";
import {
	type Dispatch,
	type ReactNode,
	type SetStateAction,
	useId,
	useState,
} from "react";
import {
	Cell as AriaCell,
	Column as AriaColumn,
	Row as AriaRow,
	Table as AriaTable,
	TableBody as AriaTableBody,
	TableHeader as AriaTableHeader,
} from "react-aria-components";

import { CategoryTag } from "@/components/data/CategoryTag";
import { RING_INSIDE, ROW_RING } from "@/components/data/tableRings";
import { Section } from "@/components/surfaces/Section";
import { type RowArrows, useRowArrows } from "@/hooks/useRowArrows";
import { cn } from "@/lib/cn";
import type { ExpenseCategory } from "@/lib/subscriptions/model";
import type { Formats } from "../lib/labels";
import { pickedId, selectedIn } from "../lib/selection";
import {
	DEFAULT_SORT,
	DEFAULT_SORTING,
	sortTableRows,
	TABLE_CAPTION,
	TABLE_COLUMNS,
	TABLE_EMPTY,
	type TableColumn,
	type TableRow,
	tableRows,
	tableTotal,
} from "../lib/table";
import type { SubscriptionList } from "../lib/types";
import { CategoryFilterRow } from "./CategoryFilterRow";

export type SubscriptionTableProps = {
	/** The Subscriptions to show and the list's totals: the rows that are not ended, and the
	 * Total row, which stays the list's whatever the filter (D-627). */
	list: Pick<SubscriptionList, "items" | "totals">;
	formats: Formats;
	/** The sort, held by the page so it outlives the table while the view changes (D-570). */
	sorting: SortingState;
	onSortingChange: Dispatch<SetStateAction<SortingState>>;
	/** The selected Subscription's id, or `null`. */
	selected: string | null;
	onSelect: (id: string | null) => void;
	/** What Up and Down do: select beside the docked panel, else only move focus, and nothing
	 * while the drawer is open (BR-F05-45, D-571). */
	arrows?: RowArrows;
	/** The category the rows are narrowed to, and how to clear it (BR-F05-50). */
	category?: ExpenseCategory | null;
	onClearCategory?: () => void;
	className?: string;
};

const features = tableFeatures({ rowSortingFeature });
const helper = createColumnHelper<typeof features, TableRow>();

const column = (id: TableColumn) => TABLE_COLUMNS.find((each) => each.id === id)!;

/** A column of BR-F05-39: its label and first direction come from `TABLE_COLUMNS`, so the
 * table and the sort rules cannot drift. The rows arrive sorted (`sortTableRows`), so the
 * library only keeps the sort and its headings. */
const header = (id: TableColumn) => ({
	header: column(id).label,
	sortDescFirst: column(id).firstDirection === "desc",
});

const columns = helper.columns([
	helper.accessor((row) => row.name, { id: "name", ...header("name") }),
	helper.accessor((row) => row.categoryLabel, {
		id: "category",
		...header("category"),
	}),
	helper.accessor((row) => row.amountMinor, { id: "price", ...header("price") }),
	helper.accessor((row) => row.monthlyMinor, {
		id: "perMonth",
		...header("perMonth"),
	}),
	helper.accessor((row) => row.shareTenths, { id: "share", ...header("share") }),
	helper.accessor((row) => row.yearlyMinor, {
		id: "perYear",
		...header("perYear"),
	}),
	helper.accessor((row) => row.nextDueOn, {
		id: "nextDue",
		...header("nextDue"),
	}),
	helper.accessor((row) => row.status, { id: "status", ...header("status") }),
]);

/** The sort direction of the table's sorted column, or the default's when none is sorted. */
function directionOf(sorted: SortingState[number] | undefined) {
	if (sorted === undefined) return DEFAULT_SORT.direction;
	return sorted.desc ? "desc" : "asc";
}

/** The sorted column as React Aria's table takes it, or nothing when none is sorted. */
function descriptorOf(sorted: SortingState[number] | undefined) {
	if (sorted === undefined) return {};
	return {
		sortDescriptor: {
			column: sorted.id,
			direction:
				sorted.desc ? ("descending" as const) : ("ascending" as const),
		},
	};
}

/** The figures' columns, aligned right. */
const FIGURES = new Set<string>(
	TABLE_COLUMNS.filter((each) => each.numeric).map((each) => each.id),
);

const TOTAL = "total";

const cellClass = (id: string) =>
	cn(
		"px-2.5 py-2.75 whitespace-nowrap",
		RING_INSIDE,
		ROW_RING,
		FIGURES.has(id) && "text-right",
	);

/** A selectable row's cell: the row's hover and selection colour, with rounded ends like a list
 * row. */
const rowCellClass = (id: string) =>
	cn(
		cellClass(id),
		"first:rounded-l-control last:rounded-r-control group-hover:bg-soft group-selected:bg-accent-soft transition-colors duration-(--dur-fast) ease-out",
	);

const totalClass = (id: string) => cn(cellClass(id), "border-line-strong border-t");

/** Each heading shows it sorts: an up-down mark, or the arrow of its direction. */
const SORT_ICONS = {
	none: ChevronsUpDown,
	ascending: ArrowUp,
	descending: ArrowDown,
} as const;

/**
 * The Subscriptions as a table (BR-F05-39, D-171, D-570), from 768 px: a React Aria table whose
 * headings TanStack Table keeps the sort of.
 * - **Rows:** every Subscription that is not ended, sorted by Per month, largest first, until a
 *   heading is pressed; then "Total · 4" with the monthly and yearly totals of the
 *   Subscriptions that count (BR-F05-17). One with no next due date shows "—" for its share and
 *   next due date and sorts last in either direction.
 * - **Sorting:** a heading sorts by it, text columns and Next due ascending first, figures
 *   descending first; pressing it again reverses, and a third time brings back the default,
 *   Per month, largest first. `aria-sort` says how, and each heading shows an arrow.
 * - **Selection:** a row selects its Subscription like a list row, and again clears it; the
 *   Total row selects nothing. Up and Down move the selection through the rows in the sort
 *   shown (BR-F05-45).
 * - **Filter** (BR-F05-50, D-627): a category narrows the rows, with "Showing" and its chip
 *   above; the Total row and the shares stay those of every Subscription.
 * - With no Subscription that is not ended the table gives way to a line saying so (D-628).
 */
export function SubscriptionTable({
	list,
	formats,
	sorting,
	onSortingChange,
	selected,
	onSelect,
	arrows = "select",
	category = null,
	onClearCategory,
	className,
}: Readonly<SubscriptionTableProps>) {
	const captionId = useId();
	// The rows' holder as state, so the shortcuts listen on it once it is on the page.
	const [holder, setHolder] = useState<HTMLDivElement | null>(null);
	const [sorted] = sorting;
	const data = sortTableRows(tableRows(list, formats), {
		column: (sorted?.id ?? DEFAULT_SORT.column) as TableColumn,
		direction: directionOf(sorted),
	});
	const table = useTable({
		features,
		columns,
		data,
		getRowId: (row) => row.id,
		state: { sorting },
		// A third press on a heading takes its sort away, and the table goes back to the default
		// one, Per month, largest first, as Budgets' goes back to the month's order.
		onSortingChange: (updater) =>
			onSortingChange((previous) => {
				const next =
					typeof updater === "function" ? updater(previous) : updater;
				return next.length === 0 ? DEFAULT_SORTING : next;
			}),
		// No sorted row model: the rows are sorted above, by the rules of BR-F05-39, and the
		// library only keeps the sort and its headings.
		enableMultiSort: false,
	});
	const rows = table.getRowModel().rows;
	const ids = rows.map((row) => row.id);
	useRowArrows({ holder, ids, selected, onSelect, mode: arrows });
	const total = tableTotal(list.totals, formats);

	const cell = (id: string, row: TableRow): ReactNode => {
		switch (id) {
			case "name":
				return row.name;
			case "category":
				return (
					<CategoryTag
						category={row.item.category}
						// Block-level, so it centres in the cell like the figures beside it.
						className="flex"
					/>
				);
			case "price":
				return row.price;
			case "perMonth":
				return row.perMonth;
			case "share":
				return (
					<span className="inline-flex items-center gap-2">
						{row.shareTenths !== null && (
							<span
								aria-hidden="true"
								className="bg-track flex h-1.5 w-14 overflow-hidden rounded-full"
							>
								<span
									className="bg-bar"
									style={{ width: `${row.shareTenths / 10}%` }}
								/>
							</span>
						)}
						{row.share}
					</span>
				);
			case "perYear":
				return row.perYear;
			case "nextDue":
				return row.nextDue;
			default:
				return row.status;
		}
	};

	return (
		<Section className={cn("px-5 pt-1 pb-3.5 max-md:px-4", className)}>
			{category !== null && (
				<CategoryFilterRow
					category={category}
					onClear={() => onClearCategory?.()}
				/>
			)}
			{rows.length === 0 ?
				<p className="text-body text-ink-2 pt-4 pb-1">{TABLE_EMPTY}</p>
			:	<div
					ref={setHolder}
					className="-mx-2.5 overflow-x-auto pt-3"
				>
					<p
						id={captionId}
						className="text-caption text-ink-3 px-2.5 pb-2.5"
					>
						{TABLE_CAPTION}
					</p>
					<AriaTable
						aria-labelledby={captionId}
						selectionMode="single"
						selectedKeys={selectedIn(ids, selected)}
						onSelectionChange={(picked) => onSelect(pickedId(picked))}
						disabledKeys={[TOTAL]}
						disabledBehavior="selection"
						{...descriptorOf(sorted)}
						onSortChange={({ column: pressed }) =>
							// Every heading is one of the table's own columns.
							(
								table.getColumn(String(pressed)) as Column<
									typeof features,
									TableRow,
									unknown
								>
							).toggleSorting()
						}
						// Separate borders, so cells can round their corners.
						className="text-body figures w-full min-w-215 border-separate border-spacing-0"
					>
						<AriaTableHeader>
							{table.getFlatHeaders().map((head) => (
								<AriaColumn
									key={head.id}
									id={head.column.id}
									allowsSorting
									isRowHeader={head.column.id === "name"}
									className={({ sortDirection }) =>
										cn(
											"border-line-strong text-label cursor-pointer border-b px-2.5 py-2 font-semibold whitespace-nowrap",
											RING_INSIDE,
											FIGURES.has(head.column.id) ?
												"text-right"
											:	"text-left",
											sortDirection ? "text-accent" : (
												"text-ink-2 hover:text-ink"
											),
										)
									}
								>
									{({ sortDirection }) => {
										const Icon =
											SORT_ICONS[sortDirection ?? "none"];
										return (
											<span className="inline-flex items-center gap-1">
												<table.FlexRender header={head} />
												<Icon
													aria-hidden="true"
													data-sort-icon={
														sortDirection ?? "none"
													}
													className={cn(
														"size-3.5 shrink-0",
														!sortDirection
															&& "text-ink-3",
													)}
												/>
											</span>
										);
									}}
								</AriaColumn>
							))}
						</AriaTableHeader>
						<AriaTableBody>
							{rows.map((row) => (
								<AriaRow
									key={row.id}
									id={row.id}
									className="group cursor-pointer outline-none"
								>
									{row.getAllCells().map((each) => (
										<AriaCell
											key={each.id}
											className={cn(
												rowCellClass(each.column.id),
												each.column.id === "name"
													&& "font-semibold",
											)}
										>
											{cell(each.column.id, row.original)}
										</AriaCell>
									))}
								</AriaRow>
							))}
							<AriaRow
								id={TOTAL}
								className="group font-bold outline-none"
							>
								<AriaCell className={totalClass("name")}>
									{total.label}
								</AriaCell>
								<AriaCell className={totalClass("category")} />
								<AriaCell className={totalClass("price")} />
								<AriaCell className={totalClass("perMonth")}>
									{total.perMonth}
								</AriaCell>
								<AriaCell className={totalClass("share")} />
								<AriaCell className={totalClass("perYear")}>
									{total.perYear}
								</AriaCell>
								<AriaCell className={totalClass("nextDue")} />
								<AriaCell className={totalClass("status")} />
							</AriaRow>
						</AriaTableBody>
					</AriaTable>
				</div>
			}
		</Section>
	);
}
