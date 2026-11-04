"use client";

import type { ReactNode } from "react";
import {
	Dialog as AriaDialog,
	Modal as AriaModal,
	ModalOverlay as AriaModalOverlay,
} from "react-aria-components";

import { cn } from "@/lib/cn";

export type DrawerProps = {
	/** The drawer's name for screen readers, "Transaction details". Its content shows its own
	 * heading and Close button, so the same content can also sit docked beside the list. */
	label: string;
	isOpen: boolean;
	onOpenChange: (isOpen: boolean) => void;
	/** The content. As a function it gets `close`, for its own Close button. */
	children: ReactNode | ((close: () => void) => ReactNode);
	/** Whether a press on the scrim closes it. On by default: a drawer holds no draft. */
	isDismissable?: boolean;
	/** Classes for the panel. */
	className?: string;
};

/**
 * A side sheet from the right over a scrim, at most 420px wide and the full width of a phone
 * (BR-F03-70). React Aria traps focus inside, closes on Escape or a press on the scrim, locks
 * page scroll, and puts focus back where it was. The panel scrolls as one.
 */
export function Drawer({
	label,
	isOpen,
	onOpenChange,
	children,
	isDismissable = true,
	className,
}: Readonly<DrawerProps>) {
	return (
		<AriaModalOverlay
			isOpen={isOpen}
			onOpenChange={onOpenChange}
			isDismissable={isDismissable}
			className={cn(
				"bg-scrim fixed inset-0 z-50 flex h-(--visual-viewport-height) justify-end",
				"entering:opacity-0 exiting:opacity-0 transition-opacity duration-(--dur-base) ease-out",
			)}
		>
			<AriaModal
				className={cn(
					"bg-page shadow-dialog md:rounded-l-card flex h-full w-full max-w-105 flex-col overflow-y-auto",
					"entering:translate-x-full exiting:translate-x-full transition-transform duration-(--dur-base) ease-out",
					className,
				)}
			>
				<AriaDialog
					aria-label={label}
					className="flex min-h-full flex-col outline-none"
				>
					{({ close }) =>
						typeof children === "function" ? children(close) : children
					}
				</AriaDialog>
			</AriaModal>
		</AriaModalOverlay>
	);
}
