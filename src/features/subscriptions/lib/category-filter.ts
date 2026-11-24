import { CATEGORY_LABELS } from "@/lib/categories";
import type { ExpenseCategory } from "@/lib/subscriptions/model";
import type { SubscriptionList } from "./types";

/** The chip row's words (BR-F05-50): "Showing Entertainment" with Show all. */
export const FILTER_TEXT = {
	showing: "Showing",
	showAll: "Show all",
} as const;

/** The chip's label: the category's name. */
export const categoryChip = (category: ExpenseCategory): string =>
	CATEGORY_LABELS[category];

/**
 * Whether a category can still filter the list (BR-F05-50): the panel's summary offers the
 * categories of the Subscriptions that count in the costs, those that are not ended and have a
 * next due date. A filter on a category that has lost its last one has nothing to stand for and
 * clears.
 */
export function isFilterable(
	list: Pick<SubscriptionList, "items">,
	category: ExpenseCategory,
): boolean {
	return list.items.some(
		(item) =>
			item.category === category
			&& item.status !== "ended"
			&& item.nextDueOn !== null,
	);
}

/**
 * The list narrowed to one category (BR-F05-50): its Subscriptions in every group, the Ended
 * group included, with the upcoming charges of those Subscriptions only, so each group's
 * figure and caption stay theirs. The totals and the summary are those of every Subscription.
 */
export function filterByCategory<
	T extends Pick<SubscriptionList, "items" | "upcoming">,
>(list: T, category: ExpenseCategory): T {
	const items = list.items.filter((item) => item.category === category);
	const ids = new Set(items.map((item) => item.id));
	return {
		...list,
		items,
		upcoming: list.upcoming.filter((entry) => ids.has(entry.subscriptionId)),
	};
}
