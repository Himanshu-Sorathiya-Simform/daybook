import { cn } from "@/lib/cn";

export type SkeletonProps = {
	/** Size it like the real content (`h-15 w-45` for the readout), so nothing shifts when the
	 * data arrives. The default is a full-width line of body text. */
	className?: string;
};

/** A static placeholder in the track colour. It has no shimmer, because motion only follows an
 * action. It is hidden from screen readers; the section around it says it is loading. */
export function Skeleton({ className }: SkeletonProps) {
	return (
		<span
			aria-hidden="true"
			className={cn("bg-track block h-3.5 w-full rounded-md", className)}
		/>
	);
}
