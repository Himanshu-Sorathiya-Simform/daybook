"use client";

import { LineSkeleton } from "@/components/feedback/LineSkeleton";
import { Skeleton } from "@/components/feedback/Skeleton";
import { cn } from "@/lib/cn";

/** The terms the detail always shows, in its order (BR-F03-72). */
const TERMS = ["Type", "Category", "Date", "Source", "Note"] as const;

export type PanelDetailSkeletonProps = {
	className?: string;
};

/**
 * The selected row's detail while the row itself loads (BR-F03-70): what `PanelDetail` draws
 * under its heading, in the same sizes, so nothing moves when the row arrives. The avatar and
 * the title, the amount at its readout size, the five terms with their values, the soft box for
 * the payee's history and the three buttons with their hint. It is one busy status; the bars
 * are hidden from screen readers.
 */
export function PanelDetailSkeleton({
	className,
}: Readonly<PanelDetailSkeletonProps>) {
	return (
		<div
			role="status"
			aria-busy="true"
			aria-label="Loading the Transaction"
			className={cn("flex flex-1 flex-col gap-4", className)}
		>
			<div className="flex items-center gap-3">
				<Skeleton className="size-11 shrink-0 rounded-full" />
				<div className="flex min-w-0 flex-1 flex-col">
					<LineSkeleton
						size="heading"
						width="w-40"
					/>
					<LineSkeleton
						size="caption"
						width="w-28"
					/>
				</div>
			</div>
			<Skeleton className="h-15.75 w-45" />
			<dl className="border-line grid grid-cols-[6rem_minmax(0,1fr)] border-t">
				{TERMS.map((term) => (
					<div
						key={term}
						className="contents"
					>
						<dt className="border-line text-label text-ink-2 border-b py-2.5">
							{term}
						</dt>
						<dd className="border-line border-b py-2.5">
							<LineSkeleton
								size="body"
								width="w-2/3"
							/>
						</dd>
					</div>
				))}
			</dl>
			<div className="bg-soft rounded-control flex flex-col gap-1.5 px-3.5 py-3">
				<Skeleton className="h-4 w-1/2" />
				<Skeleton className="h-3.5 w-3/4" />
			</div>
			<span className="flex-1" />
			<div className="flex items-center gap-2">
				<Skeleton className="rounded-control h-9.5 flex-1" />
				<Skeleton className="rounded-control h-9.5 w-24" />
				<Skeleton className="rounded-control h-9.5 w-20" />
			</div>
			<LineSkeleton
				size="caption"
				width="w-3/4"
			/>
		</div>
	);
}
