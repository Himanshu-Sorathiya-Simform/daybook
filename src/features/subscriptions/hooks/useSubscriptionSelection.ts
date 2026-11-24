import { useState } from "react";

import type { ExpenseCategory } from "@/lib/subscriptions/model";
import { filterByCategory, isFilterable } from "../lib/category-filter";
import type { SubscriptionList } from "../lib/types";

/**
 * What the page has selected and the category it is narrowed to (BR-F05-21, BR-F05-38,
 * BR-F05-50). A Subscription that is gone from the list is no longer selected, and stays
 * unselected if it comes back; a category that has lost its last Subscription filters nothing
 * any more and clears. Both are set while rendering, React's pattern for state that follows what
 * was read. `markedDue` is the date of the calendar item the selection came from, which the
 * panel's timeline marks while that Subscription stays selected.
 */
export function useSubscriptionSelection(list: SubscriptionList | undefined) {
	const [picked, setPicked] = useState<string | null>(null);
	const [marked, setMarked] = useState<{ id: string; date: string } | null>(null);
	const [filtered, setFiltered] = useState<ExpenseCategory | null>(null);

	const gone =
		list !== undefined
		&& picked !== null
		&& !list.items.some((item) => item.id === picked);
	if (gone) {
		setPicked(null);
		setMarked(null);
	}
	const selected = gone ? null : picked;

	const stale =
		filtered !== null && list !== undefined && !isFilterable(list, filtered);
	if (stale) setFiltered(null);
	const category = stale ? null : filtered;
	const shown =
		list && category !== null ? filterByCategory(list, category) : list;

	/** Selects a Subscription from the list, a link or the keyboard: no calendar date marked. */
	const choose = (id: string | null) => {
		setPicked(id);
		setMarked(null);
	};

	/** Drops a filter that would hide `subscription`, as a deep link or a new write does. */
	const reveal = (subscription: { category: ExpenseCategory } | undefined) => {
		if (
			subscription
			&& category !== null
			&& subscription.category !== category
		) {
			setFiltered(null);
		}
	};

	/** A press on a category of the panel's summary: filter to it, or clear it when it already is
	 * the filter. A selection the filter would hide clears with it. */
	const filterTo = (next: ExpenseCategory) => {
		const target = next === category ? null : next;
		setFiltered(target);
		const item = list?.items.find((each) => each.id === selected);
		if (target !== null && item && item.category !== target) choose(null);
	};

	return {
		selected,
		markedDue: marked?.date ?? null,
		category,
		shown,
		choose,
		reveal,
		filterTo,
		clearFilter: () => setFiltered(null),
		/** A press on a calendar item: its Subscription is selected and its date marked. */
		markCharge: (id: string, date: string) => {
			setPicked(id);
			setMarked({ id, date });
		},
	};
}
