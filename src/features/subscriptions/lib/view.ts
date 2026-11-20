/** Where the device remembers List, Calendar or Table (BR-F05-21). */
export const VIEW_KEY = "daybook.subscriptions.view";

/** The views the switch offers, List first, which is also the default. */
export const SUBSCRIPTION_VIEWS = ["list", "calendar", "table"] as const;

export type SubscriptionsView = (typeof SUBSCRIPTION_VIEWS)[number];

/** The view that shows: a stored Table shows the list below 768 px, where the table is not
 * offered (BR-F05-21, D-512). */
export function shownView(
	view: SubscriptionsView,
	isWide: boolean,
): SubscriptionsView {
	return view === "table" && !isWide ? "list" : view;
}

/** The views the switch offers: no Table below 768 px (BR-F05-21). */
export function offeredViews(isWide: boolean): SubscriptionsView[] {
	return SUBSCRIPTION_VIEWS.filter((view) => isWide || view !== "table");
}
