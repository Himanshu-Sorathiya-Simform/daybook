"use client";

import { Menu, Plus } from "lucide-react";
import { useState } from "react";
import { Button as AriaButton, Link as AriaLink } from "react-aria-components";

import { cn } from "@/lib/cn";
import { MoreSheet } from "./MoreSheet";
import { BOTTOM_BAR_ITEMS, isCurrent, MORE_ITEMS } from "./nav-items";

export type BottomBarProps = {
	pathname: string;
	/** Opens the entry dialog (D-548). */
	onAdd: () => void;
	className?: string;
};

/** The index of the item Add follows: Transactions. */
const ADD_AFTER = 1;

const itemClasses = (current: boolean) =>
	cn(
		"text-axis flex min-h-(--target-min) cursor-pointer flex-col items-center justify-center gap-0.75 font-semibold no-underline hover:no-underline",
		current ? "text-accent" : "text-ink-2",
	);

/**
 * The main navigation below 768px (root section 4, D-512): Dashboard, Transactions, Add, Budgets
 * and More, fixed to the foot of the screen. Add is a round button in the accent colour that
 * opens the entry dialog (D-548). More is the current item when the page is one it holds.
 */
export function BottomBar({ pathname, onAdd, className }: Readonly<BottomBarProps>) {
	const [moreOpen, setMoreOpen] = useState(false);
	const moreCurrent = MORE_ITEMS.some((item) => isCurrent(pathname, item.href));
	return (
		<nav
			aria-label="Main"
			className={cn(
				"border-line bg-page fixed inset-x-0 bottom-0 z-25 grid h-(--bottom-bar-height) grid-cols-5 border-t",
				className,
			)}
		>
			{BOTTOM_BAR_ITEMS.map((item, index) => {
				const current = isCurrent(pathname, item.href);
				const link = (
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
				// Add sits in the middle, after Transactions.
				if (index !== ADD_AFTER) return link;
				return [
					link,
					<AriaButton
						key="add"
						aria-label="Add Transaction"
						onPress={onAdd}
						className="bg-accent text-on-accent focus-visible:focus-ring flex size-12 cursor-pointer items-center justify-center place-self-center rounded-full"
					>
						<Plus
							aria-hidden="true"
							className="size-5.5"
						/>
					</AriaButton>,
				];
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
