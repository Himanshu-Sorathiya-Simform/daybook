import { Skeleton } from "@/components/feedback/Skeleton";

/** Onboarding's outline while the page cannot yet know the browser's zone and language (F02
 * section 6, loading): four fields and the button, marked busy. */
export function OnboardingLoading() {
	return (
		<div
			className="flex flex-col gap-5"
			aria-busy="true"
		>
			{[0, 1, 2, 3].map((row) => (
				<Skeleton
					key={row}
					className="h-16 w-full"
				/>
			))}
			<Skeleton className="h-11 w-full" />
		</div>
	);
}
