"use client";

import { X } from "lucide-react";

import { Button } from "@/components/actions/Button";
import { IconButton } from "@/components/actions/IconButton";
import { Drawer } from "@/components/surfaces/Drawer";
import { DockedPanel } from "@/components/surfaces/DockedPanel";
import type { CategoryKey } from "@/lib/categories";
import type { LabelLocale } from "../lib/labels";
import { PANEL_TEXT, type PanelSelection } from "../lib/panel";
import type { SummaryAnswer, TransactionAnswer } from "../lib/types";
import { PanelDetail } from "./PanelDetail";
import { PanelDetailSkeleton } from "./PanelDetailSkeleton";
import { PanelSummary } from "./PanelSummary";

export type TransactionPanelProps = {
	/** From 1180 px wide the panel sits beside the list; below, it is a drawer (BR-F03-70). */
	isDocked: boolean;
	/** The selected row, or null with none selected. */
	selection: PanelSelection | null;
	summary: SummaryAnswer | undefined;
	isSummaryPending: boolean;
	locale: LabelLocale;
	isOnline: boolean;
	/** Clears the selection: Close, and the drawer's Escape and scrim. */
	onClose: () => void;
	onEdit: (row: TransactionAnswer) => void;
	onDuplicate: (row: TransactionAnswer) => void;
	onDelete: (row: TransactionAnswer, byKeyboard: boolean) => void;
	/** The categories the committed filter holds, and a press on one of the summary's bars:
	 * it toggles that category in the filter (D-623). */
	activeCategories?: readonly CategoryKey[];
	onCategory?: (category: CategoryKey) => void;
	className?: string;
};

/**
 * The Transactions panel (BR-F03-70 to BR-F03-72, D-520). Docked, it is a sticky column that
 * always shows: the summary of the filter, or the selected row. Below 1180 px it shows only
 * while a row is selected, as a drawer from the right; Close, Escape or a press on the scrim
 * clears the selection.
 */
export function TransactionPanel({
	isDocked,
	selection,
	summary,
	isSummaryPending,
	locale,
	isOnline,
	onClose,
	onEdit,
	onDuplicate,
	onDelete,
	activeCategories,
	onCategory,
	className,
}: Readonly<TransactionPanelProps>) {
	// The heading and Close of the selected row, kept while it loads or fails (BR-F03-72).
	const header = (
		<div className="bg-section sticky -top-5 z-10 -mt-5 flex items-center pt-5">
			<h2 className="text-label text-ink-2 flex-1">{PANEL_TEXT.heading}</h2>
			<IconButton
				icon={X}
				label={PANEL_TEXT.close}
				variant="plain"
				size="sm"
				onPress={onClose}
			/>
		</div>
	);
	const detail = (() => {
		if (selection === null) return null;
		if (selection.state === "loading") {
			return (
				<div className="flex min-h-full flex-col gap-4">
					{header}
					<PanelDetailSkeleton />
				</div>
			);
		}
		if (selection.state === "failed") {
			return (
				<div className="flex flex-col gap-4">
					{header}
					<div className="flex flex-col items-start gap-3">
						<p className="text-body text-ink">{PANEL_TEXT.failed}</p>
						<Button
							variant="secondary"
							size="sm"
							onPress={selection.onRetry}
						>
							Retry
						</Button>
					</div>
				</div>
			);
		}
		return (
			<PanelDetail
				row={selection.row}
				locale={locale}
				isOnline={isOnline}
				onClose={onClose}
				onEdit={() => onEdit(selection.row)}
				onDuplicate={() => onDuplicate(selection.row)}
				onDelete={(byKeyboard) => onDelete(selection.row, byKeyboard)}
			/>
		);
	})();

	if (!isDocked) {
		return (
			<Drawer
				label={PANEL_TEXT.label}
				isOpen={selection !== null}
				onOpenChange={(open) => {
					if (!open) onClose();
				}}
				className="px-5.5 py-5"
			>
				{detail}
			</Drawer>
		);
	}
	return (
		<DockedPanel
			label={PANEL_TEXT.label}
			{...(className === undefined ? {} : { className })}
		>
			{detail ?? (
				<PanelSummary
					summary={summary}
					isPending={isSummaryPending}
					locale={locale}
					{...(activeCategories === undefined ? {} : { activeCategories })}
					{...(onCategory === undefined ? {} : { onCategory })}
				/>
			)}
		</DockedPanel>
	);
}
