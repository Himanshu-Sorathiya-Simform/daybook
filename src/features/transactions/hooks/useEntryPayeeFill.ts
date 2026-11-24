import { useState } from "react";

import { categoriesFor } from "@/lib/transactions/model";
import type { EntryField, EntryType, EntryValues } from "../lib/entry";
import type { PayeeItem } from "../lib/suggestions";

export type EntryPayeeFillOptions = {
	/** The type as it stands. */
	typeNow: () => EntryType;
	setType: (type: EntryType) => void;
	setPayee: (payee: string) => void;
	setCategory: (category: EntryValues["category"]) => void;
	/** Clears what the server said about a field once it changes. */
	clear: (field: EntryField) => void;
};

/**
 * The entry dialog's Payee and Category working together (BR-F03-45, D-89, BR-F03-02): choosing
 * a payee from the list fills the payee and its last category when that fits the type, and
 * `hint` says so, "From your last Swiggy Transaction", until the category changes by hand.
 * Moving between income and expense or refund clears the category and its hint; expense and
 * refund share theirs. `expanded` is whether the category tiles show them all.
 */
export function useEntryPayeeFill({
	typeNow,
	setType,
	setPayee,
	setCategory,
	clear,
}: EntryPayeeFillOptions) {
	const [filledFrom, setFilledFrom] = useState<string | null>(null);
	const [expanded, setExpanded] = useState(false);

	/** A payee chosen from the list: it fills the payee, and its last category when that fits
	 * the type, replacing one already chosen. */
	const choosePayee = (item: PayeeItem) => {
		setPayee(item.payee);
		clear("payee");
		if (!categoriesFor(typeNow()).includes(item.lastCategory)) return;
		setCategory(item.lastCategory);
		clear("category");
		setFilledFrom(item.payee);
	};

	/** A new type: moving between income and expense or refund clears the category and its
	 * hint; expense and refund share theirs. */
	const changeType = (type: EntryType) => {
		const before = typeNow();
		setType(type);
		if (categoriesFor(before) === categoriesFor(type)) return;
		setCategory(null);
		setFilledFrom(null);
		setExpanded(false);
	};

	return {
		choosePayee,
		changeType,
		hint:
			filledFrom === null ? undefined : (
				`From your last ${filledFrom} Transaction`
			),
		/** The category was chosen by hand: the hint goes. */
		forget: () => setFilledFrom(null),
		/** "Save and add another": the next entry starts clean. */
		reset: () => {
			setFilledFrom(null);
			setExpanded(false);
		},
		expanded,
		setExpanded,
	};
}
