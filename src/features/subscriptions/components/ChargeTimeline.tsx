"use client";

import { Button } from "@/components/actions/Button";
import { cn } from "@/lib/cn";
import { shownLines, type TimelineLine, timelineToggle } from "../lib/panel";

export type ChargeTimelineProps = {
	lines: readonly TimelineLine[];
	/** Whether every line shows, or the first 7. */
	showAll: boolean;
	onShowAllChange: (all: boolean) => void;
	/** Whether a future skipped date offers Undo skip (it needs the Undo notices). */
	canUndoSkip: boolean;
	onUndoSkip: (dueOn: string) => void;
	className?: string;
};

/**
 * The Subscription's charges, newest at the top (BR-F05-40): each line has its date with the
 * year, its amount ("Skipped" or "Paused" in place of one, struck through) and a caption, 7
 * lines and then "Show all 9" or "Show fewer". The line's kind is in its words, not only in
 * its style.
 */
export function ChargeTimeline({
	lines,
	showAll,
	onShowAllChange,
	canUndoSkip,
	onUndoSkip,
	className,
}: Readonly<ChargeTimelineProps>) {
	const toggle = timelineToggle(lines.length, showAll);
	return (
		<div className={cn("flex flex-col", className)}>
			<ol className="border-line border-t">
				{shownLines(lines, showAll).map((line) => (
					<li
						key={line.key}
						className={cn(
							"border-line grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 border-b py-2.5",
							line.marked && "bg-accent-soft -mx-2 rounded-lg px-2",
						)}
					>
						<span className="text-label text-ink figures font-medium">
							{line.dateText}
						</span>
						<span
							className={cn(
								"text-label figures text-right font-semibold",
								line.struck ? "text-ink-3 line-through" : "text-ink",
							)}
						>
							{line.amount}
						</span>
						<span className="text-caption text-ink-3 col-span-full">
							{line.caption}
							{line.undoSkip && canUndoSkip && (
								<>
									{" "}
									<Button
										size="sm"
										variant="row"
										onPress={() => onUndoSkip(line.date)}
									>
										Undo skip
									</Button>
								</>
							)}
						</span>
					</li>
				))}
			</ol>
			{toggle !== null && (
				<Button
					size="sm"
					variant="row"
					className="self-start"
					onPress={() => onShowAllChange(!showAll)}
				>
					{toggle}
				</Button>
			)}
		</div>
	);
}
