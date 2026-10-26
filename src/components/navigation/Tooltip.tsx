import type { ReactNode } from "react";
import {
	Tooltip as AriaTooltip,
	TooltipTrigger as AriaTooltipTrigger,
	type TooltipTriggerComponentProps as AriaTooltipTriggerProps,
} from "react-aria-components";

import { cn } from "@/lib/cn";

export type TooltipProps = Pick<
	AriaTooltipTriggerProps,
	"delay" | "closeDelay" | "isDisabled"
> & {
	/** The short text shown. Never put buttons in it; use a popover for that. */
	text: string;
	/**
	 * The element the tooltip describes. It must take focus and hover from React Aria, like a
	 * Button or Link. For plain content, wrap it in `<AriaFocusable><span tabIndex={0}>`.
	 */
	children: ReactNode;
	placement?: "top" | "bottom" | "left" | "right";
	/** Classes for the tooltip bubble. */
	className?: string;
};

/** A short hint for icon buttons, the sync status and the collapsed nav rail. It opens on hover
 * and on keyboard focus, and closes on Escape. */
export function Tooltip({
	text,
	children,
	placement = "bottom",
	className,
	delay = 500,
	...triggerProps
}: Readonly<TooltipProps>) {
	return (
		<AriaTooltipTrigger
			delay={delay}
			{...triggerProps}
		>
			{children}
			<AriaTooltip
				placement={placement}
				offset={6}
				className={cn(
					"rounded-kbd bg-ink text-small text-page z-50 px-2.25 py-1.25 font-medium",
					"opacity-100 transition-opacity duration-(--dur-fast) ease-out",
					"entering:opacity-0 exiting:opacity-0",
					className,
				)}
			>
				{text}
			</AriaTooltip>
		</AriaTooltipTrigger>
	);
}
