import { compareCodeUnits } from "@/lib/compare";
import type { Transaction } from "@/lib/transactions/model";
import { type Formats, money, shortDate } from "./labels";

export type StripItemKind = "kept" | "today" | "off" | "new" | "more";

/** One cell of a strip of charges around today, in the dialogs that preview a change. */
export type StripItem = {
	kind: StripItemKind;
	label: string;
	amount?: string;
	note?: string;
	/** A warning, as "second charge" is while its skip is not ticked. */
	warn?: boolean;
};

/** A charge that belongs to a Subscription: it has a due date. */
export type LinkedCharge = Transaction & { dueOn: string };

/** The charges a read of a Subscription's charges holds that are linked and have a due date,
 * oldest first (BR-F05-48). */
export function linkedCharges(charges: readonly Transaction[]): LinkedCharge[] {
	return charges
		.filter((charge): charge is LinkedCharge => charge.dueOn !== null)
		.sort((a, b) => compareCodeUnits(a.dueOn, b.dueOn));
}

/** The latest charge due on or before `date`, or `null`. */
export function lastThrough(
	charges: readonly LinkedCharge[],
	date: string,
): LinkedCharge | null {
	return charges.findLast((charge) => charge.dueOn <= date) ?? null;
}

/** A charge as a cell of a strip, with its amount and a word under it. */
export function chargeCell(
	charge: LinkedCharge,
	kind: StripItem["kind"],
	f: Formats,
	note?: string,
	warn = false,
): StripItem {
	return {
		kind,
		label: shortDate(charge.dueOn, f),
		amount: money(charge.amountMinor, f),
		...(note === undefined ? {} : { note }),
		...(warn ? { warn } : {}),
	};
}
