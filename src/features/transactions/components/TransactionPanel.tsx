"use client";

import { Button } from "@/components/actions/Button";
import { Skeleton } from "@/components/feedback/Skeleton";
import { Drawer } from "@/components/surfaces/Drawer";
import { Section } from "@/components/surfaces/Section";
import { cn } from "@/lib/cn";
import type { LabelLocale } from "../lib/labels";
import { PANEL_TEXT, type PanelSelection } from "../lib/panel";
import type { SummaryAnswer, TransactionAnswer } from "../lib/types";
import { PanelDetail } from "./PanelDetail";
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
	className?: string;
};

/** The skeleton lines while a selected row loads alone (BR-F03-70). */
function LoadingLines() {
	return (
		<div
			role="status"
			aria-busy="true"
			aria-label="Loading the Transaction"
			className="flex flex-col gap-3"
		>
			<Skeleton className="h-3.5 w-30" />
			<Skeleton className="h-5.5 w-45" />
			{[0, 1, 2, 3].map((each) => (
				<Skeleton
					key={each}
					className="h-2.5 w-full"
				/>
			))}
		</div>
	);
}

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
	className,
}: Readonly<TransactionPanelProps>) {
	const detail = (() => {
		if (selection === null) return null;
		if (selection.state === "loading") return <LoadingLines />;
		if (selection.state === "failed") {
			return (
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
		<aside
			aria-label={PANEL_TEXT.label}
			className={cn("max-dock:hidden sticky top-7", className)}
		>
			<Section
				as="div"
				className="flex min-h-140 flex-col px-5.5 py-5"
			>
				{detail ?? (
					<PanelSummary
						summary={summary}
						isPending={isSummaryPending}
						locale={locale}
					/>
				)}
			</Section>
		</aside>
	);
}
