import { cn } from "@/lib/cn";

/** How strongly each of the 35 days is tinted, in percent. A fixed sample, never user data. */
const TINTS = [
	8, 22, 0, 45, 22, 70, 0, 22, 0, 45, 100, 22, 8, 22, 45, 22, 8, 70, 45, 0, 22, 0,
	45, 22, 8, 100, 22, 45, 22, 70, 8, 45, 0, 22, 8,
];

export type SampleHeatmapProps = {
	className?: string;
};

/** The locked card's default sample picture: a static calendar heat map in lapis tints. */
export function SampleHeatmap({ className }: SampleHeatmapProps) {
	return (
		<div className={cn("grid grid-cols-7 gap-1", className)}>
			{TINTS.map((tint, index) => (
				<div
					key={index}
					className="rounded-kbd h-5.5"
					style={{
						background: `color-mix(in oklab, var(--accent) ${tint}%, var(--page))`,
					}}
				/>
			))}
		</div>
	);
}
