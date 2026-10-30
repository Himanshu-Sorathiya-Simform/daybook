import { tz, tzOffset } from "@date-fns/tz";
import { format, isValid } from "date-fns";

import { isIsoDate } from "@/lib/time";

const TIME = /^([01]\d|2[0-3]):([0-5]\d)$/;
const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

/**
 * The form's date and time in the profile zone as a Transaction's `occurredAt` and `occurredOn`
 * (BR-F03-06). `occurredAt` is the UTC instant with seconds at zero; `occurredOn` is the chosen
 * date. A time in a daylight-saving gap moves forward by the gap, so 02:30 becomes 03:30; a time
 * that occurs twice takes the earlier instant (D-221).
 *
 * The wall time is read as if it were UTC, and the zone's offsets a day before and a day after
 * are tried: an offset fits when the instant it gives has that same offset in the zone. Of the
 * instants that fit, the earliest wins, which is the first of a repeated time. None fits in a
 * gap, and the offset from before the change is used (D-496). The machine's own zone never
 * enters, as it does when a `TZDate` is built from parts (TIME-10).
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
	// `Date.UTC` reads years 0 to 99 as 1900 to 1999, so the year is set apart.
	const wall = new Date(0);
	wall.setUTCFullYear(year, month - 1, day);
	wall.setUTCHours(toInt(clock[1]), toInt(clock[2]), 0, 0);

	const before = tzOffset(timezone, new Date(wall.getTime() - DAY));
	const after = tzOffset(timezone, new Date(wall.getTime() + DAY));
	if (Number.isNaN(before) || Number.isNaN(after)) {
		throw new RangeError(`Unknown time zone: ${timezone}.`);
	}
	const instants = [...new Set([before, after])]
		.map((offset) => ({ offset, at: wall.getTime() - offset * MINUTE }))
		.filter(({ offset, at }) => tzOffset(timezone, new Date(at)) === offset)
		.map(({ at }) => at);
	const at =
		instants.length > 0 ?
			Math.min(...instants)
		:	wall.getTime() - before * MINUTE;
	return {
		occurredAt: format(new Date(at), "yyyy-MM-dd'T'HH:mm:ss'Z'", {
			in: tz("UTC"),
		}),
		occurredOn: date,
	};
}

/** An instant's hours and minutes in the profile zone, as the time field shows it (D-238). */
export function localTime(occurredAt: string, timezone: string): string {
	const instant = new Date(occurredAt);
	if (!isValid(instant)) throw new RangeError(`Not an instant: ${occurredAt}.`);
	return format(instant, "HH:mm", { in: tz(timezone) });
}
