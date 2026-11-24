"use client";

import { LineSkeleton } from "@/components/feedback/LineSkeleton";
import { Skeleton } from "@/components/feedback/Skeleton";
import { cn } from "@/lib/cn";

export type ChargeTimelineSkeletonProps = {
	/** How many lines the timeline will show at first (`expectedLines`). */
	count: number;
	/** Whether a Show all button follows the lines. */
	toggle: boolean;
	className?: string;
};

/**
 * The charges timeline while its charges load (BR-F05-40): the lines it will have, each in the
 * same two rows, date with amount and then a caption, with the same padding and rule, so the
 * panel does not move when they arrive. It is plain boxes, not a list: only the real timeline is one. With no line to expect it holds one line of text, where
 * "No charges yet." goes. One busy status; the bars are hidden from screen readers.
 */
export function ChargeTimelineSkeleton({
	count,
	toggle,
	className,
}: Readonly<ChargeTimelineSkeletonProps>) {
	return (
		<div
			role="status"
			aria-busy="true"
			aria-label="Loading charges"
			className={cn("flex flex-col", className)}
		>
			{count === 0 ?
				<LineSkeleton
					size="body"
					width="w-32"
				/>
			:	<div className="border-line border-t">
					{Array.from({ length: count }, (_, index) => (
						<div
							key={index}
							className="border-line grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 border-b py-2.5"
						>
							<LineSkeleton
								size="label"
								width="w-24"
							/>
							<LineSkeleton
								size="label"
								width="w-16"
							/>
							<LineSkeleton
								size="caption"
								width="w-48"
								className="col-span-full"
							/>
						</div>
					))}
				</div>
			}
			{toggle && <Skeleton className="rounded-control mt-2 h-8 w-24" />}
		</div>
	);
}
