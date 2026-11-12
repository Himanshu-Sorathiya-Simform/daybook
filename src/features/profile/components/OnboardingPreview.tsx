import { useId } from "react";

import { Skeleton } from "@/components/feedback/Skeleton";
import { cn } from "@/lib/cn";
import { ONBOARDING_TEXT } from "../lib/messages";
import { type PreviewChoices, previewOf } from "../lib/preview";

export type OnboardingPreviewProps = {
	/** The four choices, or `null` before a country is chosen. */
	choices: PreviewChoices | null;
	/** While the page cannot yet know the browser, the Preview is an outline. */
	isLoading?: boolean;
	/** When the Preview reads the clock: the time the page opened (D-511). */
	at: Date;
	className?: string;
};

/**
 * Onboarding's Preview (F02 section 6, D-511): how Daybook will show amounts, today and this
 * week with the four choices, beside the fields, changing as they change. The sample amount
 * shows its whole part large, as the app's readouts do; screen readers hear it whole.
 */
export function OnboardingPreview({
	choices,
	isLoading = false,
	at,
	className,
}: Readonly<OnboardingPreviewProps>) {
	const titleId = useId();
	const text = ONBOARDING_TEXT.preview;
	const preview = choices && !isLoading ? previewOf(choices, at) : null;
	const amount = preview?.amount;
	const small = "text-heading text-ink-2 font-medium";
	return (
		<section
			aria-labelledby={titleId}
			className={cn(
				"rounded-section border-line flex flex-col gap-5.5 border px-6 py-5.5",
				className,
			)}
		>
			<div className="flex flex-col gap-1">
				<h2
					id={titleId}
					className="text-heading text-ink font-bold"
				>
					{text.title}
				</h2>
				<p className="text-caption text-ink-3">{text.intro}</p>
			</div>
			{isLoading && (
				<div
					className="flex flex-col gap-3"
					aria-busy="true"
				>
					<Skeleton className="h-3 w-1/3" />
					<Skeleton className="h-8.5 w-3/4" />
					<Skeleton className="h-3 w-2/5" />
					<Skeleton className="h-5 w-1/2" />
					<Skeleton className="h-13 w-full" />
				</div>
			)}
			{!isLoading && !preview && (
				<p className="text-label text-ink-2">{text.empty}</p>
			)}
			{preview && amount && (
				<>
					<div className="flex flex-col gap-1.5">
						<span className="text-label text-ink-2 font-medium">
							{text.amounts}
						</span>
						<p className="figures flex flex-wrap items-baseline tracking-tight">
							<span className="sr-only">{amount.text}</span>
							<span
								aria-hidden="true"
								className="contents"
							>
								{!amount.symbolAfter && (
									<span
										className={cn(
											small,
											amount.spaced && "mr-1",
										)}
									>
										{amount.symbol}
									</span>
								)}
								<span className="text-title text-ink font-semibold">
									{amount.integer}
								</span>
								<span className={small}>{amount.fraction}</span>
								{amount.symbolAfter && (
									<span
										className={cn(
											small,
											amount.spaced && "ml-1",
										)}
									>
										{amount.symbol}
									</span>
								)}
							</span>
						</p>
						<p className="figures text-label text-ink-2 flex flex-wrap gap-x-4 gap-y-1 font-medium">
							<span>{preview.negative}</span>
							<span>{preview.percent}</span>
						</p>
					</div>
					<div className="flex flex-col gap-1.5">
						<span className="text-label text-ink-2 font-medium">
							{text.today}
						</span>
						<p className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
							<span className="text-heading text-ink font-semibold">
								{preview.day}
							</span>
							<span className="figures text-body text-ink-2 font-medium">
								{preview.time}
							</span>
						</p>
						<span className="text-caption text-ink-3">
							{preview.zone}
						</span>
					</div>
					<div className="flex flex-col gap-2">
						<span className="text-label text-ink-2 font-medium">
							{text.week}
						</span>
						<ol className="flex gap-1">
							{preview.week.map((day) => (
								<li
									key={day.date}
									{...(day.isToday ?
										{ "aria-current": "date" as const }
									:	{})}
									className={cn(
										"rounded-control flex min-w-0 flex-1 flex-col items-center gap-0.5 border-[1.5px] py-2",
										day.isToday ? "border-accent" : (
											"border-transparent"
										),
									)}
								>
									<span className="text-small text-ink-3 font-semibold">
										{day.weekday}
									</span>
									<span
										className={cn(
											"figures text-body font-semibold",
											day.isToday ? "text-accent" : "text-ink",
										)}
									>
										{day.day}
									</span>
								</li>
							))}
						</ol>
					</div>
				</>
			)}
		</section>
	);
}
