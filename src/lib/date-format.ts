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
