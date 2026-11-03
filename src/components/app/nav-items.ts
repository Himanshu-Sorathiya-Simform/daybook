import {
	ArrowLeftRight,
	BookOpen,
	ChartColumn,
	FileText,
	LayoutDashboard,
	Lightbulb,
	type LucideIcon,
	Repeat,
	Settings,
	Target,
	TrendingUp,
	Wallet,
} from "lucide-react";

/** One place the navigation opens. */
export type NavDestination = {
	label: string;
	href: string;
	icon: LucideIcon;
	/** The first item of a sidebar group after the first one, drawn with a gap before it. */
	groupStart?: boolean;
};

const DASHBOARD: NavDestination = {
	label: "Dashboard",
	href: "/dashboard",
	icon: LayoutDashboard,
};
const TRANSACTIONS: NavDestination = {
	label: "Transactions",
	href: "/transactions",
	icon: ArrowLeftRight,
};
const BUDGETS: NavDestination = { label: "Budgets", href: "/budgets", icon: Wallet };

/** The sidebar's items above Settings, in the root spec's order (section 4), grouped as the
 * design draws them. */
export const SIDEBAR_ITEMS: readonly NavDestination[] = [
	DASHBOARD,
	TRANSACTIONS,
	BUDGETS,
	{ label: "Subscriptions", href: "/subscriptions", icon: Repeat },
	{ label: "Goals", href: "/goals", icon: Target, groupStart: true },
	{ label: "Investments", href: "/investments", icon: TrendingUp },
	{ label: "Analytics", href: "/analytics", icon: ChartColumn, groupStart: true },
	{ label: "Insights", href: "/insights", icon: Lightbulb },
	{ label: "Reports", href: "/reports", icon: FileText },
	{ label: "Learn", href: "/learn", icon: BookOpen, groupStart: true },
];

/** Settings, at the foot of the sidebar and the end of More. */
export const SETTINGS_ITEM: NavDestination = {
	label: "Settings",
	href: "/settings",
	icon: Settings,
};

/** The phone bottom bar's links before More. Add joins them with F03's interface (D-504). */
export const BOTTOM_BAR_ITEMS: readonly NavDestination[] = [
	DASHBOARD,
	TRANSACTIONS,
	BUDGETS,
];

/** What More holds: the rest, in the sidebar's order. */
export const MORE_ITEMS: readonly NavDestination[] = [
	...SIDEBAR_ITEMS.filter((item) => !BOTTOM_BAR_ITEMS.includes(item)),
	SETTINGS_ITEM,
];

/** Whether `pathname` is the destination's page or one under it: `/settings/profile` is
 * Settings, `/goalsx` is not Goals. */
export function isCurrent(pathname: string, href: string): boolean {
	return pathname === href || pathname.startsWith(`${href}/`);
}
