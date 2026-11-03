import type { ComboBoxOption } from "@/components/forms/ComboBox";
import type { SelectOption } from "@/components/forms/Select";
import { CURRENCY_EXPONENTS, type CurrencyCode } from "@/lib/currency";
import { countryCodes, type GeoZone, type WeekStart, zonesOf } from "@/lib/geo";

/** The country's English name, for example "Côte d’Ivoire" for CI (F02 section 3). */
export function countryName(code: string): string {
	return new Intl.DisplayNames(["en"], { type: "region" }).of(code) ?? code;
}

/** Every country in the geo module, sorted by English name (F02 section 6, D-511). */
export function countryOptions(): ComboBoxOption[] {
	const collator = new Intl.Collator("en");
	return countryCodes()
		.map((code) => ({ value: code, label: countryName(code) }))
		.sort((a, b) => collator.compare(a.label, b.label));
}

/** A currency's English name in sentence case, as F02 writes it: "Indian rupee", "US dollar".
 * `Intl` capitalizes every word; the first keeps its case, the rest are lowercased. */
export function currencyName(code: CurrencyCode): string {
	const [first = code, ...rest] = (
		new Intl.DisplayNames(["en"], { type: "currency" }).of(code) ?? code
	).split(" ");
	return [first, ...rest.map((word) => word.toLowerCase())].join(" ");
}

/** The six currencies (MON-2) in their MON-2 order, labelled "Indian rupee (INR)" (F02
 * section 6). */
export function currencyOptions(): SelectOption[] {
	return (Object.keys(CURRENCY_EXPONENTS) as CurrencyCode[]).map((code) => ({
		value: code,
		label: `${currencyName(code)} (${code})`,
	}));
}

/** A zone's offset from UTC at `now`, written "GMT+05:30" (F02 section 5). An engine that
 * writes UTC as plain "GMT" is given the same form. */
export function offsetLabel(zone: string, now: Date): string {
	const part = new Intl.DateTimeFormat("en", {
		timeZone: zone,
		timeZoneName: "longOffset",
	})
		.formatToParts(now)
		.find((piece) => piece.type === "timeZoneName")?.value;
	return !part || part === "GMT" ? "GMT+00:00" : part;
}

/** The city part of a zone name: its last part with underscores as spaces ("Buenos Aires"). */
export function zoneCity(name: string): string {
	return name.slice(name.lastIndexOf("/") + 1).replaceAll("_", " ");
}

/** A zone's label (F02 section 5): the city, `zone.tab`'s comment when the country has several
 * zones, and the offset at `now`. "Kolkata (GMT+05:30)", "New York, Eastern (most areas)
 * (GMT-05:00)". */
export function zoneLabel(zone: GeoZone, several: boolean, now: Date): string {
	const comment = several && zone.comment ? `, ${zone.comment}` : "";
	return `${zoneCity(zone.name)}${comment} (${offsetLabel(zone.name, now)})`;
}

/** A country's zones in `zone.tab` order, labelled at `now` (D-511). */
export function zoneOptions(country: string, now: Date): SelectOption[] {
	const zones = zonesOf(country);
	return zones.map((zone) => ({
		value: zone.name,
		label: zoneLabel(zone, zones.length > 1, now),
	}));
}

export const WEEK_START_OPTIONS: { value: WeekStart; label: string }[] = [
	{ value: "monday", label: "Monday" },
	{ value: "sunday", label: "Sunday" },
	{ value: "saturday", label: "Saturday" },
];
