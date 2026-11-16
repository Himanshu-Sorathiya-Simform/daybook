"use client";

import type { ReactNode } from "react";

import { Drawer } from "@/components/surfaces/Drawer";
import { Section } from "@/components/surfaces/Section";
import type { ExpenseCategory } from "@/lib/budgets/model";
import type { Month } from "@/lib/budgets/months";
import { cn } from "@/lib/cn";
import type { Formats } from "../lib/labels";
import { PANEL_TEXT, subjectOf } from "../lib/panel";
import type { BudgetMonthAnswer } from "../lib/types";
import { BudgetPanelDetail } from "./BudgetPanelDetail";
import { BudgetPanelSummary } from "./BudgetPanelSummary";

export type BudgetPanelProps = {
	/** From 1180 px wide the panel sits beside the list; below, it is a drawer (BR-F04-30). */
	isDocked: boolean;
	/** The month shown. */
	month: Month;
	/** Its view, or undefined while it loads: the panel shows its skeleton lines then. */
	view: BudgetMonthAnswer | undefined;
	/** The selected category, or `null` (BR-F04-17). */
	selected: ExpenseCategory | null;
	formats: Formats;
	/** Clears the selection: Close details, and the drawer's Escape and scrim. */
	onClose: () => void;
	onAdd: (category: ExpenseCategory) => void;
	onChangeLimit: (category: ExpenseCategory) => void;
	onStop: (category: ExpenseCategory) => void;
	onDelete: (category: ExpenseCategory) => void;
	onRemoveMonthLimit: (category: ExpenseCategory, month: Month) => void;
	/** A Remove is on its way. */
	isRemoving?: boolean;
	/** The Undo notice, shown in the detail of the category it is about (BR-F04-29). */
	notice?: ReactNode;
	className?: string;
};

/**
 * The Budgets panel (BR-F04-30, D-249). Docked, it is a sticky column that always shows: the
 * month's summary, or the selected category. Below 1180 px it shows only while a category is
 * selected, as a drawer from the right; Close details, Escape or a press on the scrim clears
 * the selection. While the month loads, each shows its own shape with skeleton lines where
 * the figures go (section 6). The page leaves it out in the error, offline-other-month and
 * new-user states.
 */
export function BudgetPanel({
	isDocked,
	month,
	view,
	selected,
	formats,
	onClose,
	onAdd,
	onChangeLimit,
	onStop,
	onDelete,
	onRemoveMonthLimit,
	isRemoving = false,
	notice,
	className,
}: Readonly<BudgetPanelProps>) {
	const subject = view && selected !== null ? subjectOf(view, selected) : null;
	// A selection the loaded month doesn't show is about to clear; one still loading shows.
	const shown = selected !== null && (view === undefined || subject !== null);
	const detail = (category: ExpenseCategory, docked: boolean) => (
		<BudgetPanelDetail
			category={category}
			subject={subject}
			month={month}
			formats={formats}
			isDocked={docked}
			onClose={onClose}
			onAdd={() => onAdd(category)}
			onChangeLimit={() => onChangeLimit(category)}
			onStop={() => onStop(category)}
			onDelete={() => onDelete(category)}
			onRemoveMonthLimit={(limitMonth) =>
				onRemoveMonthLimit(category, limitMonth)
			}
			isRemoving={isRemoving}
			notice={notice}
		/>
	);

	if (!isDocked) {
		return (
			<Drawer
				label={PANEL_TEXT.label}
				isOpen={shown}
				// It only ever reports closing: a selection is what opens it.
				onOpenChange={onClose}
				className="px-5.5 py-5"
			>
				{shown && detail(selected, false)}
			</Drawer>
		);
	}
	return (
		<aside
			aria-label={PANEL_TEXT.label}
			className={cn("max-dock:hidden sticky top-7", className)}
		>
			<Section
				as="div"
				className="flex min-h-140 flex-col px-5.5 py-5"
			>
				{shown ?
					detail(selected, true)
				:	<BudgetPanelSummary
						month={month}
						view={view}
						formats={formats}
					/>
				}
			</Section>
		</aside>
	);
}
