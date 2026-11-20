"use client";

import {
	type Column,
	createColumnHelper,
	createSortedRowModel,
	type Row,
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
import { Money } from "@/components/data/Money";
import { Section } from "@/components/surfaces/Section";
import {
	type ExpenseCategory,
	STATE_LABELS,
	type StateLabel,
	stateLabel,
} from "@/lib/budgets/model";
import { categoryLabel } from "@/lib/categories";
import { cn } from "@/lib/cn";
import { compareCodeUnits } from "@/lib/compare";
import { formatMoney } from "@/lib/money";
import { type RowArrows, useRowArrows } from "@/hooks/useRowArrows";
import {
	type Formats,
	percentOf,
	STATE_TONES,
	TABLE_TEXT,
	tableCaption,
} from "../lib/labels";
import { categoryOf, pickedIn, selectedIn } from "../lib/rows";
import type { BudgetMonthAnswer } from "../lib/types";
import { BudgetsFilter } from "./BudgetsFilter";

export type BudgetTableProps = {
	/** The month's view, with at least one Budget. */
	view: BudgetMonthAnswer;
	formats: Formats;
	/** The state the rows are filtered to, or `null` (BR-F04-31). */
	filter: StateLabel | null;
	onFilterChange: (filter: StateLabel | null) => void;
	/** The sort, held by the page so it outlives the table while a month loads (D-570). */
	sorting: SortingState;
	onSortingChange: Dispatch<SetStateAction<SortingState>>;
	/** The selected category, or `null` (BR-F04-17). */
	selected: ExpenseCategory | null;
	onSelect: (category: ExpenseCategory | null) => void;
	/** What Up and Down do: select beside the docked panel, else only move focus, and nothing
	 * while the drawer is open (BR-F04-32, D-571). */
	arrows?: RowArrows;
	className?: string;
};

type BudgetRow = BudgetMonthAnswer["budgets"][number];
type TableRow = Row<typeof features, BudgetRow>;

const features = tableFeatures({
	rowSortingFeature,
	sortedRowModel: createSortedRowModel(),
});
const helper = createColumnHelper<typeof features, BudgetRow>();

/** State's ascending order: the worst first, as the list puts it (BR-F04-15). */
const STATE_RANK = { over: 0, at: 1, warning: 2, ok: 3 } as const satisfies Record<
	StateLabel,
	number
>;

const byNumber = (a: TableRow, b: TableRow, id: string) =>
	a.getValue<number>(id) - b.getValue<number>(id);

/** BR-F04-18's columns: Category and State sort ascending first, the figures descending
 * first. Ties keep the month's own order, the list's (BR-F04-15). */
const columns = helper.columns([
	helper.accessor((row) => categoryLabel(row.category), {
		id: "category",
		header: TABLE_TEXT.category,
		sortDescFirst: false,
		sortFn: (a, b, id) =>
			compareCodeUnits(a.getValue<string>(id), b.getValue<string>(id)),
	}),
	helper.accessor("limitMinor", {
		header: TABLE_TEXT.limit,
		sortDescFirst: true,
		sortFn: byNumber,
	}),
	helper.accessor("spentMinor", {
		header: TABLE_TEXT.spent,
		sortDescFirst: true,
		sortFn: byNumber,
	}),
	helper.accessor("remainingMinor", {
		header: TABLE_TEXT.remaining,
		sortDescFirst: true,
		sortFn: byNumber,
	}),
	helper.accessor("utilizationTenths", {
		header: TABLE_TEXT.utilization,
		sortDescFirst: true,
		sortFn: byNumber,
	}),
	helper.accessor((row) => STATE_RANK[stateLabel(row.utilizationTenths)], {
		id: "state",
		header: TABLE_TEXT.state,
		sortDescFirst: false,
		sortFn: byNumber,
	}),
]);

/** The figures' columns, aligned right. */
const FIGURES = new Set([
	"limitMinor",
	"spentMinor",
	"remainingMinor",
	"utilizationTenths",
]);

/** A focus ring inside its own box, rounded, so the table's scroll box never clips it. The
 * base style's ring outside the box is turned off. */
const RING_INSIDE =
	"outline-none focus-visible:rounded-control focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-solid focus-visible:outline-focus";

/** A focused row's ring, drawn on its cells: top and bottom on each, and the ends on the
 * first and last, which round the row's corners. */
const ROW_RING = [
	"group-focus-visible:shadow-[inset_0_2px_var(--color-focus),inset_0_-2px_var(--color-focus)]",
	"group-focus-visible:first:shadow-[inset_2px_0_var(--color-focus),inset_0_2px_var(--color-focus),inset_0_-2px_var(--color-focus)]",
	"group-focus-visible:last:shadow-[inset_-2px_0_var(--color-focus),inset_0_2px_var(--color-focus),inset_0_-2px_var(--color-focus)]",
];

const cellClass = (id: string) =>
	cn(
		"px-2.5 py-2.75 whitespace-nowrap",
		RING_INSIDE,
		ROW_RING,
		FIGURES.has(id) && "text-right",
	);

/** A selectable row's cell: the row's hover and selection colour, with rounded ends like a
 * list row. */
const rowCellClass = (id: string) =>
	cn(
		cellClass(id),
		"first:rounded-l-control last:rounded-r-control group-hover:bg-soft group-selected:bg-accent-soft transition-colors duration-(--dur-fast) ease-out",
	);

const TOTAL = "total";

const totalClass = (id: string) => cn(cellClass(id), "border-line-strong border-t");

/** Each heading shows it sorts: an up-down mark, or the arrow of its direction. */
const SORT_ICONS = {
	none: ChevronsUpDown,
	ascending: ArrowUp,
	descending: ArrowDown,
} as const;

/**
 * The month as a table (BR-F04-18, D-171, D-570), the accessible alternative to the bars: a React
 * Aria table whose rows TanStack Table sorts.
 * - **Rows:** each Budget in the month's order until a heading is pressed; then "Budgeted
 *   total" with the overall figures and state; then each Not budgeted category, with "—" for
 *   what it lacks. Sorting reorders the Budgets only; the total and Not budgeted rows stay
 *   below them.
 * - **Sorting:** pressing a heading sorts by it, Category and State ascending first, the
 *   figures descending first; pressing it again reverses, and a third time brings back the
 *   month's order. Each heading shows it sorts; `aria-sort` says how.
 * - **Selection:** a row selects its category like a list row, and again clears it; the total
 *   row selects nothing. Up and Down move the selection through the rows shown (BR-F04-32).
 * - **Filter** (BR-F04-31): only the Budgets in that state, the total kept, Not budgeted
 *   hidden; with none, the empty text in place of the table.
 */
export function BudgetTable({
	view,
	formats,
	filter,
	onFilterChange,
	sorting,
	onSortingChange,
	selected,
	onSelect,
	arrows = "select",
	className,
}: Readonly<BudgetTableProps>) {
	const captionId = useId();
	// The rows' holder as state, so the shortcuts listen on it once it is on the page.
	const [holder, setHolder] = useState<HTMLDivElement | null>(null);
	const money = (minor: number) =>
		formatMoney(minor, formats.currency, formats.numberLocale);

	const budgets =
		filter === null ?
			view.budgets
		:	view.budgets.filter((row) => stateLabel(row.utilizationTenths) === filter);
	const unbudgeted = filter === null ? view.unbudgeted : [];
	// A third press on a heading removes its sort: the month's order is back.
	const table = useTable({
		features,
		columns,
		data: budgets,
		getRowId: (row) => row.category,
		state: { sorting },
		onSortingChange,
		enableMultiSort: false,
	});
	const rows = table.getRowModel().rows;
	const [sorted] = sorting;

	const ids = [
		...rows.map((row) => `budget:${row.id}`),
		...unbudgeted.map((row) => `unbudgeted:${row.category}`),
	];
	useRowArrows({
		holder,
		ids,
		selected,
		onSelect,
		mode: arrows,
		selectionOf: categoryOf,
	});

	const overall = {
		limitMinor: view.overall.limitMinor,
		spentMinor: view.overall.spentMinor,
		// The table shows only for a month with a Budget, which always has a utilization.
		utilizationTenths: view.overall.utilizationTenths as number,
	};
	const overallState = stateLabel(overall.utilizationTenths);

	const budgetCell = (id: string, row: BudgetRow): ReactNode => {
		const label = stateLabel(row.utilizationTenths);
		switch (id) {
			case "category":
				return (
					<CategoryTag
						category={row.category}
						// Block-level, so it centres in the cell like the figures beside it.
						className="flex"
					/>
				);
			case "limitMinor":
				return money(row.limitMinor);
			case "spentMinor":
				return money(row.spentMinor);
			case "remainingMinor":
				return (
					<Money
						minor={row.remainingMinor}
						currency={formats.currency}
						numberLocale={formats.numberLocale}
					/>
				);
			case "utilizationTenths":
				return percentOf(row.utilizationTenths, formats);
			default:
				return (
					<span className={cn("font-semibold", STATE_TONES[label])}>
						{STATE_LABELS[label]}
					</span>
				);
		}
	};

	const rowClass = "group cursor-pointer outline-none";

	return (
		<Section className={cn("px-5 pt-1 pb-3.5 max-md:px-4", className)}>
			{filter !== null && (
				<BudgetsFilter
					filter={filter}
					isEmpty={budgets.length === 0}
					month={view.month}
					formats={formats}
					onFilterChange={onFilterChange}
				/>
			)}
			{budgets.length > 0 && (
				<div
					ref={setHolder}
					className="-mx-2.5 overflow-x-auto pt-3"
				>
					<p
						id={captionId}
						className="text-caption text-ink-3 px-2.5 pb-2.5"
					>
						{tableCaption(view.month, formats)}
					</p>
					<AriaTable
						aria-labelledby={captionId}
						selectionMode="single"
						selectedKeys={selectedIn(ids, selected)}
						onSelectionChange={(picked) => onSelect(pickedIn(picked))}
						disabledKeys={[TOTAL]}
						disabledBehavior="selection"
						{...(sorted === undefined ?
							{}
						:	{
								sortDescriptor: {
									column: sorted.id,
									direction:
										sorted.desc ? "descending" : "ascending",
								},
							})}
						onSortChange={({ column }) =>
							// Every heading is one of the table's own columns.
							(
								table.getColumn(String(column)) as Column<
									typeof features,
									BudgetRow,
									unknown
								>
							).toggleSorting()
						}
						// Separate borders, so cells can round their corners.
						className="text-body figures w-full min-w-160 border-separate border-spacing-0"
					>
						<AriaTableHeader>
							{table.getFlatHeaders().map((header) => (
								<AriaColumn
									key={header.id}
									id={header.column.id}
									allowsSorting
									isRowHeader={header.column.id === "category"}
									className={({ sortDirection }) =>
										cn(
											"border-line-strong text-label cursor-pointer border-b px-2.5 py-2 font-semibold whitespace-nowrap",
											RING_INSIDE,
											FIGURES.has(header.column.id) ?
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
												<table.FlexRender header={header} />
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
									id={`budget:${row.id}`}
									className={rowClass}
								>
									{row.getAllCells().map((cell) => (
										<AriaCell
											key={cell.id}
											className={cn(
												rowCellClass(cell.column.id),
												cell.column.id === "category"
													&& "font-semibold",
											)}
										>
											{budgetCell(
												cell.column.id,
												row.original,
											)}
										</AriaCell>
									))}
								</AriaRow>
							))}
							<AriaRow
								id={TOTAL}
								className="group font-bold outline-none"
							>
								<AriaCell className={totalClass("category")}>
									{TABLE_TEXT.total}
								</AriaCell>
								<AriaCell className={totalClass("limitMinor")}>
									{money(overall.limitMinor)}
								</AriaCell>
								<AriaCell className={totalClass("spentMinor")}>
									{money(overall.spentMinor)}
								</AriaCell>
								<AriaCell className={totalClass("remainingMinor")}>
									<Money
										minor={
											overall.limitMinor - overall.spentMinor
										}
										currency={formats.currency}
										numberLocale={formats.numberLocale}
									/>
								</AriaCell>
								<AriaCell
									className={totalClass("utilizationTenths")}
								>
									{percentOf(overall.utilizationTenths, formats)}
								</AriaCell>
								<AriaCell
									className={cn(
										totalClass("state"),
										STATE_TONES[overallState],
									)}
								>
									{STATE_LABELS[overallState]}
								</AriaCell>
							</AriaRow>
							{unbudgeted.map((row) => (
								<AriaRow
									key={row.category}
									id={`unbudgeted:${row.category}`}
									className={cn(rowClass, "text-ink-2")}
								>
									<AriaCell className={rowCellClass("category")}>
										<CategoryTag
											category={row.category}
											// Block-level, so it centres in the cell like the figures beside it.
											className="flex"
										/>
									</AriaCell>
									<AriaCell className={rowCellClass("limitMinor")}>
										{TABLE_TEXT.none}
									</AriaCell>
									<AriaCell className={rowCellClass("spentMinor")}>
										{money(row.spentMinor)}
									</AriaCell>
									<AriaCell
										className={rowCellClass("remainingMinor")}
									>
										{TABLE_TEXT.none}
									</AriaCell>
									<AriaCell
										className={rowCellClass("utilizationTenths")}
									>
										{TABLE_TEXT.none}
									</AriaCell>
									<AriaCell className={rowCellClass("state")}>
										{TABLE_TEXT.notBudgeted}
									</AriaCell>
								</AriaRow>
							))}
						</AriaTableBody>
					</AriaTable>
				</div>
			)}
		</Section>
	);
}
