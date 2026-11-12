"use client";

import { ChevronDown, type LucideIcon } from "lucide-react";
import {
	Button as AriaButton,
	Menu as AriaMenu,
	MenuItem as AriaMenuItem,
	MenuTrigger as AriaMenuTrigger,
	Popover as AriaPopover,
	type MenuTriggerProps as AriaMenuTriggerProps,
} from "react-aria-components";

import { buttonClasses } from "@/components/actions/Button";
import { cn } from "@/lib/cn";

export type MenuButtonItem = {
	/** Unique within the menu. */
	id: string;
	label: string;
	/** A lucide icon before the label, as the component. */
	icon?: LucideIcon;
	/** `danger` is for Delete: the label is red, and the word still says what it does. */
	tone?: "default" | "danger";
	isDisabled?: boolean;
	onAction: () => void;
};

export type MenuButtonProps = Pick<
	AriaMenuTriggerProps,
	"isOpen" | "defaultOpen" | "onOpenChange"
> & {
	/** The button's name: its visible text, or hidden text when `hideLabel` is set. */
	label: string;
	/** A lucide icon on the button, as the component. */
	icon?: LucideIcon;
	/** Shows only the icon, as a square button. Needs `icon`. */
	hideLabel?: boolean;
	items: readonly MenuButtonItem[];
	/** Which edge of the button the menu lines up with. */
	align?: "start" | "end";
	className?: string;
};

/**
 * A button that opens a menu of actions, such as a saved view's Rename and Delete (BR-F03-69).
 * React Aria gives the keyboard: Enter, Space or Down opens it on the first item, Up on the last;
 * the arrows move, typing a letter jumps, Enter runs an item and closes the menu, and Escape
 * closes it. Focus goes back to the button either way.
 */
export function MenuButton({
	label,
	icon: Icon,
	hideLabel = false,
	items,
	align = "start",
	className,
	...trigger
}: Readonly<MenuButtonProps>) {
	const iconOnly = hideLabel && Icon !== undefined;
	return (
		<AriaMenuTrigger {...trigger}>
			<AriaButton
				className={cn(
					buttonClasses({ variant: "secondary", size: "sm" }),
					iconOnly && "size-8 justify-center px-0 max-md:size-11",
					className,
				)}
			>
				{Icon && (
					<Icon
						aria-hidden="true"
						className="size-3.75 shrink-0"
					/>
				)}
				{/* The name comes from text, hidden or not, so it always matches what the button
				    shows (WCAG 2.5.3). */}
				<span className={cn(iconOnly && "sr-only")}>{label}</span>
				{!iconOnly && (
					<ChevronDown
						aria-hidden="true"
						className="text-ink-3 size-3.5 shrink-0"
					/>
				)}
			</AriaButton>
			<AriaPopover
				placement={align === "end" ? "bottom end" : "bottom start"}
				offset={6}
				className={cn(
					"border-line bg-page shadow-popover z-50 w-max max-w-[min(20rem,calc(100vw-2rem))] min-w-44 overflow-hidden rounded-xl border",
					"entering:opacity-0 exiting:opacity-0 transition-opacity duration-(--dur-fast) ease-out",
				)}
			>
				<AriaMenu
					items={items}
					className="p-1.5 outline-none"
				>
					{(item) => (
						<AriaMenuItem
							id={item.id}
							textValue={item.label}
							isDisabled={item.isDisabled ?? false}
							onAction={item.onAction}
							className={cn(
								"text-label focus:bg-soft flex min-h-10 cursor-pointer items-center gap-2 rounded-lg px-2.5 outline-none max-md:min-h-11",
								item.tone === "danger" ? "text-neg" : "text-ink",
								"disabled:text-ink-3 disabled:cursor-not-allowed",
							)}
						>
							{item.icon && (
								<item.icon
									aria-hidden="true"
									className="size-4 shrink-0"
								/>
							)}
							{item.label}
						</AriaMenuItem>
					)}
				</AriaMenu>
			</AriaPopover>
		</AriaMenuTrigger>
	);
}
