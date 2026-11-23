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

/** What the page has to show (F05 section 6): `failed` is a failed load, or no connection with
 * nothing saved; `isEmpty` a list with no Subscription; `showPanel` a list with some. */
export function pageShape(
	list: { items: readonly unknown[] } | undefined,
	loadFailed: boolean,
): { failed: boolean; isEmpty: boolean; showPanel: boolean } {
	const isEmpty = list?.items.length === 0;
	return {
		failed: list === undefined && loadFailed,
		isEmpty,
		showPanel: list !== undefined && !isEmpty,
	};
}
