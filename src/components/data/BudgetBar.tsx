import { cn } from "@/lib/cn";

export type BudgetBarProps = {
	/** Spent against the limit in tenths of a percent (BR-F04-08): 1244 is 124.4%. A negative
	 * value, refunds above expenses, draws an empty bar. */
	utilizationTenths: number;
	/** How far through the month today is, from 0 to 1, in the current month only. It draws a
	 * marker at that share of the limit, so spending ahead of it is ahead of pace. */
	todayShare?: number;
	/** 8px for a Budget row, 12px for the overview. */
	size?: "md" | "lg";
	className?: string;
};

/** Where the limit sits on the track: room past it for spending up to 160% (BR-F04-16). */
const LIMIT_AT = 62.5;
/** Past 160% the overflow stops; the figure beside the bar still gives the real amount. */
const CAP_TENTHS = 1600;

const sizes = { md: "h-2", lg: "h-3" };

/** A share of the limit, in tenths, as a share of the track's width. */
const widthOf = (tenths: number) => `${(tenths / 1000) * LIMIT_AT}%`;

const clamp = (value: number, low: number, high: number) =>
	Math.min(Math.max(value, low), high);

/**
 * A Budget's bar (BR-F04-16): the fill up to the limit, the part over it in the over colour up
 * to 160%, a tick at the limit, and in the current month a marker at today. It carries no
 * words, so it is hidden from screen readers: the figures and the state beside it say the same
 * in text, never by colour alone. Drawn in CSS, not ECharts (D-249).
 */
export function BudgetBar({
	utilizationTenths,
	todayShare,
	size = "md",
	className,
}: Readonly<BudgetBarProps>) {
	const filled = clamp(utilizationTenths, 0, 1000);
	const over = clamp(utilizationTenths, 1000, CAP_TENTHS) - 1000;
	return (
		<div
			aria-hidden="true"
			className={cn(
				"bg-track relative w-full rounded-full",
				sizes[size],
				className,
			)}
		>
			{filled > 0 && (
				<div
					data-part="fill"
					className={cn(
						"bg-bar absolute inset-y-0 left-0 rounded-full",
						over > 0 && "rounded-r-none",
					)}
					style={{ width: widthOf(filled) }}
				/>
			)}
			{over > 0 && (
				<div
					data-part="over"
					className="bg-neg absolute inset-y-0 rounded-r-full"
					style={{ left: `${LIMIT_AT}%`, width: widthOf(over) }}
				/>
			)}
			<div
				data-part="limit"
				className="bg-ink absolute -inset-y-1 -ml-px w-0.5 rounded-full"
				style={{ left: `${LIMIT_AT}%` }}
			/>
			{todayShare !== undefined && (
				<div
					data-part="today"
					className="bg-accent absolute -inset-y-1 -ml-px w-0.5 rounded-full"
					style={{ left: widthOf(clamp(todayShare, 0, 1) * 1000) }}
				/>
			)}
		</div>
	);
}
