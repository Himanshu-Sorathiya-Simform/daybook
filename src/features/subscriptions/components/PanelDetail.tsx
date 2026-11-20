"use client";

import { Pause, X } from "lucide-react";
import { useState } from "react";

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
	READY_PANEL,
	readyPanelActions,
	readyStatusActions,
	statusBox,
} from "../lib/panel";
import type { SubscriptionItem } from "../lib/types";
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
	className,
}: Readonly<PanelDetailProps>) {
	const charges = useSubscriptionCharges(item.id);
	const [showAll, setShowAll] = useState(false);
	const failed =
		!charges.data && (charges.isError || charges.fetchStatus === "paused");
	const badges = rowBadges(item, formats);
	const box = statusBox(item, formats);
	const paid = paidSummary(item, formats);
	const footer = readyPanelActions(item, formats);
	const lines = charges.data ? chargeTimeline(item, charges.data, formats) : null;

	const chargesBody = () => {
		if (failed) {
			return (
				<div className="flex flex-wrap items-center gap-x-3 gap-y-1">
					<p
						role="alert"
						className="text-body text-ink-2"
					>
						{PANEL_TEXT.chargesFailed}
					</p>
					<Button
						size="sm"
						variant="row"
						onPress={() => void charges.refetch()}
					>
						{PANEL_TEXT.retry}
					</Button>
				</div>
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
				showAll={showAll}
				onShowAllChange={setShowAll}
				canUndoSkip={READY_PANEL.undoSkip}
				onUndoSkip={() => {}}
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
				onAction={() => {}}
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
			{item.note !== null && (
				<section
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
			)}
			<span className="flex-1" />
			{footer.length > 0 && (
				<div className="flex flex-wrap gap-2">
					{footer.map((entry) => (
						<Button
							key={entry.action}
							variant={entry.variant}
							onPress={() => {}}
						>
							{entry.label}
						</Button>
					))}
				</div>
			)}
			<p className="text-caption text-ink-3">{keysHint()}</p>
		</div>
	);
}
