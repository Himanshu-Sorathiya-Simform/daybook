import type { LucideIcon } from "lucide-react";
import {
	Button as AriaButton,
	type ButtonProps as AriaButtonProps,
} from "react-aria-components";

import { Tooltip, type TooltipProps } from "@/components/navigation/Tooltip";
import { cn } from "@/lib/cn";

export type IconButtonProps = Omit<
	AriaButtonProps,
	"children" | "className" | "style" | "aria-label" | "aria-labelledby"
> & {
	/** A lucide icon, as the component: `icon={ChevronLeft}`. */
	icon: LucideIcon;
	/** The accessible name, also shown as the tooltip. Always required. */
	label: string;
	variant?: "outline" | "plain";
	/** 32, 36 or 44px square. On phones every size grows to the 44px touch target. */
	size?: "sm" | "md" | "lg";
	/** Where the tooltip sits; it opens below by default. */
	tooltipPlacement?: TooltipProps["placement"];
	className?: string;
};

const variants = {
	outline: "border-line-strong bg-page",
	plain: "border-transparent bg-transparent",
};

const sizes = {
	sm: { box: "size-8", icon: "size-3.5" },
	md: { box: "size-9", icon: "size-4" },
	lg: { box: "size-11", icon: "size-4.75" },
};

/** A square icon-only button for month arrows, row menus and close or collapse controls. */
export function IconButton({
	icon: Icon,
	label,
	variant = "outline",
	size = "md",
	tooltipPlacement,
	className,
	isDisabled = false,
	type = "button",
	onPress,
	onPressStart,
	onPressEnd,
	onPressChange,
	onPressUp,
	onClick,
	...rest
}: IconButtonProps) {
	const ariaProps: AriaButtonProps = {};
	if (isDisabled) ariaProps["aria-disabled"] = true;
	// A disabled button hears none of its press handlers.
	if (!isDisabled) {
		Object.assign(ariaProps, {
			onPress,
			onPressStart,
			onPressEnd,
			onPressChange,
			onPressUp,
			onClick,
		});
	}

	return (
		<Tooltip
			text={label}
			{...(tooltipPlacement ? { placement: tooltipPlacement } : {})}
		>
			<AriaButton
				{...rest}
				{...ariaProps}
				type={isDisabled ? "button" : type}
				aria-label={label}
				className={cn(
					"rounded-control text-ink inline-flex shrink-0 cursor-pointer items-center justify-center border",
					"not-aria-disabled:hover:bg-soft transition-colors duration-(--dur-fast) ease-out max-md:size-11",
					variants[variant],
					sizes[size].box,
					"aria-disabled:border-edge aria-disabled:text-ink-3 aria-disabled:cursor-not-allowed aria-disabled:border-[1.5px] aria-disabled:border-dashed aria-disabled:bg-transparent",
					className,
				)}
			>
				<Icon className={sizes[size].icon} />
			</AriaButton>
		</Tooltip>
	);
}
