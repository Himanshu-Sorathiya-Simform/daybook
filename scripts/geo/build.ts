import { compareCodeUnits } from "../../src/lib/compare";
import type { CurrencyCode } from "../../src/lib/currency";
import type {
	GeoCountry,
	GeoData,
	GeoZone,
	WeekStart,
} from "../../src/lib/geo/types";

/** The geo module's rules (F02, section 3; D-209, D-210, D-214). Pure: `generate.ts` reads the
 * pinned sources and writes the result. */

/** One `zone.tab` row. */
export type ZoneRow = { country: string; zone: string; comment: string };

/**
 * Reads IANA `zone.tab`: tab-separated country code, coordinates, zone name and an optional
 * comment, one zone per line, with `#` lines as comments. Each zone has exactly one country.
 */
export function parseZoneTab(text: string): ZoneRow[] {
	const rows: ZoneRow[] = [];
	const seen = new Set<string>();
	for (const [index, line] of text.split("\n").entries()) {
		if (line === "" || line.startsWith("#")) continue;
		const [country, , zone, comment = ""] = line.split("\t");
		if (!country || !/^[A-Z]{2}$/.test(country) || !zone) {
			throw new Error(`zone.tab line ${index + 1} is not a zone row: ${line}`);
		}
		if (seen.has(zone)) throw new Error(`zone.tab lists ${zone} twice`);
		seen.add(zone);
		rows.push({ country, zone, comment });
	}
	return rows;
}

/**
 * Reads IANA `backward`: `Link TARGET NAME` lines, with an optional `#= PREFERRED` comment
 * naming the target to use where a link to a link is meant. Returns legacy name to target,
 * the preferred target where one is given.
 */
export function parseBackward(text: string): Map<string, string> {
	const links = new Map<string, string>();
	for (const [index, line] of text.split("\n").entries()) {
		const [code, comment] = splitComment(line);
		const fields = code.trim().split(/\s+/);
		if (fields[0] !== "Link") continue;
		const [, target, name] = fields;
		if (!target || !name || fields.length !== 3) {
			throw new Error(`backward line ${index + 1} is not a Link: ${line}`);
		}
		const preferred = /^=\s*(\S+)/.exec(comment.trim())?.[1];
		links.set(name, preferred ?? target);
	}
	return links;
}

function splitComment(line: string): [string, string] {
	const hash = line.indexOf("#");
	return hash === -1 ? [line, ""] : [line.slice(0, hash), line.slice(hash + 1)];
}

/** Zone abbreviations `backward` links to one country's zone although they name an offset,
 * not a place (D-209): `EST` would pre-fill Panama and `CET` Belgium. They are not aliases, so
 * a device reporting one counts as unknown and its language decides the country. */
export const ABBREVIATIONS: ReadonlySet<string> = new Set([
	"CET",
	"EET",
	"EST",
	"HST",
	"MET",
	"MST",
	"WET",
]);

/**
 * Legacy names a browser may report, mapped to a `zone.tab` name (BR-F02-03). A name that is
 * itself in `zone.tab` is never an alias, because `backward` links some countries' own zones
 * to another country's (`Asia/Kuwait` to `Asia/Riyadh`), and neither is an abbreviation in
 * `ABBREVIATIONS`. Chains are followed; a name whose chain ends outside `zone.tab` (`GMT`,
 * `Etc/UCT`) is left out, since it names no country.
 */
export function buildAliases(
	links: ReadonlyMap<string, string>,
	zoneNames: ReadonlySet<string>,
): Record<string, string> {
	const aliases: Record<string, string> = {};
	for (const name of [...links.keys()].sort(compareCodeUnits)) {
		if (zoneNames.has(name) || ABBREVIATIONS.has(name)) continue;
		let target = links.get(name);
		const visited = new Set([name]);
		while (
			target !== undefined
			&& !zoneNames.has(target)
			&& !visited.has(target)
		) {
			visited.add(target);
			target = links.get(target);
		}
		if (target !== undefined && zoneNames.has(target)) aliases[name] = target;
	}
	return aliases;
}

/** CLDR `weekData.firstDay` value to a week start; anything but Monday, Sunday and Saturday
 * (Maldives: Friday) is Monday (D-209). `001` is CLDR's world default. */
export function weekStartFor(
	firstDay: Readonly<Record<string, string>>,
	country: string,
): WeekStart {
	const day = firstDay[country] ?? firstDay["001"];
	if (day === "sun") return "sunday";
	if (day === "sat") return "saturday";
	return "monday";
}

/** The default currency per country (BR-F02-04, D-210). Every other country gets USD. */
export const CURRENCY_BY_COUNTRY: Readonly<Partial<Record<string, CurrencyCode>>> = {
	IN: "INR",
	...Object.fromEntries(
		[
			// The 21 euro-area members.
			...["AT", "BE", "BG", "CY", "DE", "EE", "ES", "FI", "FR", "GR", "HR"],
			...["IE", "IT", "LT", "LU", "LV", "MT", "NL", "PT", "SI", "SK"],
			// Other territories that use the euro.
			...["AD", "AX", "BL", "GF", "GP", "MC", "ME", "MF", "MQ", "PM", "RE"],
			...["SM", "VA", "YT"],
		].map((code) => [code, "EUR"]),
	),
	...Object.fromEntries(["GB", "GG", "IM", "JE"].map((code) => [code, "GBP"])),
	JP: "JPY",
	KW: "KWD",
};

export function currencyFor(country: string): CurrencyCode {
	return CURRENCY_BY_COUNTRY[country] ?? "USD";
}

/**
 * The default zone of every country with more than one zone (BR-F02-05): the zone of its
 * capital, or of its most populous part where the two differ. A country with one zone uses
 * it. `zone.tab`'s first row is never used: it is often a poor guess (CA's is St Johns).
 */
export const DEFAULT_ZONES: Readonly<Record<string, string>> = {
	// No capital: McMurdo is the largest station.
	AQ: "Antarctica/McMurdo",
	AR: "America/Argentina/Buenos_Aires",
	AU: "Australia/Sydney",
	BR: "America/Sao_Paulo",
	CA: "America/Toronto",
	CD: "Africa/Kinshasa",
	CL: "America/Santiago",
	CN: "Asia/Shanghai",
	CY: "Asia/Nicosia",
	DE: "Europe/Berlin",
	// Quito, the capital, is on the mainland.
	EC: "America/Guayaquil",
	ES: "Europe/Madrid",
	// Chuuk is the most populous state; Palikir, the capital, is on Pohnpei.
	FM: "Pacific/Chuuk",
	GL: "America/Nuuk",
	ID: "Asia/Jakarta",
	KI: "Pacific/Tarawa",
	KZ: "Asia/Almaty",
	MH: "Pacific/Majuro",
	MN: "Asia/Ulaanbaatar",
	MX: "America/Mexico_City",
	MY: "Asia/Kuala_Lumpur",
	NZ: "Pacific/Auckland",
	PF: "Pacific/Tahiti",
	PG: "Pacific/Port_Moresby",
	// The West Bank's zone covers more people than Gaza's.
	PS: "Asia/Hebron",
	PT: "Europe/Lisbon",
	RU: "Europe/Moscow",
	UA: "Europe/Kyiv",
	// No capital or residents but staff: Wake has more than Midway.
	UM: "Pacific/Wake",
	US: "America/New_York",
	UZ: "Asia/Tashkent",
};

/** The supported currencies, in a fixed order, for the locale checks. */
const CURRENCIES: readonly CurrencyCode[] = [
	"INR",
	"USD",
	"EUR",
	"GBP",
	"JPY",
	"KWD",
];

/** What a clean format may hold (BR-F02-18): Latin letters, digits 0 to 9, spaces (the no-break
 * and narrow no-break ones included), `. , ' ’ % + -`, the minus sign and six currency signs.
 * Arabic currency signs and text-direction marks fail it. */
const CLEAN = /^[\p{Script=Latin}0-9\s.,'’%+\-−$€£¥￥₹]*$/u;

/** Samples with a group, decimals and a sign, so every symbol a format uses appears. */
const NUMBER = -1234567.891;

function decimalSign(parts: Intl.NumberFormatPart[]): string | undefined {
	return parts.find((part) => part.type === "decimal")?.value;
}

/** The formats a locale produces for one plain number, one percentage and every currency. */
function samples(locale: string) {
	const number = new Intl.NumberFormat(locale).formatToParts(NUMBER);
	const percent = new Intl.NumberFormat(locale, {
		style: "percent",
		minimumFractionDigits: 1,
	}).formatToParts(-0.633);
	const money = CURRENCIES.map((currency) => ({
		currency,
		parts: new Intl.NumberFormat(locale, {
			style: "currency",
			currency,
		}).formatToParts(NUMBER),
	}));
	return { number, percent, money };
}

const text = (parts: Intl.NumberFormatPart[]) =>
	parts.map((part) => part.value).join("");

/** Whether every format of `locale` passes BR-F02-18's clean check. */
export function isClean(locale: string): boolean {
	const { number, percent, money } = samples(locale);
	return [number, percent, ...money.map((entry) => entry.parts)].every((parts) =>
		CLEAN.test(text(parts)),
	);
}

/** The decimal sign a locale writes in each sample; `undefined` where it writes none. */
export type DecimalSigns = {
	number: string | undefined;
	percent: string | undefined;
	money: readonly { currency: CurrencyCode; sign: string | undefined }[];
};

/** Whether the signs agree (BR-F02-18): numbers have one, and percentages and every currency
 * with decimals use it. Yen has none, so it cannot disagree. */
export function signsAgree({ number, percent, money }: DecimalSigns): boolean {
	if (number === undefined || percent !== number) return false;
	return money.every(
		({ currency, sign }) => currency === "JPY" || sign === number,
	);
}

/** Whether `locale` writes the same decimal sign for numbers, percentages and money. */
export function isConsistent(locale: string): boolean {
	const { number, percent, money } = samples(locale);
	return signsAgree({
		number: decimalSign(number),
		percent: decimalSign(percent),
		money: money.map(({ currency, parts }) => ({
			currency,
			sign: decimalSign(parts),
		})),
	});
}

/**
 * The country's `numberLocale` (BR-F02-18, D-214): its main language from
 * `new Intl.Locale('und-<country>').maximize()` with Latin digits, kept when clean and
 * consistent for every currency, else `en-<country>-u-nu-latn`.
 */
export function numberLocaleFor(country: string): string {
	const { language } = new Intl.Locale(`und-${country}`).maximize();
	const own = `${language}-${country}-u-nu-latn`;
	return isClean(own) && isConsistent(own) ? own : `en-${country}-u-nu-latn`;
}

export type GeoSources = {
	zoneTab: string;
	backward: string;
	firstDay: Readonly<Record<string, string>>;
	versions: GeoData["sources"];
};

/**
 * Builds the geo module's data. Throws when the hand-written default table is wrong: a
 * multi-zone country without a default, a default outside its country, an entry for a country
 * with one zone, or a currency entry for a country `zone.tab` does not have.
 */
export function buildGeo(sources: GeoSources): GeoData {
	const rows = parseZoneTab(sources.zoneTab);
	const zonesByCountry = new Map<string, GeoZone[]>();
	for (const row of rows) {
		const zones = zonesByCountry.get(row.country) ?? [];
		zones.push({ name: row.zone, comment: row.comment });
		zonesByCountry.set(row.country, zones);
	}
	const problems: string[] = [];
	for (const [country, zone] of Object.entries(DEFAULT_ZONES)) {
		const zones = zonesByCountry.get(country);
		if (!zones)
			problems.push(`${country} has a default zone but no zones in zone.tab`);
		else if (zones.length === 1) {
			problems.push(`${country} has one zone, so it needs no default`);
		} else if (!zones.some((entry) => entry.name === zone)) {
			problems.push(`${country}'s default ${zone} is not one of its zones`);
		}
	}
	for (const [country, zones] of zonesByCountry) {
		if (zones.length > 1 && !(country in DEFAULT_ZONES)) {
			problems.push(`${country} has ${zones.length} zones but no default`);
		}
	}
	for (const country of Object.keys(CURRENCY_BY_COUNTRY)) {
		if (!zonesByCountry.has(country)) {
			problems.push(`${country} has a currency but no zones in zone.tab`);
		}
	}
	if (problems.length > 0) {
		const list = problems.map((p) => `  - ${p}`).join("\n");
		throw new Error(`The geo tables are wrong:\n${list}`);
	}

	const countries: Record<string, GeoCountry> = {};
	for (const country of [...zonesByCountry.keys()].sort(compareCodeUnits)) {
		const zones = zonesByCountry.get(country)!;
		countries[country] = {
			zones,
			defaultZone: DEFAULT_ZONES[country] ?? zones[0]!.name,
			weekStart: weekStartFor(sources.firstDay, country),
			currency: currencyFor(country),
			numberLocale: numberLocaleFor(country),
		};
	}
	const zoneNames = new Set(rows.map((row) => row.zone));
	return {
		sources: sources.versions,
		countries,
		aliases: buildAliases(parseBackward(sources.backward), zoneNames),
	};
}

/** The generated module's source, before Prettier. */
export function renderModule(data: GeoData): string {
	return [
		"// Generated by `pnpm geo:generate` (scripts/geo/generate.ts) from the pinned sources in",
		"// scripts/geo/sources. Do not edit by hand: change the sources or the generator, then",
		"// run it again and review the diff (D-209).",
		'import type { GeoData } from "./types";',
		"",
		`export const GEO_DATA: GeoData = ${JSON.stringify(data)};`,
		"",
	].join("\n");
}
