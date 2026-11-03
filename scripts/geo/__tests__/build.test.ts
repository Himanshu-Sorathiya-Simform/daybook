// @vitest-environment node
import { describe, expect, test } from "vitest";
import {
	ABBREVIATIONS,
	buildAliases,
	buildGeo,
	CURRENCY_BY_COUNTRY,
	currencyFor,
	DEFAULT_ZONES,
	type GeoSources,
	isClean,
	isConsistent,
	signsAgree,
	numberLocaleFor,
	parseBackward,
	parseZoneTab,
	renderModule,
	weekStartFor,
} from "../build";

const row = (country: string, zone: string, comment?: string) =>
	[country, "+0000+00000", zone, ...(comment === undefined ? [] : [comment])].join(
		"\t",
	);

describe("parseZoneTab", () => {
	test("reads country, zone and comment, in file order", () => {
		const text = [
			"# tzdb timezone descriptions",
			"#",
			row("US", "America/New_York", "Eastern (most areas)"),
			row("IN", "Asia/Kolkata"),
			row("US", "America/Detroit", "Eastern - MI (most areas)"),
			"",
		].join("\n");
		expect(parseZoneTab(text)).toEqual([
			{
				country: "US",
				zone: "America/New_York",
				comment: "Eastern (most areas)",
			},
			{ country: "IN", zone: "Asia/Kolkata", comment: "" },
			{
				country: "US",
				zone: "America/Detroit",
				comment: "Eastern - MI (most areas)",
			},
		]);
	});

	test("skips comment lines and blank lines", () => {
		expect(
			parseZoneTab(["# a", "", "#", row("JP", "Asia/Tokyo")].join("\n")),
		).toEqual([{ country: "JP", zone: "Asia/Tokyo", comment: "" }]);
	});

	test.each([
		["a lowercase country", row("us", "America/New_York")],
		["a three-letter country", row("USA", "America/New_York")],
		["no zone", "US\t+0000+00000"],
		["no tabs", "US +0000+00000 America/New_York"],
	])("refuses a row with %s", (_, line) => {
		expect(() => parseZoneTab(line)).toThrow(/line 1 is not a zone row/);
	});

	test("refuses a zone listed twice", () => {
		const text = [
			row("US", "America/New_York"),
			row("CA", "America/New_York"),
		].join("\n");
		expect(() => parseZoneTab(text)).toThrow(
			"zone.tab lists America/New_York twice",
		);
	});
});

describe("parseBackward", () => {
	test("reads Link TARGET NAME lines, with tabs or spaces", () => {
		const links = parseBackward(
			[
				"Link\tAsia/Kolkata\t\tAsia/Calcutta",
				"Link America/New_York   US/Eastern",
			].join("\n"),
		);
		expect(Object.fromEntries(links)).toEqual({
			"Asia/Calcutta": "Asia/Kolkata",
			"US/Eastern": "America/New_York",
		});
	});

	test("prefers the target a #= comment names", () => {
		// A real line of tzdb 2026e: Asmera is in Eritrea, Nairobi in Kenya.
		const links = parseBackward(
			"Link\tAfrica/Nairobi\t\tAfrica/Asmera\t#= Africa/Asmara",
		);
		expect(links.get("Africa/Asmera")).toBe("Africa/Asmara");
	});

	test("ignores a comment without =, and comment, blank and other lines", () => {
		const links = parseBackward(
			[
				"# This file is in the public domain.",
				"",
				"Zone\tEST5EDT\t-5:00\tUS\tE%sT",
				"Link\tEurope/London\tGB\t# Great Britain",
				"  # an indented comment",
			].join("\n"),
		);
		expect(Object.fromEntries(links)).toEqual({ GB: "Europe/London" });
	});

	test.each([
		["no name", "Link\tEurope/London"],
		["an extra field", "Link\tEurope/London\tGB\tGB-Eire"],
	])("refuses a Link with %s", (_, line) => {
		expect(() => parseBackward(line)).toThrow(/backward line 1 is not a Link/);
	});
});

describe("buildAliases (BR-F02-03)", () => {
	const zones = new Set([
		"Asia/Kolkata",
		"Asia/Riyadh",
		"Asia/Kuwait",
		"America/Toronto",
	]);

	test("maps a legacy name to its zone.tab target", () => {
		expect(
			buildAliases(new Map([["Asia/Calcutta", "Asia/Kolkata"]]), zones),
		).toEqual({
			"Asia/Calcutta": "Asia/Kolkata",
		});
	});

	test("never aliases a zone.tab name, even when backward links it", () => {
		expect(
			buildAliases(new Map([["Asia/Kuwait", "Asia/Riyadh"]]), zones),
		).toEqual({});
	});

	test("never aliases a zone abbreviation, which names an offset, not a place (D-209)", () => {
		const links = new Map([
			["EST", "America/Panama"],
			["CET", "Europe/Brussels"],
			["Japan", "Asia/Kolkata"],
		]);
		expect(
			buildAliases(
				links,
				new Set(["America/Panama", "Europe/Brussels", "Asia/Kolkata"]),
			),
		).toEqual({
			Japan: "Asia/Kolkata",
		});
	});

	test("lists the seven abbreviations tzdb links", () => {
		expect([...ABBREVIATIONS].sort()).toEqual([
			"CET",
			"EET",
			"EST",
			"HST",
			"MET",
			"MST",
			"WET",
		]);
	});

	test("follows a chain to a zone.tab name", () => {
		const links = new Map([
			["Canada/Eastern", "America/Montreal"],
			["America/Montreal", "America/Toronto"],
		]);
		expect(buildAliases(links, zones)).toEqual({
			"America/Montreal": "America/Toronto",
			"Canada/Eastern": "America/Toronto",
		});
	});

	test("drops a name whose chain ends outside zone.tab", () => {
		const links = new Map([
			["GMT", "Etc/GMT"],
			["Greenwich", "GMT"],
		]);
		expect(buildAliases(links, zones)).toEqual({});
	});

	test("stops at a loop instead of running forever", () => {
		const links = new Map([
			["A/One", "A/Two"],
			["A/Two", "A/One"],
		]);
		expect(buildAliases(links, zones)).toEqual({});
	});

	test("lists names in sorted order", () => {
		const links = new Map([
			["Z/Last", "Asia/Kolkata"],
			["A/First", "Asia/Kolkata"],
		]);
		expect(Object.keys(buildAliases(links, zones))).toEqual([
			"A/First",
			"Z/Last",
		]);
	});
});

describe("weekStartFor (D-209)", () => {
	const firstDay = {
		"001": "mon",
		US: "sun",
		KW: "sat",
		MV: "fri",
		XX: "thu",
		DE: "mon",
	};

	test.each([
		["US", "sunday"],
		["KW", "saturday"],
		["DE", "monday"],
		["MV", "monday"],
		["XX", "monday"],
		["IN", "monday"],
	] as const)("%s starts on %s", (country, day) => {
		expect(weekStartFor(firstDay, country)).toBe(day);
	});

	test("uses the world default for a country CLDR does not list", () => {
		expect(weekStartFor({ "001": "sun" }, "IN")).toBe("sunday");
	});

	test("falls back to Monday when even the world default is missing", () => {
		expect(weekStartFor({}, "IN")).toBe("monday");
	});
});

describe("currencyFor (BR-F02-04, D-210)", () => {
	test("lists 21 euro-area members and 14 other euro territories", () => {
		const euro = Object.entries(CURRENCY_BY_COUNTRY).filter(
			([, c]) => c === "EUR",
		);
		expect(euro).toHaveLength(35);
	});

	test.each([
		["IN", "INR"],
		["DE", "EUR"],
		["BG", "EUR"],
		["MC", "EUR"],
		["GB", "GBP"],
		["JE", "GBP"],
		["JP", "JPY"],
		["KW", "KWD"],
		["US", "USD"],
		["AE", "USD"],
		["CH", "USD"],
		["NO", "USD"],
	])("%s gets %s", (country, currency) => {
		expect(currencyFor(country)).toBe(currency);
	});
});

describe("DEFAULT_ZONES (BR-F02-05)", () => {
	test.each([
		["US", "America/New_York"],
		["CA", "America/Toronto"],
		["AU", "Australia/Sydney"],
		["BR", "America/Sao_Paulo"],
		["RU", "Europe/Moscow"],
		["MX", "America/Mexico_City"],
		["ID", "Asia/Jakarta"],
		["CN", "Asia/Shanghai"],
		["KZ", "Asia/Almaty"],
		["AR", "America/Argentina/Buenos_Aires"],
	])("names %s's required default, %s", (country, zone) => {
		expect(DEFAULT_ZONES[country]).toBe(zone);
	});
});

describe("the number-locale checks (BR-F02-18)", () => {
	test.each([
		"de-DE-u-nu-latn",
		"fr-FR-u-nu-latn",
		"hi-IN-u-nu-latn",
		"ja-JP-u-nu-latn",
	])("%s is clean and consistent", (locale) => {
		expect(isClean(locale)).toBe(true);
		expect(isConsistent(locale)).toBe(true);
	});

	test.each([
		"ar-SA-u-nu-latn",
		"fa-IR-u-nu-latn",
		"he-IL-u-nu-latn",
		"ur-PK-u-nu-latn",
	])("%s is not clean: Arabic signs or direction marks", (locale) => {
		expect(isClean(locale)).toBe(false);
	});

	test("plain en-DE is not consistent: money uses . but percentages ,", () => {
		expect(isConsistent("en-DE")).toBe(false);
	});

	describe("signsAgree", () => {
		const money = (sign: string | undefined) =>
			(["INR", "USD", "EUR", "GBP", "KWD"] as const).map((currency) => ({
				currency,
				sign,
			}));

		test("agrees when numbers, percentages and money share a sign", () => {
			expect(
				signsAgree({ number: ",", percent: ",", money: money(",") }),
			).toBe(true);
		});

		test("disagrees when only percentages differ", () => {
			expect(
				signsAgree({ number: ".", percent: ",", money: money(".") }),
			).toBe(false);
		});

		test("disagrees when one currency differs", () => {
			const signs = money(",").map((entry) =>
				entry.currency === "KWD" ? { ...entry, sign: "." } : entry,
			);
			expect(signsAgree({ number: ",", percent: ",", money: signs })).toBe(
				false,
			);
		});

		test("disagrees when numbers have no decimal sign at all", () => {
			expect(
				signsAgree({
					number: undefined,
					percent: undefined,
					money: money(undefined),
				}),
			).toBe(false);
		});

		test("ignores yen, which has no decimals", () => {
			const signs = [
				...money("."),
				{ currency: "JPY" as const, sign: undefined },
			];
			expect(signsAgree({ number: ".", percent: ".", money: signs })).toBe(
				true,
			);
		});
	});

	test("Austria is consistent although money groups differently from numbers", () => {
		expect(isConsistent("de-AT-u-nu-latn")).toBe(true);
	});

	test.each([
		["DE", "de-DE-u-nu-latn"],
		["FR", "fr-FR-u-nu-latn"],
		["IN", "hi-IN-u-nu-latn"],
		["JP", "ja-JP-u-nu-latn"],
		["US", "en-US-u-nu-latn"],
		["KW", "en-KW-u-nu-latn"],
		["SA", "en-SA-u-nu-latn"],
		["EG", "en-EG-u-nu-latn"],
	])("%s gets %s", (country, locale) => {
		expect(numberLocaleFor(country)).toBe(locale);
	});
});

/** A small, valid set of sources: every country the tables name, each multi-zone country with
 * its default and a second zone, and IN with its one real zone. `extra` rows are added last. */
function baseRows(): string[] {
	const zones = Object.entries(DEFAULT_ZONES).flatMap(([country, zone]) => [
		row(country, zone),
		row(country, `${zone}_Other`),
	]);
	const currencyOnly = Object.keys(CURRENCY_BY_COUNTRY)
		.filter((country) => !(country in DEFAULT_ZONES) && country !== "IN")
		.map((country) => row(country, `Test/${country}`));
	return [...zones, ...currencyOnly, row("IN", "Asia/Kolkata")];
}

function sources(rows: string[] = baseRows()): GeoSources {
	return {
		zoneTab: rows.join("\n"),
		backward: "Link\tAsia/Kolkata\tAsia/Calcutta",
		firstDay: { "001": "mon", IN: "sun" },
		versions: { tzdb: "test", cldr: "test", icu: "test" },
	};
}

const without = (rows: string[], drop: (line: string) => boolean) =>
	rows.filter((line) => !drop(line));

describe("buildGeo", () => {
	test("builds every country, sorted, with its zones in file order", () => {
		const geo = buildGeo(sources());
		const codes = Object.keys(geo.countries);
		expect(codes).toEqual([...codes].sort());
		expect(geo.countries["US"]!.zones.map((zone) => zone.name)).toEqual([
			"America/New_York",
			"America/New_York_Other",
		]);
	});

	test("a single-zone country's default is its only zone", () => {
		expect(buildGeo(sources()).countries["IN"]).toEqual({
			zones: [{ name: "Asia/Kolkata", comment: "" }],
			defaultZone: "Asia/Kolkata",
			weekStart: "sunday",
			currency: "INR",
			numberLocale: "hi-IN-u-nu-latn",
		});
	});

	test("a multi-zone country's default comes from the table, not the first row", () => {
		const rows = [
			...without(baseRows(), (line) => line.startsWith("CA\t")),
			row("CA", "America/Toronto_Other"),
			row("CA", "America/Toronto"),
		];
		const canada = buildGeo(sources(rows)).countries["CA"]!;
		expect(canada.zones[0]!.name).toBe("America/Toronto_Other");
		expect(canada.defaultZone).toBe("America/Toronto");
	});

	test("records the source versions and the aliases", () => {
		const geo = buildGeo(sources());
		expect(geo.sources).toEqual({ tzdb: "test", cldr: "test", icu: "test" });
		expect(geo.aliases).toEqual({ "Asia/Calcutta": "Asia/Kolkata" });
	});

	test("refuses a multi-zone country without a default", () => {
		const rows = [...baseRows(), row("IN", "Asia/Kolkata_Two")];
		expect(() => buildGeo(sources(rows))).toThrow(
			"IN has 2 zones but no default",
		);
	});

	test("refuses a default that is not one of the country's zones", () => {
		const rows = [
			...without(baseRows(), (line) => line.endsWith("\tAmerica/New_York")),
			row("US", "America/Chicago"),
		];
		expect(() => buildGeo(sources(rows))).toThrow(
			"US's default America/New_York is not one of its zones",
		);
	});

	test("refuses a default for a country with one zone", () => {
		const rows = without(baseRows(), (line) =>
			line.endsWith("Europe/Berlin_Other"),
		);
		expect(() => buildGeo(sources(rows))).toThrow(
			"DE has one zone, so it needs no default",
		);
	});

	test("refuses a default or a currency for a country zone.tab does not have", () => {
		const rows = without(
			baseRows(),
			(line) => line.startsWith("AQ\t") || line.startsWith("KW\t"),
		);
		const build = () => buildGeo(sources(rows));
		expect(build).toThrow("AQ has a default zone but no zones in zone.tab");
		expect(build).toThrow("KW has a currency but no zones in zone.tab");
	});

	test("lists every problem at once", () => {
		const rows = [
			...without(baseRows(), (line) => line.startsWith("AQ\t")),
			row("IN", "Asia/Kolkata_Two"),
		];
		expect(() => buildGeo(sources(rows))).toThrow(
			/AQ has a default zone[\s\S]*IN has 2 zones/,
		);
	});
});

describe("renderModule", () => {
	test("writes a typed module with a do-not-edit header", () => {
		const data = buildGeo(sources());
		const source = renderModule(data);
		expect(source.startsWith("// Generated by `pnpm geo:generate`")).toBe(true);
		expect(source).toContain('import type { GeoData } from "./types";');
		expect(source).toContain(
			`export const GEO_DATA: GeoData = ${JSON.stringify(data)};`,
		);
	});
});
