"use client";

import { ChevronRight } from "lucide-react";
import { type ReactNode, useState } from "react";
import {
	Button as AriaButton,
	Disclosure as AriaDisclosure,
	DisclosurePanel as AriaDisclosurePanel,
	GridList as AriaGridList,
	GridListHeader as AriaGridListHeader,
	GridListSection as AriaGridListSection,
} from "react-aria-components";

import { Button } from "@/components/actions/Button";
import { GroupHeader } from "@/components/data/GroupHeader";
import { Section } from "@/components/surfaces/Section";
import {
	type ExpenseCategory,
	type StateLabel,
	stateLabel,
} from "@/lib/budgets/model";
import { cn } from "@/lib/cn";
import { formatMoney } from "@/lib/money";
import { useRowArrows } from "../hooks/useRowArrows";
import {
	attentionFigure,
	type Formats,
	groupLabel,
	inactiveText,
	leftFigure,
	LIST_TEXT,
	noLimitCaption,
} from "../lib/labels";
import { PAGE_TEXT } from "../lib/messages";
import { pickedIn, selectedIn } from "../lib/rows";
import type { BudgetMonthAnswer } from "../lib/types";
import { BudgetListItem } from "./BudgetListItem";
import { BudgetsFilter } from "./BudgetsFilter";
import { SideListItem } from "./SideListItem";

export type BudgetListProps = {
	view: BudgetMonthAnswer;
	formats: Formats;
	/** Today's share of the month, in the current month only: each bar's marker. */
	todayShare: number | null;
	/** The state the list is filtered to, or `null` (BR-F04-31). */
	filter: StateLabel | null;
	onFilterChange: (filter: StateLabel | null) => void;
	/** The selected category, or `null` (BR-F04-17). */
	selected: ExpenseCategory | null;
	onSelect: (category: ExpenseCategory | null) => void;
	/** Add a Budget for a Not budgeted category with no Budget record. */
	onAdd: (category: ExpenseCategory) => void;
	/** Change limit for a category with a Budget record. */
	onChangeLimit: (category: ExpenseCategory) => void;
	/** Delete a Not active Budget. */
	onDelete: (category: ExpenseCategory) => void;
	className?: string;
};

/**
 * The month's list (BR-F04-15 to BR-F04-17, BR-F04-31, BR-F04-32), in groups under headers with
 * their figures: Needs attention, On track, Not budgeted, then Not active this month, collapsed
 * until pressed. It is a React Aria grid list, and Not active one more inside a disclosure.
 * - **Selection:** a row selects its category, and selecting it again clears it. A category
 *   under Not budgeted and Not active is selected in both.
 * - **Keys:** Up and Down move the selection through the rows shown, in order, across both
 *   lists, and focus the row; outside the list the page's own Up and Down do the same.
 * - **Filter:** with a state chosen, the chip "Showing Over budget" and Show all sit above the
 *   rows of that state; Not budgeted and Not active hide; with no row, the empty text.
 */
export function BudgetList({
	view,
	formats,
	todayShare,
	filter,
	onFilterChange,
	selected,
	onSelect,
	onAdd,
	onChangeLimit,
	onDelete,
	className,
}: Readonly<BudgetListProps>) {
	const [expanded, setExpanded] = useState(false);
	// The lists' holder as state, so the shortcuts listen on it once it is on the page.
	const [holder, setHolder] = useState<HTMLDivElement | null>(null);
	const money = (minor: number) =>
		formatMoney(minor, formats.currency, formats.numberLocale);

	const rows =
		filter === null ?
			view.budgets
		:	view.budgets.filter((row) => stateLabel(row.utilizationTenths) === filter);
	const attention = rows.filter((row) => row.state !== "ok");
	const onTrack = rows.filter((row) => row.state === "ok");
	const unbudgeted = filter === null ? view.unbudgeted : [];
	const inactive = filter === null ? view.inactive : [];

	const mainIds = [
		...attention.map((row) => `budget:${row.category}`),
		...onTrack.map((row) => `budget:${row.category}`),
		...unbudgeted.map((row) => `unbudgeted:${row.category}`),
	];
	const inactiveIds = inactive.map((row) => `inactive:${row.category}`);
	const shown = [...mainIds, ...(expanded ? inactiveIds : [])];

	useRowArrows({ holder, ids: shown, selected, onSelect });

	const sectionOf = (
		key: string,
		label: string,
		figure: string,
		items: ReactNode,
	) => (
		<AriaGridListSection
			key={key}
			id={`group:${key}`}
			className="flex flex-col"
		>
			<AriaGridListHeader>
				<GroupHeader
					label={label}
					figures={figure}
				/>
			</AriaGridListHeader>
			{items}
		</AriaGridListSection>
	);

	return (
		<Section className={cn("px-5 pt-1 pb-3 max-md:px-4", className)}>
			{filter !== null && (
				<BudgetsFilter
					filter={filter}
					isEmpty={rows.length === 0}
					month={view.month}
					formats={formats}
					onFilterChange={onFilterChange}
				/>
			)}
			<div ref={setHolder}>
				{mainIds.length > 0 && (
					<AriaGridList
						aria-label={LIST_TEXT.label}
						selectionMode="single"
						selectedKeys={selectedIn(mainIds, selected)}
						onSelectionChange={(picked) => onSelect(pickedIn(picked))}
						// Letters are the page's shortcuts (BR-F04-32).
						disallowTypeAhead
						className="flex flex-col outline-none"
					>
						{attention.length > 0
							&& sectionOf(
								"attention",
								groupLabel(LIST_TEXT.attention, attention.length),
								attentionFigure(attention, formats),
								attention.map((row) => (
									<BudgetListItem
										key={row.category}
										row={row}
										formats={formats}
										{...(todayShare === null ?
											{}
										:	{ todayShare })}
									/>
								)),
							)}
						{onTrack.length > 0
							&& sectionOf(
								"track",
								groupLabel(LIST_TEXT.onTrack, onTrack.length),
								leftFigure(onTrack, formats),
								onTrack.map((row) => (
									<BudgetListItem
										key={row.category}
										row={row}
										formats={formats}
										{...(todayShare === null ?
											{}
										:	{ todayShare })}
									/>
								)),
							)}
						{unbudgeted.length > 0
							&& sectionOf(
								"unbudgeted",
								groupLabel(LIST_TEXT.notBudgeted, unbudgeted.length),
								money(view.unbudgetedMinor),
								unbudgeted.map((row) => (
									<SideListItem
										key={row.category}
										id={`unbudgeted:${row.category}`}
										category={row.category}
										caption={noLimitCaption(view.month, formats)}
										amount={money(row.spentMinor)}
										actions={
											<Button
												size="sm"
												variant="ghost"
												onPress={() =>
													row.budgetId === null ?
														onAdd(row.category)
													:	onChangeLimit(row.category)
												}
											>
												{row.budgetId === null ?
													PAGE_TEXT.add
												:	LIST_TEXT.changeLimit}
											</Button>
										}
									/>
								)),
							)}
					</AriaGridList>
				)}
				{inactive.length > 0 && (
					<AriaDisclosure
						isExpanded={expanded}
						onExpandedChange={setExpanded}
					>
						<AriaButton
							slot="trigger"
							className="text-caption text-ink-2 focus-visible:focus-ring rounded-control flex w-full cursor-pointer items-center gap-1.5 pt-4 pb-1.5 text-left font-semibold outline-none max-md:min-h-11"
						>
							<ChevronRight
								aria-hidden="true"
								className={cn(
									"size-3.5 transition-transform duration-(--dur-fast) ease-out",
									expanded && "rotate-90",
								)}
							/>
							{groupLabel(LIST_TEXT.notActive, inactive.length)}
						</AriaButton>
						<AriaDisclosurePanel>
							<AriaGridList
								aria-label={LIST_TEXT.notActive}
								selectionMode="single"
								selectedKeys={selectedIn(inactiveIds, selected)}
								onSelectionChange={(picked) =>
									onSelect(pickedIn(picked))
								}
								disallowTypeAhead
								className="flex flex-col outline-none"
							>
								{inactive.map((row) => (
									<SideListItem
										key={row.category}
										id={`inactive:${row.category}`}
										category={row.category}
										caption={inactiveText(
											row,
											view.month,
											formats,
										)}
										actions={
											<>
												<Button
													size="sm"
													variant="ghost"
													onPress={() =>
														onChangeLimit(row.category)
													}
												>
													{LIST_TEXT.changeLimit}
												</Button>
												<Button
													size="sm"
													variant="ghost"
													onPress={() =>
														onDelete(row.category)
													}
												>
													{LIST_TEXT.delete}
												</Button>
											</>
										}
									/>
								))}
							</AriaGridList>
						</AriaDisclosurePanel>
					</AriaDisclosure>
				)}
			</div>
		</Section>
	);
}
