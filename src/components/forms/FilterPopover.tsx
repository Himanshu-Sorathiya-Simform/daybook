"use client";

import { ChevronDown } from "lucide-react";
import type { ReactNode } from "react";
import {
	Button as AriaButton,
	Dialog as AriaDialog,
	DialogTrigger as AriaDialogTrigger,
	Popover as AriaPopover,
	type DialogTriggerProps as AriaDialogTriggerProps,
} from "react-aria-components";

import { Button } from "@/components/actions/Button";
import { cn } from "@/lib/cn";

export type FilterPopoverProps = Pick<
	AriaDialogTriggerProps,
	"isOpen" | "defaultOpen" | "onOpenChange"
> & {
	/** What the control filters, "Date". It also names the popover. */
	label: string;
	/** The current choice, "Last month", shown after the label. */
	value?: string;
	/** A filter that narrows the list: the trigger takes the accent outline, beside the value. */
	isActive?: boolean;
	/** The popover's width: 240, 288, 360 or 520px, never wider than the screen. */
	width?: "sm" | "md" | "lg" | "xl";
	/** Which edge of the trigger the popover lines up with. */
	align?: "start" | "end";
	/** The popover's content. As a function it gets `close`, for a choice that closes it. */
	children: ReactNode | ((close: () => void) => ReactNode);
	/** A row under the content, such as Clear or "16 days · 23 Transactions". */
	footer?: ReactNode;
	/** Adds Done at the end of the footer row, which closes the popover. */
	showDone?: boolean;
	className?: string;
};

const widths = {
	sm: "w-60",
	md: "w-72",
	lg: "w-90",
	xl: "w-130",
};

/**
 * A filter bar control (BR-F03-39): a trigger reading "Date Last month" that opens a popover of
 * choices. The popover is a non-modal dialog named by the label: focus moves into it, Tab stays
 * inside, and Escape or a press outside closes it and puts focus back on the trigger.
 */
export function FilterPopover({
	label,
	value,
	isActive = false,
	width = "md",
	align = "start",
	children,
	footer,
	showDone = false,
	className,
	...trigger
}: Readonly<FilterPopoverProps>) {
	return (
		<AriaDialogTrigger {...trigger}>
			<AriaButton
				className={cn(
					"group/trigger rounded-control bg-page text-label text-ink inline-flex h-9.5 cursor-pointer items-center gap-1.5 border px-2.75 whitespace-nowrap",
					"transition-colors duration-(--dur-fast) ease-out max-md:min-h-11",
					isActive ? "border-accent border-[1.5px]" : "border-edge",
					"aria-expanded:border-accent aria-expanded:bg-accent-soft aria-expanded:border-[1.5px]",
					className,
				)}
			>
				<span className="text-ink-2">{label}</span>
				{value && (
					<>
						{/* A space keeps the two apart in the button's name. */}{" "}
						<span className="font-semibold">{value}</span>
					</>
				)}
				<ChevronDown
					aria-hidden="true"
					className="text-ink-3 size-3.5 shrink-0 transition-transform duration-(--dur-fast) ease-out group-aria-expanded/trigger:rotate-180"
				/>
			</AriaButton>
			<AriaPopover
				placement={align === "end" ? "bottom end" : "bottom start"}
				offset={6}
				className={cn(
					"border-line bg-page shadow-popover rounded-section z-50 max-w-[calc(100vw-2rem)] overflow-auto border",
					"entering:opacity-0 exiting:opacity-0 transition-opacity duration-(--dur-fast) ease-out",
					widths[width],
				)}
			>
				<AriaDialog
					aria-label={label}
					className="flex flex-col gap-0.5 p-2.5 outline-none"
				>
					{({ close }) => (
						<>
							{typeof children === "function" ?
								children(close)
							:	children}
							{(footer || showDone) && (
								<div className="border-line mt-1.5 flex items-center gap-2 border-t px-1 pt-2">
									<div className="text-caption text-ink-2 flex min-w-0 flex-1 items-center gap-2">
										{footer}
									</div>
									{showDone && (
										<Button
											size="sm"
											onPress={close}
										>
											Done
										</Button>
									)}
								</div>
							)}
						</>
					)}
				</AriaDialog>
			</AriaPopover>
		</AriaDialogTrigger>
	);
}
