"use client";

import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

export type HeaderProps = {
	/** The controls at the right; today only the user menu (D-504). */
	children: ReactNode;
	className?: string;
};

/**
 * The bar above every logged-in page (root section 4). Search, sync status, Premium and Add
 * join it with their features (D-504). On phones, where the sidebar is gone, it carries the
 * name (D-512).
 */
export function Header({ children, className }: Readonly<HeaderProps>) {
	return (
		<header
			className={cn(
				"border-line flex h-(--header-height) shrink-0 items-center gap-3.5 border-b px-8 max-md:px-4",
				className,
			)}
		>
			<p className="text-heading text-ink md:hidden">Daybook</p>
			<span className="flex-1" />
			{children}
		</header>
	);
}
