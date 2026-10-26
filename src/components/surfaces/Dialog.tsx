import { X } from "lucide-react";
import type { ReactNode } from "react";
import {
	Dialog as AriaDialog,
	Heading as AriaHeading,
	Modal as AriaModal,
	ModalOverlay as AriaModalOverlay,
} from "react-aria-components";

import { IconButton } from "@/components/actions/IconButton";
import { cn } from "@/lib/cn";

export type DialogProps = {
	title: string;
	isOpen: boolean;
	onOpenChange: (isOpen: boolean) => void;
	/** The actions row, usually Cancel and Save. Push them right with a flexible spacer. */
	footer?: ReactNode;
	children?: ReactNode;
	/** The panel's largest width: 480, 560 or 640px. On phones it is a bottom sheet instead. */
	size?: "sm" | "md" | "lg";
	/** Use `alertdialog` for a confirmation that needs an answer, such as Delete. */
	role?: "dialog" | "alertdialog";
	/** Whether a press outside closes it. Off by default, so a half-filled form isn't lost. */
	isDismissable?: boolean;
	/** Turn off closing with Escape, for example while a save is in flight. */
	isKeyboardDismissDisabled?: boolean;
	/** Classes for the panel. */
	className?: string;
};

const sizes = {
	sm: "max-w-120",
	md: "max-w-140",
	lg: "max-w-160",
};

/**
 * A modal dialog: a centred panel near the top on desktop, a bottom sheet below 768px. React
 * Aria traps focus inside, closes on Escape, locks page scroll, and puts focus back on the button
 * that opened it. Only the body scrolls; the title row and the footer stay.
 */
export function Dialog({
	title,
	isOpen,
	onOpenChange,
	footer,
	children,
	size = "md",
	role = "dialog",
	isDismissable = false,
	isKeyboardDismissDisabled = false,
	className,
}: Readonly<DialogProps>) {
	return (
		<AriaModalOverlay
			isOpen={isOpen}
			onOpenChange={onOpenChange}
			isDismissable={isDismissable}
			isKeyboardDismissDisabled={isKeyboardDismissDisabled}
			className={cn(
				"bg-scrim fixed inset-0 z-50 flex h-(--visual-viewport-height) items-start justify-center px-4 pt-12 max-md:items-end max-md:p-0",
				"entering:opacity-0 exiting:opacity-0 transition-opacity duration-(--dur-base) ease-out",
			)}
		>
			<AriaModal
				className={cn(
					"rounded-card border-line bg-page shadow-dialog flex max-h-[calc(var(--visual-viewport-height)-6rem)] w-full flex-col border",
					"max-md:rounded-t-card max-md:max-h-full max-md:rounded-b-none",
					sizes[size],
					className,
				)}
			>
				<AriaDialog
					role={role}
					className="flex min-h-0 flex-1 flex-col outline-none"
				>
					<div
						aria-hidden="true"
						className="bg-line-strong mx-auto mt-2 h-1 w-9 shrink-0 rounded-sm md:hidden"
					/>
					<div className="flex shrink-0 items-center px-5.5 pt-4.5 pb-1.5">
						<AriaHeading
							slot="title"
							className="text-heading text-ink flex-1"
						>
							{title}
						</AriaHeading>
						<IconButton
							slot="close"
							icon={X}
							label="Close"
							variant="plain"
							size="sm"
						/>
					</div>
					<div className="flex min-w-0 flex-col gap-3.5 overflow-x-hidden overflow-y-auto px-5.5 pt-2.5 pb-4.5">
						{children}
					</div>
					{footer && (
						<div className="border-line flex shrink-0 items-center gap-2 border-t px-5.5 py-3.5">
							{footer}
						</div>
					)}
				</AriaDialog>
			</AriaModal>
		</AriaModalOverlay>
	);
}
