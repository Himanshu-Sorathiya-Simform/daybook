import { TZDate, tz } from "@date-fns/tz";
import { format, isValid } from "date-fns";

import { isIsoDate } from "@/lib/time";

const TIME = /^([01]\d|2[0-3]):([0-5]\d)$/;

/**
 * The form's date and time in the profile zone as a Transaction's `occurredAt` and `occurredOn`
 * (BR-F03-06). `occurredAt` is the UTC instant with seconds at zero; `occurredOn` is the chosen
 * date. A time in a daylight-saving gap moves forward by the gap, so 02:30 becomes 03:30; a time
 * that occurs twice takes the earlier instant (D-221). `TZDate` does both.
 */
export function toOccurred(
	date: string,
	time: string,
	timezone: string,
): { occurredAt: string; occurredOn: string } {
	const clock = TIME.exec(time);
	if (!isIsoDate(date) || !clock) {
		throw new RangeError(
			`Expected a YYYY-MM-DD date and an HH:mm time, got ${date} ${time}.`,
		);
	}
	// Both are checked above, so every part is a whole number in range.
	const toInt = (part: string | undefined) => Number.parseInt(part as string, 10);
	const [year, month, day] = date.split("-").map(toInt) as [
		number,
		number,
		number,
	];
	const instant = new TZDate(
		year,
		month - 1,
		day,
		toInt(clock[1]),
		toInt(clock[2]),
		timezone,
	);
	if (!isValid(instant)) throw new RangeError(`Unknown time zone: ${timezone}.`);
	return {
		occurredAt: format(instant, "yyyy-MM-dd'T'HH:mm:ss'Z'", { in: tz("UTC") }),
		occurredOn: date,
	};
}

/** An instant's hours and minutes in the profile zone, as the time field shows it (D-238). */
export function localTime(occurredAt: string, timezone: string): string {
	const instant = new Date(occurredAt);
	if (!isValid(instant)) throw new RangeError(`Not an instant: ${occurredAt}.`);
	return format(instant, "HH:mm", { in: tz(timezone) });
}
