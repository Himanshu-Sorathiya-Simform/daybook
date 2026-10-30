import { tz } from "@date-fns/tz";
import { addDays, format, isValid, parse, subMonths } from "date-fns";

const UTC = tz("UTC");
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const readDate = (date: string) =>
	parse(date, "yyyy-MM-dd", new Date(0), { in: UTC });
const writeDate = (date: Date) => format(date, "yyyy-MM-dd", { in: UTC });

/** The calendar date of `now` in `timezone`, as `YYYY-MM-DD` (TIME-5). `now` is an instant,
 * normally the request clock (BR-P2-43); the date is read in the zone, never from the
 * machine's own zone (TIME-10). */
export function todayIn(timezone: string, now: Date): string {
	return format(now, "yyyy-MM-dd", { in: tz(timezone) });
}

/** The UTC calendar date of `now`, as `YYYY-MM-DD`. */
export function utcDate(now: Date): string {
	return todayIn("UTC", now);
}

/** Whether `text` is a real calendar date written exactly as `YYYY-MM-DD`: the pattern fixes the
 * shape, and date-fns' strict parse refuses days a month does not have. */
export function isIsoDate(text: string): boolean {
	if (!ISO_DATE.test(text)) return false;
	return isValid(readDate(text));
}

/** The calendar date `days` after `date` (before it when negative), as `YYYY-MM-DD`. Dates are
 * read and written in UTC, so the machine's zone never moves them (TIME-10). */
export function shiftDays(date: string, days: number): string {
	return writeDate(addDays(readDate(date), days, { in: UTC }));
}

/** The calendar date `months` before `date`, as `YYYY-MM-DD`. A day the earlier month lacks
 * clamps to its last day, as date-fns `subMonths` does: 2026-05-31 minus 3 months is
 * 2026-02-28 (BR-F03-62). */
export function monthsBefore(date: string, months: number): string {
	return writeDate(subMonths(readDate(date), months, { in: UTC }));
}
