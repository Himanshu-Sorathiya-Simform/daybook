import { formatDateYear } from "@/lib/date-format";
import { chargesAfterEnd } from "@/lib/subscriptions/rules";
import { chargeableDates, dueDates } from "@/lib/subscriptions/schedule";
import { endDateMax } from "@/lib/subscriptions/schemas";
import { shiftDays, shiftMonths } from "@/lib/time";
import type { Transaction } from "@/lib/transactions/model";
import { chargeCell, lastThrough, linkedCharges, type StripItem } from "./charges";
import { money, shortDate } from "./labels";
import type { SubscriptionItem, SubscriptionsLocale } from "./types";

/** Cancel and Change end date (BR-F05-12, BR-F05-41): when it ends, and what that deletes. */

export type CancelChoice = "now" | "next" | "later" | "earlier";

/** The dialog's own words (BR-F05-41). */
export const CANCEL_TEXT = {
	title: (name: string) => `Cancel ${name}?`,
	question: "When does it end?",
	dateLabel: "End date",
	now: "Now",
	next: "After the next charge",
	later: "On a later date",
	laterDetail: "Charges continue until then.",
	earlier: "I cancelled it earlier",
	earlierDetail: "For when Daybook kept adding charges after you'd cancelled.",
	keep: (name: string) => `Keep ${name}`,
	cancel: (name: string) => `Cancel ${name}`,
	cancelAndDelete: (count: number) =>
		`Cancel and delete ${count} ${count === 1 ? "charge" : "charges"}`,
} as const;

/** The fields the user fills in: the choice and the two dates it may take. */
export type CancelValues = {
	choice: CancelChoice;
	later: string;
	earlier: string;
};

/** What the dialog opens with (BR-F05-41): "Now", or for an ending Subscription "On a later
 * date" at its stored end date. "On a later date" starts a month from today and "I cancelled it
 * earlier" at yesterday. */
export function cancelStart(
	item: Pick<SubscriptionItem, "status" | "endDate">,
	today: string,
): CancelValues {
	const ending = item.status === "ending" && item.endDate !== null;
	return {
		choice: ending ? "later" : "now",
		later: ending ? (item.endDate as string) : shiftMonths(today, 1),
		earlier: shiftDays(today, -1),
	};
}

/** The dates each date choice may take: a later end from tomorrow to 10 years ahead, an earlier
 * one from the start date to yesterday (BR-F05-41). */
export function cancelRange(
	item: Pick<SubscriptionItem, "startDate">,
	today: string,
): { later: { min: string; max: string }; earlier: { min: string; max: string } } {
	return {
		later: { min: shiftDays(today, 1), max: endDateMax(today) },
		earlier: { min: item.startDate, max: shiftDays(today, -1) },
	};
}

export type CancelOption = {
	value: CancelChoice;
	label: string;
	description?: string;
};

/** The choices (BR-F05-41): "After the next charge" only with a next due date, and "I cancelled
 * it earlier" only when the start is before today. */
export function cancelOptions(
	item: Pick<SubscriptionItem, "nextDueOn" | "amountMinor" | "startDate">,
	f: SubscriptionsLocale,
): CancelOption[] {
	const options: CancelOption[] = [
		{
			value: "now",
			label: CANCEL_TEXT.now,
			description: `Ends today, ${shortDate(f.today, f)}. No more charges.`,
		},
	];
	if (item.nextDueOn !== null) {
		options.push({
			value: "next",
			label: CANCEL_TEXT.next,
			description: `Ends ${shortDate(item.nextDueOn, f)}. One more ${money(item.amountMinor, f)}.`,
		});
	}
	options.push({
		value: "later",
		label: CANCEL_TEXT.later,
		description: CANCEL_TEXT.laterDetail,
	});
	if (item.startDate < f.today) {
		options.push({
			value: "earlier",
			label: CANCEL_TEXT.earlier,
			description: CANCEL_TEXT.earlierDetail,
		});
	}
	return options;
}

/** The end date a choice makes. */
export function cancelEnd(
	values: CancelValues,
	item: Pick<SubscriptionItem, "nextDueOn">,
	today: string,
): string {
	switch (values.choice) {
		case "now":
			return today;
		case "next":
			return item.nextDueOn ?? today;
		case "later":
			return values.later;
		case "earlier":
			return values.earlier;
	}
}

export type CancelView = {
	endDate: string;
	/** The unedited charges after the end date, which the write deletes. */
	deleted: number;
	/** "This also deletes 1 charge dated after 30 Sept 2026: 5 Oct, ₹649.00." */
	deletionLine: string | null;
	/** "Charges you've edited stay (1)." */
	editedLine: string | null;
	strip: StripItem[];
	/** "Netflix moves to Ended. You can resume it later." */
	endingLine: string;
	/** The write, or `null` when the end date is the stored one. */
	body: { changedAt: string; endDate: string } | null;
};

/** The charges the deletion line names: up to three as "5 Oct, ₹649.00", then "and 2 more". */
function deletionLine(
	charges: readonly { dueOn: string; amountMinor: number }[],
	endDate: string,
	f: SubscriptionsLocale,
): string | null {
	if (charges.length === 0) return null;
	const noun = charges.length === 1 ? "charge" : "charges";
	const named = charges
		.slice(0, 3)
		.map(
			(charge) =>
				`${shortDate(charge.dueOn, f)}, ${money(charge.amountMinor, f)}`,
		)
		.join("; ");
	const more = charges.length > 3 ? ` and ${charges.length - 3} more` : "";
	return `This also deletes ${charges.length} ${noun} dated after ${formatDateYear(endDate, f)}: ${named}${more}.`;
}

/**
 * Cancel as it stands (BR-F05-12, BR-F05-41): the end date, the unedited charges after it that
 * the write deletes and the edited ones that stay, the strip around today and the line on what
 * happens to the Subscription. `charges` are its linked charges, whole (BR-F05-48).
 */
export function cancelView({
	item,
	values,
	charges,
	locale,
	changedAt,
}: {
	item: SubscriptionItem;
	values: CancelValues;
	charges: readonly Transaction[];
	locale: SubscriptionsLocale;
	changedAt: string;
}): CancelView {
	const endDate = cancelEnd(values, item, locale.today);
	const linked = linkedCharges(charges);
	const { deleted, editedStay } = chargesAfterEnd(linked, endDate);

	const strip: StripItem[] = [];
	const kept = lastThrough(linked, endDate);
	if (kept) strip.push(chargeCell(kept, "kept", locale, "kept"));
	for (const charge of deleted.slice(0, 2)) {
		strip.push(chargeCell(charge, "off", locale, "deleted", true));
	}
	strip.push({ kind: "today", label: "Today" });
	// The charges still to come on this schedule, with no end date of its own, up to the new one.
	const ahead = chargeableDates(
		{ ...item, endDate: null },
		shiftDays(locale.today, 1),
		endDate < shiftMonths(locale.today, 240) ? endDate : (
			shiftMonths(locale.today, 240)
		),
	).filter((date) => !item.skips.includes(date));
	ahead.slice(0, 2).forEach((date, at) => {
		strip.push({
			kind: "new",
			label: shortDate(date, locale),
			amount: money(item.amountMinor, locale),
			...(at === ahead.length - 1 ? { note: "last" } : {}),
		});
	});
	const after = dueDates(
		item,
		shiftDays(endDate, 1),
		shiftMonths(endDate, 240),
	)[0];
	if (after !== undefined) {
		strip.push({
			kind: "kept",
			label: `${shortDate(after, locale)} on`,
			note: "no charges",
		});
	}

	return {
		endDate,
		deleted: deleted.length,
		deletionLine: deletionLine(deleted, endDate, locale),
		editedLine:
			editedStay > 0 ? `Charges you've edited stay (${editedStay}).` : null,
		strip,
		endingLine:
			endDate <= locale.today ?
				`${item.name} moves to Ended. You can resume it later.`
			:	`${item.name} shows "Ends ${formatDateYear(endDate, locale)}" until then, then moves to Ended.`,
		body: endDate === item.endDate ? null : { changedAt, endDate },
	};
}
