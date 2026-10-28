import { tz } from "@date-fns/tz";
import { format } from "date-fns";

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
