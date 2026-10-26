import type { LucideIcon } from "lucide-react";
import {
	Link as AriaLink,
	type LinkProps as AriaLinkProps,
} from "react-aria-components";

import { Tooltip } from "@/components/navigation/Tooltip";
import { cn } from "@/lib/cn";

export type NavItemProps = Omit<
	AriaLinkProps,
	"children" | "className" | "style" | "aria-current" | "aria-label"
> & {
	label: string;
	/** A lucide icon, as the component: `icon={LayoutDashboard}`. */
	icon: LucideIcon;
	href: string;
	/** The page the user is on: a soft fill, ink text and a lapis icon, and `aria-current`. */
	active?: boolean;
	/** The icon rail: the label is hidden and becomes the tooltip and the accessible name. */
	collapsed?: boolean;
	/** Classes for the link. A gap before a new group (`mt-3.5`) goes here. */
	className?: string;
};

/** A sidebar link. The order and groups of the sidebar are fixed by the page that lists them. */
export function NavItem({
	label,
	icon: Icon,
	active = false,
	collapsed = false,
	className,
	...rest
}: Readonly<NavItemProps>) {
	const link = (
		<AriaLink
			{...rest}
			{...(active ? { "aria-current": "page" as const } : {})}
			{...(collapsed ? { "aria-label": label } : {})}
			className={cn(
				"rounded-control text-body flex h-10 items-center gap-3 no-underline max-md:min-h-11",
				"hover:bg-soft hover:text-ink transition-colors duration-(--dur-fast) ease-out hover:no-underline",
				collapsed ? "w-10 justify-center" : "px-3",
				active ? "bg-soft text-ink font-semibold" : "text-ink-2 font-medium",
				className,
			)}
		>
			<Icon
				aria-hidden="true"
				className={cn("size-4.5 shrink-0", active && "text-accent")}
			/>
			{!collapsed && label}
		</AriaLink>
	);
	return collapsed ?
			<Tooltip
				text={label}
				placement="right"
			>
				{link}
			</Tooltip>
		:	link;
}
