import type { LucideIcon } from "lucide-react";
import { useId, type ReactNode } from "react";
import {
	Button as AriaButton,
	type ButtonProps as AriaButtonProps,
} from "react-aria-components";

import { cn } from "@/lib/cn";

export type ButtonProps = Omit<
	AriaButtonProps,
	"children" | "className" | "style"
> & {
	/** `primary` is the one main action in a region; `danger` is for Delete, kept away from Save. */
	variant?: "primary" | "secondary" | "ghost" | "danger";
	/** On phones every size grows to the 44px touch target. */
	size?: "sm" | "md" | "lg";
	/** A lucide icon shown before the label, as the component: `icon={Plus}`. */
	icon?: LucideIcon;
	/** A keyboard shortcut shown as a key cap, for example "N". It only displays the key. */
	shortcut?: string;
	/** Why the button is disabled, or what it does. Shown under it and read with it. */
	description?: string;
	children?: ReactNode;
	/** Classes for the root element: the button, or the wrapper when there is a `description`. */
	className?: string;
};

const variants = {
	primary:
		"border-transparent bg-accent text-on-accent not-aria-disabled:hover:bg-accent-hover",
	secondary: "border-line-strong bg-page text-ink not-aria-disabled:hover:bg-soft",
	ghost: "border-transparent bg-transparent text-accent not-aria-disabled:hover:bg-soft",
	danger: "border-neg bg-page text-neg not-aria-disabled:hover:bg-soft",
};

const sizes = {
	sm: "h-8 px-3 text-caption",
	md: "h-9.5 px-3.5 text-label",
	lg: "h-11 px-4.5 text-body",
};

/**
 * Daybook's button. A disabled button stays focusable (`aria-disabled`, not the native
 * attribute) so a keyboard or screen reader user reaches it and hears the `description`. While
 * disabled it ignores presses and never submits a form.
 */
export function Button({
	variant = "primary",
	size = "md",
	icon: Icon,
	shortcut,
	description,
	children,
	className,
	isDisabled = false,
	type = "button",
	"aria-describedby": describedBy,
	onPress,
	onPressStart,
	onPressEnd,
	onPressChange,
	onPressUp,
	onClick,
	...rest
}: ButtonProps) {
	const descriptionId = useId();
	const ariaProps: AriaButtonProps = {};
	if (isDisabled) ariaProps["aria-disabled"] = true;
	// The visible description and any description the caller names are both read.
	const describedByIds = [description ? descriptionId : "", describedBy ?? ""]
		.filter(Boolean)
		.join(" ");
	if (describedByIds) ariaProps["aria-describedby"] = describedByIds;
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

	const button = (
		<AriaButton
			{...rest}
			{...ariaProps}
			type={isDisabled ? "button" : type}
			className={cn(
				"rounded-control inline-flex cursor-pointer items-center gap-2 border font-semibold whitespace-nowrap",
				"transition-colors duration-(--dur-fast) ease-out max-md:min-h-11",
				variants[variant],
				sizes[size],
				shortcut && "pr-2",
				"aria-disabled:border-edge aria-disabled:text-ink-3 aria-disabled:cursor-not-allowed aria-disabled:border-[1.5px] aria-disabled:border-dashed aria-disabled:bg-transparent",
				description ? undefined : className,
			)}
		>
			{Icon && <Icon className="size-3.75 shrink-0" />}
			{children}
			{shortcut && (
				<kbd className="rounded-kbd text-small border border-current px-1.25 font-sans opacity-85">
					{shortcut}
				</kbd>
			)}
		</AriaButton>
	);

	if (!description) return button;
	return (
		<span className={cn("inline-flex flex-col gap-1", className)}>
			{button}
			<span
				id={descriptionId}
				className="text-caption text-ink-3"
			>
				{description}
			</span>
		</span>
	);
}
