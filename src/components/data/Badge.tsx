import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

export type BadgeProps = {
	/** `neutral` for Simulated and Auto, `pending` for Pending sync, `error` for Not saved,
	 * `outline`, and `premium`. */
	tone?: "neutral" | "pending" | "error" | "outline" | "premium";
	/** A lucide icon before the text, as the component. */
	icon?: LucideIcon;
	children: ReactNode;
	className?: string;
};

const tones = {
	neutral: "border-transparent bg-soft text-ink-2",
	pending: "border-[1.5px] border-dashed border-edge bg-transparent text-pending",
	error: "border-transparent bg-neg-soft font-bold text-neg",
	outline: "border-line-strong bg-transparent text-ink-2",
	premium: "border-transparent bg-accent-soft text-accent",
};

/** A small status label for rows, widgets and the header. Use the fixed texts: "Pending sync",
 * "Not saved", "Simulated", "Premium" and "Auto". The text always carries the meaning; the
 * colour and dashed edge only support it. */
export function Badge({
	tone = "neutral",
	icon: Icon,
	children,
	className,
}: BadgeProps) {
	return (
		<span
			className={cn(
				"rounded-chip text-small inline-flex items-center gap-1.25 border px-2.25 py-0.5 whitespace-nowrap",
				tones[tone],
				className,
			)}
		>
			{Icon && (
				<Icon
					aria-hidden="true"
					className="size-3"
				/>
			)}
			{children}
		</span>
	);
}
