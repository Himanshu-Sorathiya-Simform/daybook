import { Skeleton } from "@/components/feedback/Skeleton";
import { Section } from "@/components/surfaces/Section";

/** Skeleton rows while the list loads (section 6). */
const ROWS = 3;

/**
 * The page while its month loads (section 6): a skeleton overview, sized like the real one so
 * nothing shifts when the figures arrive, and three skeleton rows.
 */
export function BudgetsSkeleton() {
	return (
		<div
			aria-busy="true"
			aria-label="Loading Budgets"
			role="status"
			className="flex flex-col gap-4"
		>
			<Section className="flex flex-col gap-3 px-6 py-5.5 max-md:p-4.5">
				<Skeleton className="h-3.5 w-50" />
				<Skeleton className="h-11 w-65" />
				<Skeleton className="h-3" />
			</Section>
			<Section className="px-5 py-3">
				{Array.from({ length: ROWS }, (_, row) => (
					<div
						key={row}
						className="flex flex-col gap-2.5 py-3.5"
					>
						<div className="flex justify-between">
							<Skeleton className="h-3.5 w-35" />
							<Skeleton className="h-3.5 w-27.5" />
						</div>
						<Skeleton className="h-2" />
						<Skeleton className="h-2.5 w-[45%]" />
					</div>
				))}
			</Section>
		</div>
	);
}
