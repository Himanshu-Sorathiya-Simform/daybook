import { tz } from "@date-fns/tz";
import {
	addMonths,
	differenceInCalendarMonths,
	endOfMonth,
	format,
	parse,
} from "date-fns";

import { todayIn } from "@/lib/time";

/** A calendar month written `YYYY-MM`, as Budgets name every month (F04 section 3). Months are
 * read and written in UTC, so the machine's zone never moves them (TIME-10). */
export type Month = string;

const UTC = tz("UTC");
const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

/** How far back and ahead a new change, a one-month limit and the page's month may go (D-247,
 * D-566). */
export const MONTHS_BACK = 36;
export const MONTHS_AHEAD = 12;

/** The months a restoring write may hold (BR-F04-33): wider than the range, since it puts back
 * months that already existed. */
export const RESTORE_FIRST: Month = "2000-01";
export const RESTORE_LAST: Month = "2099-12";

const readMonth = (month: Month) =>
	parse(`${month}-01`, "yyyy-MM-dd", new Date(0), { in: UTC });
const writeMonth = (date: Date) => format(date, "yyyy-MM", { in: UTC });

/** Whether `value` is a month written exactly as `YYYY-MM`, January to December. */
export function isMonth(value: unknown): value is Month {
	return typeof value === "string" && MONTH.test(value);
}

/** The month `count` months after `month`, or before it when `count` is negative. */
export function shiftMonth(month: Month, count: number): Month {
	return writeMonth(addMonths(readMonth(month), count, { in: UTC }));
}

/** How many months run from `from` to `to`: 0 for the same month, −1 when `to` is the month
 * before. */
export function monthsFrom(from: Month, to: Month): number {
	return differenceInCalendarMonths(readMonth(to), readMonth(from), { in: UTC });
}

/** `count` months in order, starting at `first`. */
export function monthsStarting(first: Month, count: number): Month[] {
	return Array.from({ length: count }, (_, index) => shiftMonth(first, index));
}

/** The month of a `YYYY-MM-DD` date. */
export function monthOf(date: string): Month {
	return date.slice(0, 7);
}

/** The first day of `month`, as `YYYY-MM-DD`. */
export function firstDayOf(month: Month): string {
	return `${month}-01`;
}

/** The last day of `month`, as `YYYY-MM-DD`: 2026-02-28, 2028-02-29, 2026-10-31. */
export function lastDayOf(month: Month): string {
	return format(endOfMonth(readMonth(month), { in: UTC }), "yyyy-MM-dd", {
		in: UTC,
	});
}

/** The month of `now` in `timezone`: the user's current month (TIME-5). */
export function currentMonth(timezone: string, now: Date): Month {
	return monthOf(todayIn(timezone, now));
}

export type MonthRange = { first: Month; last: Month };

/** The months from 36 before `current` to 12 after it, both included (D-247): on golden,
 * 2023-11 to 2027-11. */
export function monthRange(current: Month): MonthRange {
	return {
		first: shiftMonth(current, -MONTHS_BACK),
		last: shiftMonth(current, MONTHS_AHEAD),
	};
}

/** Whether `month` lies in `range`, both ends included. `YYYY-MM` sorts as text. */
export function inRange(month: Month, range: MonthRange): boolean {
	return month >= range.first && month <= range.last;
}
