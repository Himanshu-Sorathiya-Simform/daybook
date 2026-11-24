/** A widget's size: the number of columns it spans of 6 (F08 section 3, D-635): a third, a
 * half, two thirds or the full width. */
export const WIDGET_SIZES = [2, 3, 4, 6] as const;
export type WidgetSize = (typeof WIDGET_SIZES)[number];

export function isWidgetSize(value: unknown): value is WidgetSize {
	return (WIDGET_SIZES as readonly unknown[]).includes(value);
}

export type Widget = {
	id: string;
	title: string;
	/** The size a view gives the widget until the user changes it (BR-F08-20). */
	defaultSize: WidgetSize;
	/** The height the widget reserves before its data loads, in pixels (CLS, root 11.1). */
	height: number;
	/** Whether the onboarding panel hides it while the account is empty (BR-F08-19). */
	finance: boolean;
	/** The capability that gates it through `<Gate>` (P4), when it has one. */
	capability?: "analytics.heatmap.view";
};

/**
 * The widget registry (F08 section 3, D-109, D-280), in Overview's order. Views, lazy loading
 * and gating all read this one list. Insights (F10, M6) and Latest from Learn (F14, M7) join it
 * when those features arrive, so a stored view picks them up through normalization.
 */
export const WIDGETS = [
	{
		id: "recent",
		title: "Recent Transactions",
		defaultSize: 3,
		height: 580,
		finance: true,
	},
	{ id: "budgets", title: "Budgets", defaultSize: 3, height: 580, finance: true },
	{
		id: "categories",
		title: "Spending by category",
		defaultSize: 3,
		height: 380,
		finance: true,
	},
	{
		id: "incomeExpenses",
		title: "Income vs expenses",
		defaultSize: 3,
		height: 380,
		finance: true,
	},
	{ id: "goals", title: "Goals", defaultSize: 2, height: 330, finance: true },
	{
		id: "upcoming",
		title: "Coming up",
		defaultSize: 2,
		height: 330,
		finance: true,
	},
	{
		id: "investments",
		title: "Investments",
		defaultSize: 2,
		height: 300,
		finance: false,
	},
	{
		id: "heatmap",
		title: "Calendar heat map",
		defaultSize: 3,
		height: 360,
		finance: true,
		capability: "analytics.heatmap.view",
	},
] as const satisfies readonly Widget[];

export type WidgetId = (typeof WIDGETS)[number]["id"];

export function widgetById(id: string): (typeof WIDGETS)[number] | undefined {
	return WIDGETS.find((widget) => widget.id === id);
}

export function isWidgetId(value: unknown): value is WidgetId {
	return typeof value === "string" && widgetById(value) !== undefined;
}
