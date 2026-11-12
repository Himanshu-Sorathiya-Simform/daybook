"use client";

import { Plus } from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "@/components/actions/Button";
import { cn } from "@/lib/cn";

export type HeaderProps = {
	/** Opens the entry dialog (D-548). */
	onAdd: () => void;
	/** The controls at the right; today only the user menu (D-504). */
	children: ReactNode;
	className?: string;
};

/**
 * The bar above every logged-in page (root section 4). From 768px it carries "Add Transaction"
 * with its `N` key cap; on phones the bottom bar's Add takes its place, and the bar carries the
 * name instead, since the sidebar is gone (D-512, D-548). Search, sync status and Premium join
 * it with their features (D-504).
 */
export function Header({ onAdd, children, className }: Readonly<HeaderProps>) {
	return (
		<header
			className={cn(
				"border-line flex h-(--header-height) shrink-0 items-center gap-3.5 border-b px-8 max-md:px-4",
				className,
			)}
		>
			<p className="text-heading text-ink md:hidden">Daybook</p>
			<span className="flex-1" />
			<Button
				icon={Plus}
				shortcut="N"
				onPress={onAdd}
				className="max-md:hidden"
			>
				Add Transaction
			</Button>
			{children}
		</header>
	);
}
