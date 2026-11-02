import { z } from "zod";

import { CURRENCY_EXPONENTS, type CurrencyCode } from "@/lib/currency";
import {
	dateLocaleOf,
	isCountry,
	isValidZone,
	isZoneOf,
	numberLocaleOf,
	type WeekStart,
} from "@/lib/geo";

/** F02 section 8's messages for the profile fields. */
export const PROFILE_MESSAGES = {
	countryRequired: "Choose your country.",
	countryUnknown: "Choose a country from the list.",
	currency: "Choose one of the listed currencies.",
	timezoneInCountry: "Choose a time zone in your country.",
	weekStart: "Choose the first day of your week.",
} as const;

export const WEEK_STARTS = [
	"monday",
	"sunday",
	"saturday",
] as const satisfies readonly WeekStart[];

const CURRENCY_CODES = Object.keys(CURRENCY_EXPONENTS) as [
	CurrencyCode,
	...CurrencyCode[],
];

/**
 * Onboarding's body (`POST /api/profile`, BR-F02-08): a country from the geo module, a MON-2
 * currency, one of that country's own zones (D-211) and one of the three week starts. A
 * missing or empty country asks for one; any other unknown value asks for one from the list.
 * The zone is checked against the country only when the country is valid, and otherwise must
 * still be a zone Daybook knows.
 */
export const profileCreateSchema = z
	.strictObject({
		country: z
			.string({ error: PROFILE_MESSAGES.countryRequired })
			.min(1, { error: PROFILE_MESSAGES.countryRequired, abort: true })
			.refine(isCountry, { error: PROFILE_MESSAGES.countryUnknown }),
		currency: z.enum(CURRENCY_CODES, { error: PROFILE_MESSAGES.currency }),
		timezone: z
			.string({ error: PROFILE_MESSAGES.timezoneInCountry })
			.refine(isValidZone, { error: PROFILE_MESSAGES.timezoneInCountry }),
		weekStart: z.enum(WEEK_STARTS, { error: PROFILE_MESSAGES.weekStart }),
	})
	.superRefine((body, context) => {
		// A failed refine above does not stop this one, so it skips what they already refused.
		const checkable = isCountry(body.country) && isValidZone(body.timezone);
		if (checkable && !isZoneOf(body.country, body.timezone)) {
			context.addIssue({
				code: "custom",
				path: ["timezone"],
				message: PROFILE_MESSAGES.timezoneInCountry,
			});
		}
	});

export type ProfileCreate = z.output<typeof profileCreateSchema>;

/** The stored profile fields the API shows (F02 section 3). */
export type ProfileFields = {
	country: string;
	currency: CurrencyCode;
	timezone: string;
	weekStart: WeekStart;
};

/** The `profile` block of `/api/me` and `/api/profile` (BR-F02-25, D-506): the stored fields
 * and the two locales derived from the country (BR-F02-18). */
export type ProfileBlock = ProfileFields & {
	numberLocale: string;
	dateLocale: string;
};

/** Every `/api/profile` answer (BR-F02-26, D-506). */
export type ProfileAnswer = {
	profile: ProfileBlock;
	version: number;
	currencyEditable: boolean;
};

export function profileBlock({
	country,
	currency,
	timezone,
	weekStart,
}: ProfileFields): ProfileBlock {
	return {
		country,
		currency,
		timezone,
		weekStart,
		numberLocale: numberLocaleOf(country),
		dateLocale: dateLocaleOf(country),
	};
}
