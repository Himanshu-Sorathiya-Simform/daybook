import type { CurrencyCode } from "../currency";

/** The first day of the week a profile can hold (F02). */
export type WeekStart = "monday" | "sunday" | "saturday";

/** One IANA `zone.tab` zone and its comment, for example "Eastern (most areas)". */
export type GeoZone = { readonly name: string; readonly comment: string };

export type GeoCountry = {
	/** The country's zones in `zone.tab` order. */
	readonly zones: readonly GeoZone[];
	/** The zone pre-filled when the device's zone is not in the country (BR-F02-05). */
	readonly defaultZone: string;
	readonly weekStart: WeekStart;
	/** The pre-filled currency (BR-F02-04). */
	readonly currency: CurrencyCode;
	/** The country's number format, with Latin digits (BR-F02-18). */
	readonly numberLocale: string;
};

/** The generated geo module's data (D-209). */
export type GeoData = {
	/** What it was generated from: the tzdb release, the `cldr-core` version and the ICU that
	 * computed the number locales. */
	readonly sources: {
		readonly tzdb: string;
		readonly cldr: string;
		readonly icu: string;
	};
	/** By ISO 3166 code, every country with at least one zone. */
	readonly countries: Readonly<Record<string, GeoCountry>>;
	/** Legacy zone name to a `zone.tab` name, for names missing from `zone.tab`. */
	readonly aliases: Readonly<Record<string, string>>;
};
