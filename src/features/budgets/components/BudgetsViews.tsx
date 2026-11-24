"use client";

import { BudgetList, type BudgetListProps } from "./BudgetList";
import { BudgetTable, type BudgetTableProps } from "./BudgetTable";

export type BudgetsViewsProps = {
	/** The view the device remembers: the list or the table. */
	view: "list" | "table";
	/** Whether the window is wide enough for the table, from 768 px (D-512). */
	wide: boolean;
	shown: BudgetListProps["view"];
	formats: BudgetListProps["formats"];
	filter: BudgetListProps["filter"];
	onFilterChange: BudgetListProps["onFilterChange"];
	selected: BudgetListProps["selected"];
	onSelect: BudgetListProps["onSelect"];
	arrows: NonNullable<BudgetListProps["arrows"]>;
	/** The table's sort, held by the page so it outlives the table (D-570). */
	sorting: BudgetTableProps["sorting"];
	onSortingChange: BudgetTableProps["onSortingChange"];
	/** Today's share of the month, in the current month only. */
	todayShare: BudgetListProps["todayShare"];
	onAdd: BudgetListProps["onAdd"];
	onChangeLimit: BudgetListProps["onChangeLimit"];
	onDelete: BudgetListProps["onDelete"];
};

/**
 * The month's Budgets as the list or the table (BR-F04-14, BR-F04-18, D-570): the remembered
 * Table shows only from 768 px, where its switch is, and for a month with a Budget; otherwise
 * the list, which also holds the Not budgeted and Not active rows. A month with none of them
 * shows neither.
 */
export function BudgetsViews({
	view,
	wide,
	shown,
	formats,
	filter,
	onFilterChange,
	selected,
	onSelect,
	arrows,
	sorting,
	onSortingChange,
	todayShare,
	onAdd,
	onChangeLimit,
	onDelete,
}: Readonly<BudgetsViewsProps>) {
	const hasBudgets = shown.budgets.length > 0;
	const hasOthers = shown.unbudgeted.length > 0 || shown.inactive.length > 0;
	if (hasBudgets && wide && view === "table") {
		return (
			<BudgetTable
				view={shown}
				formats={formats}
				filter={filter}
				onFilterChange={onFilterChange}
				sorting={sorting}
				onSortingChange={onSortingChange}
				selected={selected}
				onSelect={onSelect}
				arrows={arrows}
			/>
		);
	}
	if (!hasBudgets && !hasOthers) return null;
	return (
		<BudgetList
			view={shown}
			formats={formats}
			todayShare={todayShare}
			filter={filter}
			onFilterChange={onFilterChange}
			selected={selected}
			onSelect={onSelect}
			arrows={arrows}
			onAdd={onAdd}
			onChangeLimit={onChangeLimit}
			onDelete={onDelete}
		/>
	);
}
