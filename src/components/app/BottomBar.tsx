"use client";

import { Menu } from "lucide-react";
import { useState } from "react";
import { Button as AriaButton, Link as AriaLink } from "react-aria-components";

import { cn } from "@/lib/cn";
import { MoreSheet } from "./MoreSheet";
import { BOTTOM_BAR_ITEMS, isCurrent, MORE_ITEMS } from "./nav-items";

export type BottomBarProps = {
	pathname: string;
	className?: string;
};

const itemClasses = (current: boolean) =>
	cn(
		"text-axis flex min-h-(--target-min) cursor-pointer flex-col items-center justify-center gap-0.75 font-semibold no-underline hover:no-underline",
		current ? "text-accent" : "text-ink-2",
	);

/**
 * The main navigation below 768px (root section 4, D-512): Dashboard, Transactions, Budgets and
 * More, fixed to the foot of the screen. Add joins it with F03's interface (D-504). More is the
 * current item when the page is one it holds.
 */
export function BottomBar({ pathname, className }: Readonly<BottomBarProps>) {
	const [moreOpen, setMoreOpen] = useState(false);
	const moreCurrent = MORE_ITEMS.some((item) => isCurrent(pathname, item.href));
	return (
		<nav
			aria-label="Main"
			className={cn(
				"border-line bg-page fixed inset-x-0 bottom-0 z-25 grid h-(--bottom-bar-height) grid-cols-4 border-t",
				className,
			)}
		>
			{BOTTOM_BAR_ITEMS.map((item) => {
				const current = isCurrent(pathname, item.href);
				return (
					<AriaLink
						key={item.href}
						href={item.href}
						{...(current ? { "aria-current": "page" as const } : {})}
						className={itemClasses(current)}
					>
						<item.icon
							aria-hidden="true"
							className="size-5"
						/>
						{item.label}
					</AriaLink>
				);
			})}
			<AriaButton
				onPress={() => setMoreOpen(true)}
				{...(moreCurrent ? { "aria-current": true } : {})}
				className={itemClasses(moreCurrent)}
			>
				<Menu
					aria-hidden="true"
					className="size-5"
				/>
				More
			</AriaButton>
			<MoreSheet
				pathname={pathname}
				isOpen={moreOpen}
				onOpenChange={setMoreOpen}
			/>
		</nav>
	);
}
