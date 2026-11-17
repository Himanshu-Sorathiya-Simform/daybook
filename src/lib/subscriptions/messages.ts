import { tz } from "@date-fns/tz";
import { format, parse } from "date-fns";

import { TRANSACTION_MESSAGES } from "@/lib/transactions/schemas";

/** F05 section 8's messages, and the API-only ones a client sees only when it breaks a rule.
 * Messages that name a date are functions below, so the server and the form write the same
 * words. */
export const SUBSCRIPTION_MESSAGES = {
	nameRequired: "Enter a name, like Netflix or Rent.",
	nameTooLong: "Use 60 characters or fewer.",
	amountZero: TRANSACTION_MESSAGES.amountZero,
	amountWhole: TRANSACTION_MESSAGES.amountWhole,
	currency: TRANSACTION_MESSAGES.currency,
	currencyWithAmount: TRANSACTION_MESSAGES.currencyWithAmount,
	cadenceRequired: "Choose how often it repeats.",
	everyWeeks: "Enter how many weeks, from 1 to 52.",
	everyMonths: "Enter how many months, from 1 to 24.",
	categoryRequired: "Choose a category.",
	date: TRANSACTION_MESSAGES.date,
	instant: TRANSACTION_MESSAGES.instant,
	id: TRANSACTION_MESSAGES.id,
	idInFuture: TRANSACTION_MESSAGES.idInFuture,
	systemField: TRANSACTION_MESSAGES.systemField,
	createdAtFixed: TRANSACTION_MESSAGES.createdAtFixed,
	createdAtInFuture: TRANSACTION_MESSAGES.createdAtInFuture,
	changeTooOld: "This change is too old to apply. Discard it and make it again.",
	changeInFuture: "The change time can't be in the future.",
	endBeforeStart: "The end date can't be before the start date.",
	skipNotUpcoming: "Only an upcoming charge can be skipped.",
	skipEdited:
		"This charge was edited, so it stays. Delete it in Transactions to skip it.",
	unskipPassed: "This charge date has passed, so it can't be brought back.",
	pauseFrom: "Choose a date with a charge to pause from.",
	doubleChargeSkip: "Choose a date with a charge to skip.",
	cannotUndo: "This change can't be undone any more.",
	notFound: "This Subscription was deleted on another device.",
	conflict: "This Subscription changed on another device.",
	nothingToChange: TRANSACTION_MESSAGES.nothingToChange,
	boolean: "Send true or false.",
	undo: 'Send "create", the only kind of undo.',
	notOnCreate: "Add the Subscription first, then change this.",
	alsoPastWithValue: "Send this with a name or category change.",
	skipDueOnWithSchedule: "Send this with a start or cadence change.",
	backfillGapWithEnd: "Send this with an end date change.",
	skipBoth: "Send skipDueOn or unskipDueOn, not both.",
	month: "Use a month as YYYY-MM.",
	monthsOrder: "The first month can't be after the last.",
	monthsSpan: "Ask for at most 24 months at a time.",
} as const;

const UTC = tz("UTC");
const read = (date: string) => parse(date, "yyyy-MM-dd", new Date(0), { in: UTC });

/** "5 Nov", as a message writes a day in the year it is about. */
export function shortDay(date: string): string {
	return format(read(date), "d MMM", { in: UTC });
}

/** "2 Nov 2028", as a message writes a limit. */
export function fullDay(date: string): string {
	return format(read(date), "d MMM yyyy", { in: UTC });
}

/** "Choose a date from 2 Nov 2016 to 2 Nov 2027." (F05 section 8, D-257). */
export function startDateRangeMessage(min: string, max: string): string {
	return `Choose a date from ${fullDay(min)} to ${fullDay(max)}.`;
}

/** "Choose a date after 5 Nov." (F05 section 8, BR-F05-29). */
export function pauseUntilAfterMessage(after: string): string {
	return `Choose a date after ${shortDay(after)}.`;
}

/** "Choose a date up to 2 Nov 2028." (F05 section 8, BR-F05-29). */
export function pauseUntilLimitMessage(limit: string): string {
	return `Choose a date up to ${fullDay(limit)}.`;
}

/** "Choose an end date up to 2 Nov 2036.", for an end date past ten years (F05 section 3). */
export function endDateLimitMessage(limit: string): string {
	return `Choose an end date up to ${fullDay(limit)}.`;
}

/** "Choose months from Nov 2016 to Nov 2036.", for a months read outside 120 months. */
export function monthsWindowMessage(first: string, last: string): string {
	const text = (month: string) =>
		format(
			parse(`${month}-01`, "yyyy-MM-dd", new Date(0), { in: UTC }),
			"MMM yyyy",
			{
				in: UTC,
			},
		);
	return `Choose months from ${text(first)} to ${text(last)}.`;
}
