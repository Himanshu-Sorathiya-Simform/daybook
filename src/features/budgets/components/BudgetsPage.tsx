"use client";

import { useState } from "react";

import { Banner } from "@/components/feedback/Banner";
import { EmptyState } from "@/components/feedback/EmptyState";
import { Section } from "@/components/surfaces/Section";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { useOnline } from "@/hooks/useOnline";
import { useShortcut } from "@/hooks/useShortcut";
import type { ExpenseCategory, StateLabel } from "@/lib/budgets/model";
import { type Month, monthOf } from "@/lib/budgets/months";
import { cn } from "@/lib/cn";
import { formatMonth, formatTime } from "@/lib/date-format";
import { useBudgetMonth } from "../hooks/useBudgetMonth";
import { useBudgetsUrl } from "../hooks/useBudgetsUrl";
import { useBudgetsView } from "../hooks/useBudgetsView";
import { dayOfMonth } from "../lib/labels";
import { emptyTitle, offlineAction, offlineBody, PAGE_TEXT } from "../lib/messages";
import { subjectOf } from "../lib/panel";
import type { BudgetMonthAnswer, BudgetsLocale } from "../lib/types";
import { BudgetList } from "./BudgetList";
import { BudgetPanel } from "./BudgetPanel";
import { BudgetsHeader } from "./BudgetsHeader";
import { BudgetsOverview } from "./BudgetsOverview";
import { BudgetsSkeleton } from "./BudgetsSkeleton";
import { BudgetTable } from "./BudgetTable";

export type BudgetsPageProps = {
	/** The profile's formats and its today, from the server render (TIME-5). */
	locale: BudgetsLocale;
	/** Opens Add a Budget, for a category when one is given. */
	onAdd?: (category?: ExpenseCategory) => void;
	/** Opens Change limit for a category with a Budget record. */
	onChangeLimit?: (category: ExpenseCategory) => void;
	/** Opens Stop budgeting for a category's Budget. */
	onStop?: (category: ExpenseCategory) => void;
	/** Opens Delete for a category's Budget. */
	onDelete?: (category: ExpenseCategory) => void;
	/** Removes a one-month limit from a category's Budget (BR-F04-25). */
	onRemoveMonthLimit?: (category: ExpenseCategory, month: Month) => void;
	className?: string;
};

const nothing = () => {};

/** From here up, List or Table shows in the header (BR-F04-14, D-512). */
const WIDE = "(min-width: 48rem)";

/** From here up the panel docks beside the list (BR-F04-30); the `dock` breakpoint. */
const DOCKED = "(min-width: 1180px)";

/** Whether `category` shows anywhere in the month: as a Budget, Not budgeted or Not active. */
function shows(view: BudgetMonthAnswer, category: ExpenseCategory): boolean {
	return [view.budgets, view.unbudgeted, view.inactive].some((group) =>
		group.some((row) => row.category === category),
	);
}

/**
 * The Budgets page (F04 section 6), from top to bottom: the header (BR-F04-14), the
 * invalid-link notice (FIL-5), then the month: the overview (BR-F04-15) and the list, or the
 * empty message, with Not budgeted and Not active still listed under it. A new user, with
 * neither, sees only the message. Offline, only the current month shows, with "as of"
 * (section 10); another month says it isn't saved on this device. With nothing to show and no
 * connection, or a failed load, the error state offers Retry. Everything follows the URL's
 * `month` (BR-F04-14).
 * - **The filter** (BR-F04-31) belongs to the month it was chosen in: any change of month,
 *   Back included, clears it.
 * - **The selection** (BR-F04-17, D-249) stays across months while its category shows in the
 *   new one, and clears otherwise. Escape clears it (BR-F04-32).
 * - **The view** (BR-F04-14, BR-F04-18, D-570): the remembered Table shows only from 768 px,
 *   where its switch is, and for a month with a Budget; otherwise the list.
 * - **The panel** (BR-F04-30): beside the list from 1180 px, where Up and Down select; below,
 *   a drawer while a category is selected, where they only move focus, and nothing while the
 *   drawer is open (D-571). It is left out in the error, offline-other-month and new-user
 *   states. L opens Change limit for a selection with a Budget record (BR-F04-32).
 */
export function BudgetsPage({
	locale,
	onAdd = nothing,
	onChangeLimit = nothing,
	onStop = nothing,
	onDelete = nothing,
	onRemoveMonthLimit = nothing,
	className,
}: Readonly<BudgetsPageProps>) {
	const current = monthOf(locale.today);
	const url = useBudgetsUrl(current);
	const online = useOnline();
	const [view, setView] = useBudgetsView();
	const wide = useMediaQuery(WIDE, false);
	// The server can't know the width: it renders the docked panel, which CSS hides below 1180 px.
	const docked = useMediaQuery(DOCKED, true);
	const query = useBudgetMonth(url.month);
	const [filterIn, setFilterIn] = useState<{
		month: Month;
		state: StateLabel;
	} | null>(null);
	const [selected, setSelected] = useState<ExpenseCategory | null>(null);
	const { dateLocale } = locale;
	const data = query.data;

	// A change of month, Back included, drops the filter for good (BR-F04-31), React's pattern
	// for state that follows what was read.
	if (filterIn !== null && filterIn.month !== url.month) setFilterIn(null);
	const filter = filterIn?.month === url.month ? filterIn.state : null;
	const setFilter = (state: StateLabel | null) =>
		setFilterIn(state === null ? null : { month: url.month, state });

	// A selection the new month does not show clears, React's pattern for state that follows
	// what was read.
	if (data && selected !== null && !shows(data, selected)) setSelected(null);

	useShortcut("Escape", () => setSelected(null), {
		enabled: selected !== null,
		// Escape in a text field, a menu, the month grid or a dialog belongs to them.
		ignoreInputs: true,
		ignoreDefaultPrevented: true,
	});

	const offOther = !online && url.month !== current;
	const failed = !data && (query.isError || query.fetchStatus === "paused");
	const isNewUser =
		data !== undefined
		&& [data.budgets, data.unbudgeted, data.inactive].every(
			(group) => group.length === 0,
		);
	const showPanel = !offOther && !failed && !isNewUser;
	const drawerOpen = showPanel && !docked && selected !== null;
	const arrows =
		docked ? "select"
		: drawerOpen ? "off"
		: "focus";
	const record =
		!offOther && data && selected !== null ?
			(subjectOf(data, selected)?.record ?? null)
		:	null;
	// It is on only while the selection has a record.
	useShortcut("L", () => onChangeLimit(selected as ExpenseCategory), {
		enabled: record !== null,
	});
	const asOf =
		!online && query.dataUpdatedAt > 0 ?
			`as of ${formatTime(new Date(query.dataUpdatedAt), locale)}`
		:	null;

	const month = (shown: BudgetMonthAnswer) => {
		const hasBudgets = shown.budgets.length > 0;
		const hasOthers = shown.unbudgeted.length > 0 || shown.inactive.length > 0;
		const isCurrent = shown.month === current;
		return (
			<>
				{hasBudgets ?
					<BudgetsOverview
						view={shown}
						formats={locale}
						today={isCurrent ? locale.today : null}
						filter={filter}
						onFilterChange={setFilter}
					/>
				:	<Section>
						<EmptyState
							title={emptyTitle(
								formatMonth(shown.month, { dateLocale }),
							)}
							body={PAGE_TEXT.emptyBody}
							action={PAGE_TEXT.add}
							onAction={() => onAdd()}
						/>
					</Section>
				}
				{hasBudgets && wide && view === "table" ?
					<BudgetTable
						view={shown}
						formats={locale}
						filter={filter}
						onFilterChange={setFilter}
						selected={selected}
						onSelect={setSelected}
						arrows={arrows}
					/>
				:	(hasBudgets || hasOthers) && (
						<BudgetList
							view={shown}
							formats={locale}
							todayShare={
								isCurrent ? dayOfMonth(locale.today).share : null
							}
							filter={filter}
							onFilterChange={setFilter}
							selected={selected}
							onSelect={setSelected}
							arrows={arrows}
							onAdd={onAdd}
							onChangeLimit={onChangeLimit}
							onDelete={onDelete}
						/>
					)
				}
			</>
		);
	};

	const body = () => {
		if (offOther) {
			return (
				<Section>
					<EmptyState
						title={PAGE_TEXT.offlineTitle}
						body={offlineBody(formatMonth(current, { dateLocale }))}
						action={offlineAction(
							formatMonth(current, { dateLocale }, "name"),
						)}
						onAction={() => url.setMonth(current)}
					/>
				</Section>
			);
		}
		if (data) return month(data);
		if (failed) {
			return (
				<Section>
					<EmptyState
						title={PAGE_TEXT.loadFailed}
						body={PAGE_TEXT.loadFailedBody}
						action={PAGE_TEXT.retry}
						onAction={() => void query.refetch()}
					/>
				</Section>
			);
		}
		return <BudgetsSkeleton />;
	};

	return (
		<div
			className={cn(
				showPanel
					&& "dock:grid dock:grid-cols-[minmax(0,1fr)_minmax(20rem,25rem)] dock:items-start gap-5",
				"px-8 py-7 max-md:px-4 max-md:py-5",
				className,
			)}
		>
			<div className="flex min-w-0 flex-col gap-4">
				<BudgetsHeader
					month={url.month}
					current={current}
					dateLocale={dateLocale}
					numberLocale={locale.numberLocale}
					asOf={asOf}
					onMonthChange={url.setMonth}
					view={view}
					onViewChange={setView}
					onAdd={() => onAdd()}
				/>
				{url.notice && (
					<Banner
						kind="info"
						action={PAGE_TEXT.dismiss}
						className="rounded-section border"
						onAction={url.dismissNotice}
					>
						{PAGE_TEXT.invalidLink}
					</Banner>
				)}
				{body()}
			</div>
			{showPanel && (
				<BudgetPanel
					isDocked={docked}
					month={url.month}
					view={data}
					selected={selected}
					formats={locale}
					onClose={() => setSelected(null)}
					onAdd={onAdd}
					onChangeLimit={onChangeLimit}
					onStop={onStop}
					onDelete={onDelete}
					onRemoveMonthLimit={onRemoveMonthLimit}
				/>
			)}
		</div>
	);
}
