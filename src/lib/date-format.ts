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

/**
 * F02's list day header options with the year always (BR-F03-72), as the panel's Date reads:
 * "Mon, 19 Oct, 2026" for `en-IN`, whose own pattern puts a comma before the year.
 */
export function formatFullDay(
	date: string,
	{ dateLocale }: { dateLocale: string },
): string {
	return new Intl.DateTimeFormat(dateLocale, {
		weekday: "short",
		day: "numeric",
		month: "short",
		year: "numeric",
		timeZone: "UTC",
	}).format(asInstant(date));
}

/** A date with its year and no weekday, as "30 Sept 2026" for `en-IN` and "Sep 30, 2026" for
 * `en-US`: the date of an event that is not tied to a year on the page, such as the day a
 * Subscription ended (BR-F05-22). The words are the locale's own. */
export function formatDateYear(
	date: string,
	{ dateLocale }: { dateLocale: string },
): string {
	return new Intl.DateTimeFormat(dateLocale, {
		day: "numeric",
		month: "short",
		year: "numeric",
		timeZone: "UTC",
	}).format(asInstant(date));
}

/** The day and month alone, as "5 Nov" or "Nov 5": a date that comes round every year, as a
 * yearly Subscription's day does (BR-F05-24). */
export function formatDayMonth(
	date: string,
	{ dateLocale }: { dateLocale: string },
): string {
	return new Intl.DateTimeFormat(dateLocale, {
		day: "numeric",
		month: "short",
		timeZone: "UTC",
	}).format(asInstant(date));
}

/** The name of a date's weekday in `dateLocale`: "Thursday", or "Thu" when `short`. */
export function formatWeekday(
	date: string,
	{ dateLocale }: { dateLocale: string },
	style: "long" | "short" = "long",
): string {
	return new Intl.DateTimeFormat(dateLocale, {
		weekday: style,
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

/** How a month reads: F02's Month "October 2026", the short "Oct 2026", the name alone
 * "October", or the short name "Oct" (`en-IN`). */
export type MonthStyle = "long" | "short" | "name" | "shortName";

const MONTH_OPTIONS: Record<MonthStyle, Intl.DateTimeFormatOptions> = {
	long: { month: "long", year: "numeric" },
	short: { month: "short", year: "numeric" },
	name: { month: "long" },
	shortName: { month: "short" },
};

/**
 * A `YYYY-MM` month in `dateLocale` (BR-F02-19), formatted at mid-month in UTC so no time zone
 * moves it. The words are the locale's own: `en-IN` shortens September to "Sept".
 */
export function formatMonth(
	month: string,
	{ dateLocale }: { dateLocale: string },
	style: MonthStyle = "long",
): string {
	return new Intl.DateTimeFormat(dateLocale, {
		...MONTH_OPTIONS[style],
		timeZone: "UTC",
	}).format(asInstant(`${month}-15`));
}

/** A year in `dateLocale`, "2026", or "2026年" for `ja-JP`. */
export function formatYear(
	year: number,
	{ dateLocale }: { dateLocale: string },
): string {
	return new Intl.DateTimeFormat(dateLocale, {
		year: "numeric",
		timeZone: "UTC",
	}).format(asInstant(`${String(year).padStart(4, "0")}-07-01`));
}
