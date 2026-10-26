import { CircleAlert } from "lucide-react";
import type { ReactNode } from "react";
import { Button as AriaButton } from "react-aria-components";

import { cn } from "@/lib/cn";

export type ToastProps = {
	children: ReactNode;
	/** The label of the one action, for example "Undo" or "Show". */
	action?: string;
	onAction?: () => void;
	tone?: "neutral" | "error";
	className?: string;
};

/**
 * What a toast looks like: one line and an optional action, on the inverse surface so it reads
 * over any page. It is shown through `showToast`, and Sonner's own live region announces it, so
 * it has no `role` of its own.
 */
export function Toast({
	children,
	action,
	onAction,
	tone = "neutral",
	className,
}: Readonly<ToastProps>) {
	return (
		<div
			className={cn(
				"rounded-chip bg-ink text-label text-page shadow-popover inline-flex min-h-11 max-w-105 items-center gap-3 py-2 pr-2.5 pl-4 font-medium",
				className,
			)}
		>
			{tone === "error" && (
				<CircleAlert
					aria-hidden="true"
					className="text-neg-soft size-4 shrink-0"
				/>
			)}
			<span className="flex-1">{children}</span>
			{action && (
				<AriaButton
					{...(onAction ? { onPress: onAction } : {})}
					className="outline-page hover:bg-page/10 h-7.5 cursor-pointer rounded-lg px-2.5 font-bold underline underline-offset-3 max-md:min-h-11"
				>
					{action}
				</AriaButton>
			)}
		</div>
	);
}
