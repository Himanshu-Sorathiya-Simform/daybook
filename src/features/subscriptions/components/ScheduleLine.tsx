import { cn } from "@/lib/cn";
import type { ScheduleSummary } from "../lib/dialog";

export type ScheduleLineProps = {
	summary: ScheduleSummary;
	className?: string;
};

/**
 * The schedule line (BR-F05-24): how the Subscription repeats, with what it costs a year once
 * the amount is valid, and under it when the next charges fall: "Every month on the 5th ·
 * ₹7,788.00 a year", "Next charges: Thu, 5 Nov, …." For a start that has not come, "Starts …".
 */
export function ScheduleLine({ summary, className }: Readonly<ScheduleLineProps>) {
	return (
		<div
			className={cn(
				"rounded-control bg-soft text-body figures px-3.5 py-2.5",
				className,
			)}
		>
			<p className="text-ink font-semibold">{summary.repeats}</p>
			{summary.next !== null && <p className="text-ink-2">{summary.next}</p>}
		</div>
	);
}
