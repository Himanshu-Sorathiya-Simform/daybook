"use client";

import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { Button as AriaButton } from "react-aria-components";

import { NavItem } from "@/components/navigation/NavItem";
import { Tooltip } from "@/components/navigation/Tooltip";
import { cn } from "@/lib/cn";
import { isCurrent, SETTINGS_ITEM, SIDEBAR_ITEMS } from "./nav-items";

export type SidebarProps = {
	/** The page's path, which marks the current item. */
	pathname: string;
	/** The 64px icon rail instead of the 232px sidebar (D-513). */
	rail: boolean;
	onRailChange: (rail: boolean) => void;
	className?: string;
};

/**
 * The main navigation from 768px up (root section 4, D-512): the items in the root spec's
 * order, Settings and the width toggle at the foot. In the rail each label becomes the link's
 * name and its tooltip.
 */
export function Sidebar({
	pathname,
	rail,
	onRailChange,
	className,
}: Readonly<SidebarProps>) {
	const toggleLabel = rail ? "Expand sidebar" : "Collapse sidebar";
	const ToggleIcon = rail ? PanelLeftOpen : PanelLeftClose;
	const toggle = (
		<AriaButton
			{...(rail ? { "aria-label": toggleLabel } : {})}
			onPress={() => onRailChange(!rail)}
			className={cn(
				"rounded-control text-body text-ink-2 flex h-10 cursor-pointer items-center gap-3 font-medium",
				"hover:bg-soft hover:text-ink transition-colors duration-(--dur-fast) ease-out",
				rail ? "w-10 justify-center" : "px-3",
			)}
		>
			<ToggleIcon
				aria-hidden="true"
				className="size-4.5 shrink-0"
			/>
			{!rail && toggleLabel}
		</AriaButton>
	);
	return (
		<nav
			aria-label="Main"
			className={cn(
				"border-line sticky top-0 flex h-dvh shrink-0 flex-col gap-0.5 overflow-y-auto border-r px-3 py-4.5",
				"transition-[width] duration-(--dur-base) ease-out",
				rail ? "w-(--rail-width) items-center" : "w-(--sidebar-width)",
				className,
			)}
		>
			<p className={cn("text-heading text-ink pt-1 pb-5.5", !rail && "px-3")}>
				{rail ?
					<>
						<span aria-hidden="true">D</span>
						<span className="sr-only">Daybook</span>
					</>
				:	"Daybook"}
			</p>
			{SIDEBAR_ITEMS.map((item) => (
				<NavItem
					key={item.href}
					label={item.label}
					icon={item.icon}
					href={item.href}
					active={isCurrent(pathname, item.href)}
					collapsed={rail}
					{...(item.groupStart ? { className: "mt-3.5" } : {})}
				/>
			))}
			<div className="min-h-6 flex-1" />
			<NavItem
				label={SETTINGS_ITEM.label}
				icon={SETTINGS_ITEM.icon}
				href={SETTINGS_ITEM.href}
				active={isCurrent(pathname, SETTINGS_ITEM.href)}
				collapsed={rail}
			/>
			{/* Always wrapped, and only switched off at full width: unwrapping would replace the
			    button, and the keyboard focus on it would be lost. */}
			<Tooltip
				text={toggleLabel}
				placement="right"
				isDisabled={!rail}
			>
				{toggle}
			</Tooltip>
		</nav>
	);
}
