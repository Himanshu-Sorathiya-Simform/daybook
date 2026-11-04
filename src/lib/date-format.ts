/** A calendar date's instant for formatting: noon UTC, formatted in UTC, so no time zone or
 * daylight-saving change can move it to the day before or after (TIME-10). */
const asInstant = (date: string) => new Date(`${date}T12:00:00Z`);

/**
 * F02's short date (BR-F02-19): `{ day: 'numeric', month: 'short' }` in `dateLocale`, adding the
 * year outside the current year, as "6 Oct" or "6 Oct 2025" for `en-IN`. `today` is the
 * profile's today (TIME-5), which decides the current year.
 */
export function formatShortDate(
	date: string,
	{ dateLocale, today }: { dateLocale: string; today: string },
): string {
	const otherYear = date.slice(0, 4) !== today.slice(0, 4);
	return new Intl.DateTimeFormat(dateLocale, {
		day: "numeric",
		month: "short",
		...(otherYear ? { year: "numeric" } : {}),
		timeZone: "UTC",
	}).format(asInstant(date));
}

/**
 * F02's list day header (BR-F02-19): `{ weekday: 'short', day: 'numeric', month: 'short' }` in
 * `dateLocale`, adding the year outside the current year, as "Sat, 31 Oct" or
 * "Sat, 31 Oct 2025" for `en-IN`. `today` is the profile's today (TIME-5).
 */
export function formatDayHeader(
	date: string,
	{ dateLocale, today }: { dateLocale: string; today: string },
): string {
	const otherYear = date.slice(0, 4) !== today.slice(0, 4);
	return new Intl.DateTimeFormat(dateLocale, {
		weekday: "short",
		day: "numeric",
		month: "short",
		...(otherYear ? { year: "numeric" } : {}),
		timeZone: "UTC",
	}).format(asInstant(date));
}

/** F02's time (BR-F02-19): `{ hour: 'numeric', minute: '2-digit' }` in `dateLocale`'s hour
 * cycle, read in the profile zone (TIME-4), as "11:40 am" for `en-IN`. `instant` is an ISO
 * 8601 instant or a `Date`. */
export function formatTime(
	instant: string | Date,
	{ dateLocale, timezone }: { dateLocale: string; timezone: string },
): string {
	return new Intl.DateTimeFormat(dateLocale, {
		hour: "numeric",
		minute: "2-digit",
		timeZone: timezone,
	}).format(new Date(instant));
}
