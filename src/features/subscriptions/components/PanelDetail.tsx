"use client";

import { Pause, X } from "lucide-react";
import { type ReactNode, useState } from "react";

import { Button } from "@/components/actions/Button";
import { IconButton } from "@/components/actions/IconButton";
import { Badge } from "@/components/data/Badge";
import { CategoryTag } from "@/components/data/CategoryTag";
import { Money } from "@/components/data/Money";
import { cn } from "@/lib/cn";
import { useSubscriptionCharges } from "../hooks/useSubscriptionCharges";
import { cadenceWords, type Formats, rowBadges } from "../lib/labels";
import {
	chargeTimeline,
	detailLine,
	expectedLines,
	keysHint,
	PANEL_TEXT,
	paidSummary,
	type PanelActionKey,
	type StatusAction,
	READY_PANEL,
	readyPanelActions,
	readyStatusActions,
	statusBox,
	TIMELINE_PREVIEW,
} from "../lib/panel";
import type { SubscriptionItem } from "../lib/types";
import { ChargesRetry } from "./ChargesRetry";
import { ChargeTimeline } from "./ChargeTimeline";
import { ChargeTimelineSkeleton } from "./ChargeTimelineSkeleton";
import { StatusBox } from "./StatusBox";

export type PanelDetailProps = {
	item: SubscriptionItem;
	formats: Formats & { currency: string };
	/** Close details: clears the selection. */
	onClose: () => void;
	/** View charges: Transactions filtered to this Subscription (BR-F05-23). */
	onViewCharges: () => void;
	/** A footer button, or "Add a note", which opens Edit (BR-F05-40). */
	onAction: (action: PanelActionKey) => void;
	/** A button of the status box: Skip this one, Resume now, Change or Resume. */
	onStatusAction: (action: StatusAction) => void;
	/** Undo skip, on the timeline line of a date that was skipped (BR-F05-27). */
	onUndoSkip: (dueOn: string) => void;
	/** The date the calendar's selection marks in the timeline (BR-F05-38). */
	selectedDue?: string | null;
	/** The notice of a write to this Subscription, under the header (BR-F05-33). */
	notice?: ReactNode;
	className?: string;
};

/**
 * The panel with a Subscription selected (BR-F05-40), top to bottom: "Subscription" with Close
 * details; the name, category and badges; the amount with its cadence and the schedule line;
 * the box for its status; "Charges", its timeline read whole from Transactions (BR-F05-48),
 * with "Paid so far" and View charges; its note; and the hint. The buttons whose dialogs come
 * in later chunks are left out until then (`READY_PANEL`). The charges show skeleton lines
 * while they load, and "Charges could not be loaded." with Retry when they fail, never part of
 * a set.
 */
export function PanelDetail({
	item,
	formats,
	onClose,
	onViewCharges,
	onAction,
	onStatusAction,
	onUndoSkip,
	selectedDue = null,
	notice = null,
	className,
}: Readonly<PanelDetailProps>) {
	const charges = useSubscriptionCharges(item.id);
	const [showAll, setShowAll] = useState(false);
	// A marked date past the first 7 lines opens the rest, until Show fewer is pressed for it.
	const [foldedFor, setFoldedFor] = useState<string | null>(null);
	const failed =
		!charges.data && (charges.isError || charges.fetchStatus === "paused");
	const badges = rowBadges(item, formats);
	const box = statusBox(item, formats);
	const paid = paidSummary(item, formats);
	const footer = readyPanelActions(item, formats);
	const lines =
		charges.data ?
			chargeTimeline(item, charges.data, formats, { selectedDue })
		:	null;
	const markedBeyond =
		lines?.some((line, at) => line.marked && at >= TIMELINE_PREVIEW) ?? false;
	const timelineOpen = showAll || (markedBeyond && foldedFor !== selectedDue);

	const chargesBody = () => {
		if (failed) {
			return (
				<ChargesRetry
					message={PANEL_TEXT.chargesFailed}
					retryLabel={PANEL_TEXT.retry}
					onRetry={() => void charges.refetch()}
				/>
			);
		}
		if (lines === null) {
			const expected = expectedLines(item);
			return (
				<ChargeTimelineSkeleton
					count={expected.count}
					toggle={expected.toggle}
				/>
			);
		}
		if (lines.length === 0) {
			return <p className="text-body text-ink-2">{PANEL_TEXT.noCharges}</p>;
		}
		return (
			<ChargeTimeline
				lines={lines}
				showAll={timelineOpen}
				onShowAllChange={(all) => {
					setShowAll(all);
					setFoldedFor(all ? null : selectedDue);
				}}
				canUndoSkip={READY_PANEL.undoSkip}
				onUndoSkip={onUndoSkip}
			/>
		);
	};

	return (
		<div className={cn("flex min-h-full flex-col gap-4.5", className)}>
			<div className="bg-section sticky -top-5 z-10 -mt-5 flex items-center pt-5">
				<h2 className="text-label text-ink-2 flex-1">{PANEL_TEXT.label}</h2>
				<IconButton
					icon={X}
					label={PANEL_TEXT.close}
					variant="plain"
					size="sm"
					onPress={onClose}
				/>
			</div>
			{notice}
			<div className="flex flex-col gap-1.5">
				<h3 className="text-heading text-ink break-words">{item.name}</h3>
				<div className="flex flex-wrap items-center gap-2">
					<CategoryTag
						category={item.category}
						variant="dot"
					/>
					{badges.map((badge) => (
						<Badge
							key={badge.kind}
							tone="outline"
							{...(badge.kind === "paused" ? { icon: Pause } : {})}
						>
							{badge.text}
						</Badge>
					))}
				</div>
			</div>
			<div className="flex flex-col gap-1">
				<p className="flex flex-wrap items-baseline gap-x-2">
					<Money
						minor={item.amountMinor}
						currency={formats.currency}
						numberLocale={formats.numberLocale}
						variant="readout"
						tone="neutral"
					/>
					<span className="text-body-lg text-ink-2 font-medium">
						{cadenceWords(item.cadence)}
					</span>
				</p>
				<p className="text-caption text-ink-3 figures">
					{detailLine(item, formats)}
				</p>
			</div>
			<StatusBox
				box={box}
				actions={readyStatusActions(box.actions)}
				onAction={onStatusAction}
			/>
			<section
				aria-label={PANEL_TEXT.charges}
				className="flex flex-col gap-2"
			>
				<h3 className="text-body text-ink font-semibold">
					{PANEL_TEXT.charges}
				</h3>
				{chargesBody()}
				{paid !== null && (
					<div className="flex flex-wrap items-center gap-x-3">
						<p className="text-body text-ink figures font-semibold">
							{paid}
						</p>
						<Button
							size="sm"
							variant="row"
							onPress={onViewCharges}
						>
							{PANEL_TEXT.viewCharges}
						</Button>
					</div>
				)}
			</section>
			{item.note === null ?
				READY_PANEL.edit && (
					<Button
						size="sm"
						variant="row"
						className="self-start"
						onPress={() => onAction("edit")}
					>
						{PANEL_TEXT.addNote}
					</Button>
				)
			:	<section
					aria-label={PANEL_TEXT.note}
					className="flex flex-col gap-1"
				>
					<h3 className="text-body text-ink font-semibold">
						{PANEL_TEXT.note}
					</h3>
					<p className="text-body text-ink-2 break-words whitespace-pre-line">
						{item.note}
					</p>
				</section>
			}
			<span className="flex-1" />
			{footer.length > 0 && (
				<div className="flex flex-wrap gap-2">
					{footer.map((entry) => (
						<Button
							key={entry.action}
							variant={entry.variant}
							onPress={() => onAction(entry.action)}
						>
							{entry.label}
						</Button>
					))}
				</div>
			)}
			<p className="text-caption text-ink-3">{keysHint(item, formats)}</p>
		</div>
	);
}
