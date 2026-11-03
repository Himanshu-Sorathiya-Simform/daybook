"use client";

import { NavItem } from "@/components/navigation/NavItem";
import { Dialog } from "@/components/surfaces/Dialog";
import { isCurrent, MORE_ITEMS } from "./nav-items";

export type MoreSheetProps = {
	pathname: string;
	isOpen: boolean;
	onOpenChange: (isOpen: boolean) => void;
};

/** The bottom bar's More (root section 4): every destination the bar has no room for, as a
 * sheet from the bottom. Choosing one closes it. */
export function MoreSheet({
	pathname,
	isOpen,
	onOpenChange,
}: Readonly<MoreSheetProps>) {
	return (
		<Dialog
			title="More"
			isOpen={isOpen}
			onOpenChange={onOpenChange}
			isDismissable
		>
			<nav
				aria-label="More"
				className="flex flex-col gap-0.5 pb-2"
			>
				{MORE_ITEMS.map((item) => (
					<NavItem
						key={item.href}
						label={item.label}
						icon={item.icon}
						href={item.href}
						active={isCurrent(pathname, item.href)}
						onPress={() => onOpenChange(false)}
					/>
				))}
			</nav>
		</Dialog>
	);
}
