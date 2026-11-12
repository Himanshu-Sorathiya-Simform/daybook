import { tz } from "@date-fns/tz";
import { getDay, parseISO } from "date-fns";

import { currencyExponent, type CurrencyCode } from "@/lib/currency";
import { formatDayHeader, formatTime } from "@/lib/date-format";
import { dateLocaleOf, numberLocaleOf, type WeekStart } from "@/lib/geo";
import { formatMoney, formatPercent, moneyParts } from "@/lib/money";
import { shiftDays, todayIn } from "@/lib/time";
import { offsetLabel, zoneCity } from "./options";

/** What onboarding's Preview shows from the four choices (F02 section 6, D-511). */
export type PreviewChoices = {
	country: string;
	currency: CurrencyCode;
	timezone: string;
	weekStart: WeekStart;
};

/** One day of "This week". */
export type PreviewDay = {
	date: string;
	/** The short weekday in the country's date format, as "Mon". */
	weekday: string;
	/** The day of the month, as "9". */
	day: string;
	isToday: boolean;
};

export type Preview = {
	/** The sample amount, split as the readout shows it: the whole part large, the rest small. */
	amount: {
		text: string;
		symbol: string;
		symbolAfter: boolean;
		/** Whether the format puts a space between the symbol and the number, as "CHF 100’000.00". */
		spaced: boolean;
		integer: string;
		fraction: string;
	};
	/** A spending amount, as "−₹1,240.50". */
	negative: string;
	/** A percentage, as "63.3%". */
	percent: string;
	/** Today in the chosen zone, as "Thu, 12 Nov". */
	day: string;
	/** The time now in the chosen zone, as "11:40 am". */
	time: string;
	/** The zone with its offset now, as "Kolkata time (GMT+05:30)". */
	zone: string;
	/** The seven days of this week, from the chosen first day. */
	week: PreviewDay[];
};

/** 1,00,000 in the currency's whole units, so the grouping shows. */
const SAMPLE_UNITS = 100_000;

/** Each week start's day number, Sunday 0, as date-fns counts them. */
const FIRST_DAY: Record<WeekStart, number> = { sunday: 0, monday: 1, saturday: 6 };

const UTC = tz("UTC");

/** A calendar date's instant for formatting: noon UTC, formatted in UTC (TIME-10). */
const asInstant = (date: string) => new Date(`${date}T12:00:00Z`);

/** −1,240.50 in the currency's minor units: −1,240.5 has no JPY form, so JPY shows −1,240. */
function negativeMinor(currency: CurrencyCode): number {
	const exponent = currencyExponent(currency);
	const half = exponent > 0 ? 5 * 10 ** (exponent - 1) : 0;
	return -(1240 * 10 ** exponent + half);
}

/**
 * The Preview at `now` (F02 section 6, D-511): amounts in the country's number format and the
 * currency, through the app's own money formatting (MON-4), then today, the time and this week
 * in the chosen zone, in the country's date format (BR-F02-19), so it shows what the app will.
 */
export function previewOf(choices: PreviewChoices, now: Date): Preview {
	const { country, currency, timezone, weekStart } = choices;
	const numberLocale = numberLocaleOf(country);
	const dateLocale = dateLocaleOf(country);

	const sample = SAMPLE_UNITS * 10 ** currencyExponent(currency);
	const parts = moneyParts(sample, currency, numberLocale);
	const literals = [parts.symbol, parts.integer, parts.fraction].reduce(
		(rest, piece) => rest.replace(piece, ""),
		parts.text,
	);

	const today = todayIn(timezone, now);
	const weekday = getDay(parseISO(today, { in: UTC }), { in: UTC });
	const first = shiftDays(today, -((weekday - FIRST_DAY[weekStart] + 7) % 7));
	const weekdayName = new Intl.DateTimeFormat(dateLocale, {
		weekday: "short",
		timeZone: "UTC",
	});
	const dayNumber = new Intl.DateTimeFormat(dateLocale, {
		day: "numeric",
		timeZone: "UTC",
	});

	return {
		amount: {
			text: parts.text,
			symbol: parts.symbol,
			symbolAfter: parts.symbolAfter,
			spaced: /\s/u.test(literals),
			integer: parts.integer,
			fraction: parts.fraction,
		},
		negative: formatMoney(negativeMinor(currency), currency, numberLocale),
		percent: formatPercent(633, 1000, numberLocale),
		day: formatDayHeader(today, { dateLocale, today }),
		time: formatTime(now, { dateLocale, timezone }),
		zone: `${zoneCity(timezone)} time (${offsetLabel(timezone, now)})`,
		week: Array.from({ length: 7 }, (_, index) => {
			const date = shiftDays(first, index);
			return {
				date,
				weekday: weekdayName.format(asInstant(date)),
				day: dayNumber.format(asInstant(date)),
				isToday: date === today,
			};
		}),
	};
}
