"use client";

import { X } from "lucide-react";

import { Button } from "@/components/actions/Button";
import { IconButton } from "@/components/actions/IconButton";
import { Avatar } from "@/components/data/Avatar";
import { Money } from "@/components/data/Money";
import { Skeleton } from "@/components/feedback/Skeleton";
import { cn } from "@/lib/cn";
import { isGoalType } from "@/lib/transactions/model";
import { usePayeeHistory } from "../hooks/usePayeeHistory";
import { type LabelLocale, signedMinor } from "../lib/labels";
import {
	DETAIL_HINT,
	detailRows,
	detailTitle,
	historyLine,
	historyTitle,
	PANEL_TEXT,
} from "../lib/panel";
import { HISTORY_MONTHS } from "../lib/queries";
import type { TransactionAnswer } from "../lib/types";

export type PanelDetailProps = {
	row: TransactionAnswer;
	locale: LabelLocale;
	/** Whether there is a connection: offline, the payee history is left out (BR-F03-72). */
	isOnline: boolean;
	/** Clears the selection: Close ("Close details"). */
	onClose: () => void;
	onEdit: () => void;
	onDuplicate: () => void;
	/** Deletes it with Undo (BR-F03-26); `byKeyboard` when Delete was pressed with a key, so focus
	 * can move on to the next row. */
	onDelete: (byKeyboard: boolean) => void;
	className?: string;
};

/**
 * The panel with a row selected (BR-F03-72): "Transaction" and Close; the avatar, title and
 * description; the signed amount; Type, Category, Date, Source and Note; the payee's last 3
 * months; then Edit, Duplicate and Delete with their keys. The history box is left out for a Goal row,
 * with no rows, offline, or when its request fails. A Goal row has no actions until M2 brings
 * its fields (D-241).
 */
export function PanelDetail({
	row,
	locale,
	isOnline,
	onClose,
	onEdit,
	onDuplicate,
	onDelete,
	className,
}: Readonly<PanelDetailProps>) {
	const goal = isGoalType(row.type);
	const history = usePayeeHistory(goal ? null : row.payee);
	const line =
		isOnline && history.data ?
			historyLine(history.data, row.type, locale)
		:	null;
	const title = detailTitle(row);
	// The box's place is held while the history loads, so nothing jumps when it arrives.
	const loadingHistory =
		isOnline && history.isPending && history.fetchStatus === "fetching";
	return (
		<div className={cn("flex min-h-full flex-col gap-4", className)}>
			<div className="flex items-center">
				<h2 className="text-label text-ink-2 flex-1">
					{PANEL_TEXT.heading}
				</h2>
				<IconButton
					icon={X}
					label={PANEL_TEXT.close}
					variant="plain"
					size="sm"
					onPress={onClose}
				/>
			</div>
			<div className="flex items-center gap-3">
				<Avatar
					size="lg"
					goal={goal}
					{...(row.payee === null ? {} : { payee: row.payee })}
					{...(row.category === null ? {} : { category: row.category })}
				/>
				<div className="min-w-0">
					<p className="text-heading text-ink break-words">{title}</p>
					{row.description && (
						<p className="text-caption text-ink-2 break-words">
							{row.description}
						</p>
					)}
				</div>
			</div>
			<Money
				minor={signedMinor(row)}
				currency={locale.currency}
				numberLocale={locale.numberLocale}
				variant="readout"
				tone="signed"
				sign="always"
			/>
			<dl className="border-line grid grid-cols-[6rem_minmax(0,1fr)] border-t">
				{detailRows(row, locale).map(({ term, value }) => (
					<div
						key={term}
						className="contents"
					>
						<dt className="border-line text-label text-ink-2 border-b py-2.5">
							{term}
						</dt>
						<dd className="border-line text-body text-ink border-b py-2.5 font-medium break-words whitespace-pre-line">
							{value}
						</dd>
					</div>
				))}
			</dl>
			{loadingHistory && row.payee !== null && (
				<div
					role="status"
					aria-busy="true"
					aria-label={`Loading ${historyTitle(row.payee, HISTORY_MONTHS)}`}
					className="bg-soft rounded-control flex flex-col gap-1.5 px-3.5 py-3"
				>
					<Skeleton className="h-4 w-1/2" />
					<Skeleton className="h-3.5 w-3/4" />
				</div>
			)}
			{line && row.payee !== null && (
				<section
					aria-label={historyTitle(row.payee, HISTORY_MONTHS)}
					className="bg-soft rounded-control px-3.5 py-3"
				>
					<h3 className="text-body text-ink font-semibold">
						{historyTitle(row.payee, HISTORY_MONTHS)}
					</h3>
					<p className="text-caption text-ink-2 mt-0.5">{line}</p>
				</section>
			)}
			<span className="flex-1" />
			{!goal && (
				<>
					<div className="flex items-center gap-2">
						<Button
							onPress={onEdit}
							className="flex-1 justify-center"
						>
							Edit
						</Button>
						<Button
							variant="secondary"
							onPress={onDuplicate}
						>
							Duplicate
						</Button>
						<Button
							variant="danger"
							onPress={(event) =>
								onDelete(event.pointerType === "keyboard")
							}
						>
							Delete
						</Button>
					</div>
					<p className="text-caption text-ink-3">{DETAIL_HINT}</p>
				</>
			)}
		</div>
	);
}
