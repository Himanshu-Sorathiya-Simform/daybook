import { tz } from "@date-fns/tz";
import { format, isValid, parse } from "date-fns";

const UTC = tz("UTC");
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

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
	const date = parse(text, "yyyy-MM-dd", new Date(0), { in: UTC });
	return isValid(date);
}
