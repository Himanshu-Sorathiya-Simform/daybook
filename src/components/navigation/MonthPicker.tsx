import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button as AriaButton } from "react-aria-components";

import { IconButton } from "@/components/actions/IconButton";
import { cn } from "@/lib/cn";

export type MonthPickerProps = {
	/** For example "October 2026", or "November 2026 · to date" for the current month. */
	label: string;
	canPrev?: boolean;
	canNext?: boolean;
	onPrev?: () => void;
	onNext?: () => void;
	/** Opens the month grid. The grid itself is the page's: this only reports the press. */
	onOpen?: () => void;
	className?: string;
};

/**
 * The month control of the Dashboard, Budgets and Insights: previous, the month, next. An arrow
 * that cannot go further stays focusable and is marked disabled, so a keyboard user who reaches
 * the current month does not lose their place.
 */
export function MonthPicker({
	label,
	canPrev = true,
	canNext = true,
	onPrev,
	onNext,
	onOpen,
	className,
}: Readonly<MonthPickerProps>) {
	return (
		<div className={cn("inline-flex items-center gap-1.5", className)}>
			<IconButton
				icon={ChevronLeft}
				label="Previous month"
				isDisabled={!canPrev}
				{...(onPrev ? { onPress: onPrev } : {})}
			/>
			<AriaButton
				aria-haspopup="dialog"
				{...(onOpen ? { onPress: onOpen } : {})}
				className="rounded-control text-body text-ink hover:bg-soft h-9 cursor-pointer px-2.5 font-semibold whitespace-nowrap transition-colors duration-(--dur-fast) ease-out max-md:min-h-11"
			>
				{label}
			</AriaButton>
			<IconButton
				icon={ChevronRight}
				label="Next month"
				isDisabled={!canNext}
				{...(onNext ? { onPress: onNext } : {})}
			/>
		</div>
	);
}
