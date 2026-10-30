import type { CurrencyCode } from "../currency";
import { GEO_DATA } from "./data";
import type { GeoCountry, GeoZone, WeekStart } from "./types";

export type { GeoCountry, GeoZone, WeekStart } from "./types";

/** The geo module (F02, section 3; D-209): countries, their zones and defaults, read by the
 * browser (onboarding, settings) and the server (profile checks). Data only, from the
 * committed `data.ts`; nothing is downloaded at runtime. */

/** The one valid zone with no country. */
export const UTC = "UTC";

const COUNTRY_OF_ZONE: ReadonlyMap<string, string> = new Map(
	Object.entries(GEO_DATA.countries).flatMap(([country, { zones }]) =>
		zones.map((zone) => [zone.name, country] as const),
	),
);

/** Every country code, sorted. */
export function countryCodes(): string[] {
	return Object.keys(GEO_DATA.countries).sort();
}

export function isCountry(code: unknown): code is string {
	return typeof code === "string" && Object.hasOwn(GEO_DATA.countries, code);
}

function country(code: string): GeoCountry {
	if (!isCountry(code)) throw new RangeError(`Unknown country: ${code}`);
	return GEO_DATA.countries[code]!;
}

/** The country's zones in `zone.tab` order. */
export function zonesOf(code: string): readonly GeoZone[] {
	return country(code).zones;
}

/** Whether `zone` is one of the country's own zones (D-211). */
export function isZoneOf(code: string, zone: unknown): boolean {
	return (
		isCountry(code)
		&& typeof zone === "string"
		&& COUNTRY_OF_ZONE.get(zone) === code
	);
}

/** Whether a profile may hold `zone`: a `zone.tab` name, or `UTC` (F02, section 3). */
export function isValidZone(zone: unknown): zone is string {
	return typeof zone === "string" && (zone === UTC || COUNTRY_OF_ZONE.has(zone));
}

/** The country `zone` belongs to, or `null` for `UTC` and any other name. */
export function countryOfZone(zone: string): string | null {
	return COUNTRY_OF_ZONE.get(zone) ?? null;
}

/**
 * A device's zone as the geo module names it (BR-F02-03): a `zone.tab` name as it is, `UTC`
 * as it is, a legacy name through the alias table (`Asia/Calcutta` is `Asia/Kolkata`), or
 * `null` when it is in none of them (`Etc/GMT-4`). Aliases never apply to `zone.tab` names.
 */
export function canonicalZone(zone: string): string | null {
	if (zone === UTC || COUNTRY_OF_ZONE.has(zone)) return zone;
	return Object.hasOwn(GEO_DATA.aliases, zone) ? GEO_DATA.aliases[zone]! : null;
}

export function defaultZoneOf(code: string): string {
	return country(code).defaultZone;
}

export function currencyOf(code: string): CurrencyCode {
	return country(code).currency;
}

export function weekStartOf(code: string): WeekStart {
	return country(code).weekStart;
}

/** The country's number format (BR-F02-18), for example `de-DE-u-nu-latn`. */
export function numberLocaleOf(code: string): string {
	return country(code).numberLocale;
}

/** The country's date format: English names, the country's day order and clock (BR-F02-18). */
export function dateLocaleOf(code: string): string {
	country(code);
	return `en-${code}`;
}

/** The fields a country decides (BR-F02-04 to BR-F02-06). The time zone is the device's when
 * it belongs to the country, otherwise the country's default (BR-F02-05). */
export type CountryDefaults = {
	currency: CurrencyCode;
	timezone: string;
	weekStart: WeekStart;
};

export function defaultsFor(
	code: string,
	deviceZone: string | null = null,
): CountryDefaults {
	const zone = deviceZone === null ? null : canonicalZone(deviceZone);
	return {
		currency: currencyOf(code),
		timezone: zone !== null && isZoneOf(code, zone) ? zone : defaultZoneOf(code),
		weekStart: weekStartOf(code),
	};
}

export type Prefill = CountryDefaults & { country: string };

/** The region of a BCP 47 language tag once maximized (`en` is `en-Latn-US`), or `null` for
 * a tag `Intl` cannot read. */
function regionOf(language: string | undefined): string | null {
	if (!language) return null;
	try {
		return new Intl.Locale(language).maximize().region ?? null;
	} catch {
		return null;
	}
}

/**
 * Onboarding's pre-fill from the device (BR-F02-03, D-208): the country whose zones include
 * the device's zone, else the region of the browser's language when it is a country here, else
 * nothing (`null`), and the user must choose. The other fields follow from the country.
 */
export function prefill(device: {
	zone: string | undefined;
	language: string | undefined;
}): Prefill | null {
	const zone = device.zone === undefined ? null : canonicalZone(device.zone);
	const fromZone = zone === null ? null : countryOfZone(zone);
	const fromLanguage = regionOf(device.language);
	const code = fromZone ?? (isCountry(fromLanguage) ? fromLanguage : null);
	if (code === null) return null;
	return { country: code, ...defaultsFor(code, zone) };
}
