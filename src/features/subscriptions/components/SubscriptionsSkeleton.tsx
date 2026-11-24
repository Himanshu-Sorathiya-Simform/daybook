import { Skeleton } from "@/components/feedback/Skeleton";
import { Section } from "@/components/surfaces/Section";
import { PAGE_TEXT } from "../lib/messages";

/** Skeleton rows while the list loads (section 6). */
const ROWS = 4;

/**
 * The page while the list loads (section 6): a skeleton summary, sized like the real one so
 * nothing shifts when the figures arrive, and four skeleton rows. There is no panel.
 */
export function SubscriptionsSkeleton() {
	return (
		<div
			aria-busy="true"
			aria-label={PAGE_TEXT.loading}
			role="status"
			className="flex flex-col gap-4"
		>
			<Section className="flex flex-col gap-3 px-6 py-5.5 max-md:p-4.5">
				<Skeleton className="h-3.5 w-30" />
				<Skeleton className="h-11 w-60" />
				<Skeleton className="h-3 w-50" />
			</Section>
			<Section className="px-5 py-3">
				{Array.from({ length: ROWS }, (_, row) => (
					<div
						key={row}
						className="grid grid-cols-[5rem_1fr_6.25rem] items-center gap-3.5 py-3.5 max-md:grid-cols-[1fr_6.25rem]"
					>
						<Skeleton className="h-3.5 w-20 max-md:hidden" />
						<Skeleton className="h-3.5 w-[55%]" />
						<Skeleton className="h-3.5 w-25" />
					</div>
				))}
			</Section>
		</div>
	);
}
