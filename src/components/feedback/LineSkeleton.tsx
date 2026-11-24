"use client";

import { Skeleton } from "./Skeleton";
import { cn } from "@/lib/cn";

/** The text styles a line can stand for. */
const SIZES = {
	figure: "text-figure",
	heading: "text-heading",
	body: "text-body",
	label: "text-label",
	caption: "text-caption",
} as const;

export type LineSkeletonProps = {
	/** The text style of the line it stands for, which sets its height. */
	size: keyof typeof SIZES;
	/** The bar's width, as a Tailwind class: about as long as the text it stands for. */
	width: string;
	className?: string;
};

/**
 * One line of text that has not loaded: exactly a line of `size` tall, with a bar the height
 * of its letters, so the text takes its place without moving anything (section 6). Hidden
 * from screen readers like every skeleton; the part around it says it is busy.
 */
export function LineSkeleton({
	size,
	width,
	className,
}: Readonly<LineSkeletonProps>) {
	return (
		<span
			aria-hidden="true"
			className={cn("flex h-lh items-center", SIZES[size], className)}
		>
			<Skeleton className={cn("h-[0.7em]", width)} />
		</span>
	);
}
