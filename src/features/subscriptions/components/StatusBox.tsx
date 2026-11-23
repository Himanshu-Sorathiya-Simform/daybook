"use client";

import { Button } from "@/components/actions/Button";
import { cn } from "@/lib/cn";
import type { StatusAction, StatusBox as StatusBoxData } from "../lib/panel";

export type StatusBoxProps = {
	box: StatusBoxData;
	/** The box's buttons that exist so far; the others are left out. */
	actions: readonly StatusAction[];
	onAction: (action: StatusAction) => void;
	className?: string;
};

const LABELS: Record<StatusAction, string> = {
	skip: "Skip this one",
	resumeNow: "Resume now",
	change: "Change",
	resume: "Resume",
};

/** The box under the amount (BR-F05-40): what the Subscription is doing, with its date in bold,
 * and the buttons its status offers. */
export function StatusBox({
	box,
	actions,
	onAction,
	className,
}: Readonly<StatusBoxProps>) {
	return (
		<div
			className={cn(
				"border-line-strong rounded-control text-body flex flex-wrap items-center gap-x-3 gap-y-2 border px-3 py-2.5",
				className,
			)}
		>
			<p className="min-w-40 flex-1">
				{box.segments.map((part) =>
					part.strong ?
						<strong key={part.text}>{part.text}</strong>
					:	<span key={part.text}>{part.text}</span>,
				)}
			</p>
			{actions.map((action) => (
				<Button
					key={action}
					size="sm"
					variant="row"
					onPress={() => onAction(action)}
				>
					{LABELS[action]}
				</Button>
			))}
		</div>
	);
}
