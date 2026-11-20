"use client";

import { X } from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "@/components/actions/Button";
import { IconButton } from "@/components/actions/IconButton";
import { CategoryTag } from "@/components/data/CategoryTag";
import { Money } from "@/components/data/Money";
import { Skeleton } from "@/components/feedback/Skeleton";
import { type ExpenseCategory, STATE_LABELS, stateLabel } from "@/lib/budgets/model";
import type { Month } from "@/lib/budgets/months";
import { cn } from "@/lib/cn";
import { useBudgetHistory } from "../hooks/useBudgetHistory";
import { useBudgetPayees } from "../hooks/useBudgetPayees";
import {
	type Formats,
	headline,
	inactiveText,
	percentOf,
	sourceText,
	STATE_TONES,
} from "../lib/labels";
import {
	detailHint,
	limitsIn,
	ofLimit,
	PANEL_TEXT,
	type PanelSubject,
	spentNoLimit,
	SUBJECT_LABELS,
} from "../lib/panel";
import { LastSixMonths } from "./LastSixMonths";
import { LineSkeleton } from "@/components/feedback/LineSkeleton";
import { LimitHistory } from "./LimitHistory";
import { WhereItWent } from "./WhereItWent";

export type BudgetPanelDetailProps = {
	category: ExpenseCategory;
	/** The selected category as the month shows it, or null while the month loads. */
	subject: PanelSubject | null;
	month: Month;
	formats: Formats;
	/** Docked beside the list, or in the drawer: the hint differs (D-571). */
	isDocked: boolean;
	/** Clears the selection: Close details. */
	onClose: () => void;
	/** Add a Budget, for a Not budgeted category with no Budget record. */
	onAdd: () => void;
	onChangeLimit: () => void;
	onStop: () => void;
	onDelete: () => void;
	/** Remove on a one-month limit in the limit history (BR-F04-25). */
	onRemoveMonthLimit: (month: Month) => void;
	/** A Remove is on its way: its buttons rest. */
	isRemoving?: boolean;
	/** The Undo notice for this category, under its figures (BR-F04-29). */
	notice?: ReactNode;
	className?: string;
};

/**
 * The panel with a category selected (BR-F04-30), top to bottom: its label (Budget, Not
 * budgeted or Not active this month) with Close details, and the category; the figures, or the
 * spent with no limit, or the Not active caption; Last 6 months; for a Budget record, its limit
 * history; Where it went, when the month has spending; then the actions and their keys. Last 6
 * months and Where it went show skeletons while they load and are left out when there is
 * nothing to show from their read (D-571). While the month loads, the category and the two
 * sections show, with skeleton lines for the rest (section 6).
 */
export function BudgetPanelDetail({
	category,
	subject,
	month,
	formats,
	isDocked,
	onClose,
	onAdd,
	onChangeLimit,
	onStop,
	onDelete,
	onRemoveMonthLimit,
	isRemoving = false,
	notice,
	className,
}: Readonly<BudgetPanelDetailProps>) {
	const history = useBudgetHistory(category, month);
	const payees = useBudgetPayees(category, month, formats.currency);
	const fetching = (query: { isPending: boolean; fetchStatus: string }) =>
		query.isPending && query.fetchStatus === "fetching";

	// Where it went shows only with spending: unknown until the month loads.
	const spends =
		subject === null
		|| (subject.kind !== "inactive" && subject.row.spentMinor !== 0);

	const figures = () => {
		if (subject === null) {
			return (
				<>
					<LineSkeleton
						size="figure"
						width="w-60"
					/>
					<LineSkeleton
						size="body"
						width="w-64"
					/>
					<LineSkeleton
						size="caption"
						width="w-40"
					/>
				</>
			);
		}
		if (subject.kind === "budget") {
			const { row } = subject;
			const label = stateLabel(row.utilizationTenths);
			return (
				<>
					<p className="flex flex-wrap items-baseline gap-x-2">
						<Money
							minor={row.spentMinor}
							currency={formats.currency}
							numberLocale={formats.numberLocale}
							tone="neutral"
							className="text-figure"
						/>
						<span className="text-body-lg text-ink-2 figures font-medium">
							{ofLimit(row.limitMinor, formats)}
						</span>
					</p>
					<p className="text-body figures font-medium">
						{percentOf(row.utilizationTenths, formats)} ·{" "}
						<span className={cn("font-semibold", STATE_TONES[label])}>
							{headline(row.remainingMinor, formats)} ·{" "}
							{STATE_LABELS[label]}
						</span>
					</p>
					<p className="text-caption text-ink-3 figures">
						{sourceText(row.source, row.next, formats)}
					</p>
				</>
			);
		}
		return (
			<p className="text-body text-ink-2 figures font-medium">
				{subject.kind === "unbudgeted" ?
					spentNoLimit(subject.row.spentMinor, month, formats)
				:	inactiveText(subject.row, month, formats)}
			</p>
		);
	};

	const actions = () => {
		if (subject === null) {
			return <Skeleton className="rounded-control h-9.5 max-md:h-11" />;
		}
		if (subject.kind === "budget") {
			return (
				<>
					<Button
						onPress={onChangeLimit}
						className="flex-1 justify-center"
					>
						{PANEL_TEXT.changeLimit}
					</Button>
					<Button
						variant="secondary"
						onPress={onStop}
					>
						{PANEL_TEXT.stop}
					</Button>
					<Button
						variant="danger"
						onPress={onDelete}
					>
						{PANEL_TEXT.delete}
					</Button>
				</>
			);
		}
		if (subject.kind === "unbudgeted") {
			return subject.record === null ?
					<Button
						onPress={onAdd}
						className="flex-1 justify-center"
					>
						{PANEL_TEXT.addBudget}
					</Button>
				:	<Button
						onPress={onChangeLimit}
						className="flex-1 justify-center"
					>
						{PANEL_TEXT.changeLimit}
					</Button>;
		}
		return (
			<>
				<Button
					onPress={onChangeLimit}
					className="flex-1 justify-center"
				>
					{PANEL_TEXT.changeLimit}
				</Button>
				<Button
					variant="danger"
					onPress={onDelete}
				>
					{PANEL_TEXT.delete}
				</Button>
			</>
		);
	};

	return (
		<div
			aria-busy={subject === null}
			className={cn("flex min-h-full flex-col gap-4.5", className)}
		>
			<div className="bg-section sticky -top-5 z-10 -mt-5 flex items-center pt-5">
				{subject ?
					<h2 className="text-label text-ink-2 flex-1">
						{SUBJECT_LABELS[subject.kind]}
					</h2>
				:	<LineSkeleton
						size="label"
						width="w-16"
						className="flex-1"
					/>
				}
				<IconButton
					icon={X}
					label={PANEL_TEXT.close}
					variant="plain"
					size="sm"
					onPress={onClose}
				/>
			</div>
			<div className="flex flex-col gap-1.5">
				<CategoryTag
					category={category}
					className="text-heading text-ink flex"
				/>
				{figures()}
			</div>
			{notice}
			{(history.data || fetching(history)) && (
				<LastSixMonths
					months={history.data?.months}
					month={month}
					expectsLimits={
						subject?.record ? limitsIn(subject.record, month) : false
					}
					formats={formats}
				/>
			)}
			{subject?.record && (
				<LimitHistory
					rules={subject.record}
					month={month}
					formats={formats}
					onRemove={onRemoveMonthLimit}
					isRemoving={isRemoving}
				/>
			)}
			{(payees.data ?
				payees.data.payees.length > 0
			:	fetching(payees) && spends) && (
				<WhereItWent
					category={category}
					month={month}
					payees={payees.data}
					formats={formats}
				/>
			)}
			<span className="flex-1" />
			<div className="flex flex-wrap gap-2">{actions()}</div>
			{subject ?
				<p className="text-caption text-ink-3">
					{detailHint(subject, isDocked)}
				</p>
			:	<LineSkeleton
					size="caption"
					width="w-56"
				/>
			}
		</div>
	);
}
