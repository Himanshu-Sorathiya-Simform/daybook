"use client";

import type { ReactNode } from "react";

import { Section } from "@/components/surfaces/Section";
import { cn } from "@/lib/cn";

export type DockedPanelProps = {
	/** The landmark's name for screen readers, "Subscription". */
	label: string;
	children: ReactNode;
	/** Classes for the aside. */
	className?: string;
};

/**
 * The shell of a panel docked beside a list (BR-F03-70, BR-F04-30, BR-F05-40): a sticky column
 * that is never taller than the screen. Its frame stays put and its content scrolls inside, with
 * the thin scrollbar, so a long timeline or a long note never stretches the page past a short
 * list (D-621). Below 1180 px it is hidden: the page shows a drawer instead. Its content fills
 * the height, so a footer of buttons can sit at the bottom.
 */
export function DockedPanel({
	label,
	children,
	className,
}: Readonly<DockedPanelProps>) {
	return (
		<aside
			aria-label={label}
			className={cn("max-dock:hidden sticky top-7", className)}
		>
			<Section
				as="div"
				className="flex max-h-[calc(100dvh-3.5rem)] min-h-[min(35rem,calc(100dvh-3.5rem))] flex-col overflow-hidden px-0 py-0 max-md:px-0 max-md:py-0"
			>
				<div className="flex min-h-0 flex-1 scrollbar-thin flex-col overflow-y-auto overscroll-contain px-5.5 py-5 *:grow">
					{children}
				</div>
			</Section>
		</aside>
	);
}
