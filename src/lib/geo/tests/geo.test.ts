import { describe, expect, test } from "vitest";
import { formatMoney, formatPercent } from "../../money";
import { GEO_DATA } from "../data";
import {
	canonicalZone,
	countryCodes,
	countryOfZone,
	currencyOf,
	dateLocaleOf,
	defaultsFor,
	defaultZoneOf,
	isCountry,
	isValidZone,
	isZoneOf,
	numberLocaleOf,
	prefill,
	UTC,
	weekStartOf,
	zonesOf,
} from "..";

const allZones = Object.values(GEO_DATA.countries).flatMap(({ zones }) =>
	zones.map((zone) => zone.name),
);

describe("prefill (BR-F02-03 to BR-F02-06)", () => {
	// AC-F02-01
	test("Asia/Calcutta with en-US pre-fills IN, INR, Asia/Kolkata, Sunday", () => {
		expect(prefill({ zone: "Asia/Calcutta", language: "en-US" })).toEqual({
			country: "IN",
			currency: "INR",
			timezone: "Asia/Kolkata",
			weekStart: "sunday",
		});
	});

	// AC-F02-02
	test.each([
		["Europe/Berlin", "en-GB", "DE", "EUR", "Europe/Berlin", "monday"],
		["UTC", "en-GB", "GB", "GBP", "Europe/London", "monday"],
		["Asia/Kuwait", "en-US", "KW", "KWD", "Asia/Kuwait", "saturday"],
		["Europe/Oslo", "en-US", "NO", "USD", "Europe/Oslo", "monday"],
		["UTC", "en-AU", "AU", "USD", "Australia/Sydney", "monday"],
		["UTC", "en-CA", "CA", "USD", "America/Toronto", "sunday"],
		["UTC", "pt-BR", "BR", "USD", "America/Sao_Paulo", "sunday"],
	])(
		"%s with %s pre-fills %s, %s, %s, %s",
		(zone, language, country, currency, timezone, weekStart) => {
			expect(prefill({ zone, language })).toEqual({
				country,
				currency,
				timezone,
				weekStart,
			});
		},
	);

	// AC-F02-02
	test.each(["", "!!", "x", "12-34", "en_US"])(
		"UTC with the unreadable language %j leaves the country empty",
		(language) => {
			expect(prefill({ zone: UTC, language })).toBeNull();
		},
	);

	test("nothing known about the device leaves the country empty", () => {
		expect(prefill({ zone: undefined, language: undefined })).toBeNull();
	});

	test("the zone's country wins over the language's", () => {
		expect(prefill({ zone: "Asia/Kolkata", language: "de-DE" })?.country).toBe(
			"IN",
		);
	});

	test("a zone the module does not know falls back to the language", () => {
		expect(prefill({ zone: "Etc/GMT-4", language: "fr-FR" })).toEqual({
			country: "FR",
			currency: "EUR",
			timezone: "Europe/Paris",
			weekStart: "monday",
		});
	});

	test("a language without a region is maximized: plain en is the US", () => {
		expect(prefill({ zone: UTC, language: "en" })?.country).toBe("US");
		expect(prefill({ zone: UTC, language: "de" })?.country).toBe("DE");
		expect(prefill({ zone: UTC, language: "ja" })?.country).toBe("JP");
	});

	test.each(["zxx", "mul", "qaa"])(
		"a language with no likely region (%s) leaves the country empty",
		(language) => {
			expect(prefill({ zone: UTC, language })).toBeNull();
		},
	);

	test("reads a region in any case", () => {
		expect(prefill({ zone: UTC, language: "en-gb" })?.country).toBe("GB");
	});

	test.each(["es-419", "en-001", "ar-001"])(
		"a region that is not a country (%s) leaves the country empty",
		(language) => {
			expect(prefill({ zone: UTC, language })).toBeNull();
		},
	);

	test("a device zone in its own country is kept, not replaced by the default", () => {
		expect(
			prefill({ zone: "America/Chicago", language: "en-US" })?.timezone,
		).toBe("America/Chicago");
		expect(
			prefill({ zone: "Australia/Perth", language: "en-AU" })?.timezone,
		).toBe("Australia/Perth");
	});

	test("a legacy device zone maps to its country and is stored by its current name", () => {
		expect(prefill({ zone: "US/Eastern", language: undefined })).toMatchObject({
			country: "US",
			timezone: "America/New_York",
		});
		expect(prefill({ zone: "Europe/Kiev", language: undefined })).toMatchObject({
			country: "UA",
			timezone: "Europe/Kyiv",
		});
	});
});

describe("defaultsFor (BR-F02-05, BR-F02-07)", () => {
	test("keeps the device zone when it belongs to the country", () => {
		expect(defaultsFor("US", "America/Denver").timezone).toBe("America/Denver");
	});

	test("uses the country's default when the device zone is elsewhere", () => {
		expect(defaultsFor("US", "Asia/Kolkata").timezone).toBe("America/New_York");
	});

	test("uses the country's default without a device zone", () => {
		expect(defaultsFor("CA")).toEqual({
			currency: "USD",
			timezone: "America/Toronto",
			weekStart: "sunday",
		});
	});

	test("maps a legacy device zone first", () => {
		expect(defaultsFor("IN", "Asia/Calcutta").timezone).toBe("Asia/Kolkata");
	});

	test("keeps a legacy device zone under its current name when it is not the default", () => {
		expect(defaultsFor("US", "US/Pacific").timezone).toBe("America/Los_Angeles");
		expect(defaultsFor("CA", "Canada/Pacific").timezone).toBe(
			"America/Vancouver",
		);
	});

	test("never keeps UTC or an unknown zone", () => {
		expect(defaultsFor("GB", UTC).timezone).toBe("Europe/London");
		expect(defaultsFor("GB", "Mars/Olympus_Mons").timezone).toBe(
			"Europe/London",
		);
	});
});

describe("countries", () => {
	test("lists the 247 countries zone.tab has, sorted", () => {
		const codes = countryCodes();
		expect(codes).toHaveLength(247);
		expect(codes).toEqual([...codes].sort());
		expect(codes.every((code) => /^[A-Z]{2}$/.test(code))).toBe(true);
	});

	test.each(["IN", "US", "DE", "KW", "AQ"])("%s is a country", (code) => {
		expect(isCountry(code)).toBe(true);
	});

	test.each([
		"in",
		"",
		"USA",
		"XK",
		"001",
		"__proto__",
		"toString",
		"constructor",
		null,
		7,
	])("%j is not a country", (code) => {
		expect(isCountry(code)).toBe(false);
	});

	test("every country has at least one zone, a default among them, and Latin digits", () => {
		for (const code of countryCodes()) {
			const zones = zonesOf(code).map((zone) => zone.name);
			expect(zones.length).toBeGreaterThan(0);
			expect(zones).toContain(defaultZoneOf(code));
			expect(numberLocaleOf(code)).toMatch(new RegExp(`-${code}-u-nu-latn$`));
		}
	});

	test("keeps zone.tab's order and comments", () => {
		const us = zonesOf("US");
		expect(us[0]).toEqual({
			name: "America/New_York",
			comment: "Eastern (most areas)",
		});
		expect(us.map((zone) => zone.name)).toContain("Pacific/Honolulu");
	});

	test("an unknown country is an error, not a guess", () => {
		expect(() => zonesOf("XX")).toThrow(RangeError);
		expect(() => currencyOf("xx")).toThrow(RangeError);
		expect(() => dateLocaleOf("__proto__")).toThrow(RangeError);
	});
});

describe("currencies (BR-F02-04)", () => {
	// AC-F02-03
	test.each([
		["INR", ["IN"]],
		[
			"EUR",
			[
				...[
					"AT",
					"BE",
					"BG",
					"CY",
					"DE",
					"EE",
					"ES",
					"FI",
					"FR",
					"GR",
					"HR",
					"IE",
					"IT",
				],
				...[
					"LT",
					"LU",
					"LV",
					"MT",
					"NL",
					"PT",
					"SI",
					"SK",
					"AD",
					"AX",
					"BL",
					"GF",
					"GP",
				],
				...["MC", "ME", "MF", "MQ", "PM", "RE", "SM", "VA", "YT"],
			],
		],
		["GBP", ["GB", "GG", "IM", "JE"]],
		["JPY", ["JP"]],
		["KWD", ["KW"]],
	])("%s for every country the table lists", (currency, codes) => {
		for (const code of codes) expect(currencyOf(code), code).toBe(currency);
	});

	// AC-F02-03
	test("every other country gets USD, AE included", () => {
		expect(currencyOf("AE")).toBe("USD");
		const notUsd = countryCodes().filter((code) => currencyOf(code) !== "USD");
		expect(notUsd).toHaveLength(1 + 35 + 4 + 1 + 1);
	});
});

describe("week starts (BR-F02-06)", () => {
	// AC-F02-05
	test.each([
		["US", "sunday"],
		["IN", "sunday"],
		["DE", "monday"],
		["KW", "saturday"],
		["MV", "monday"],
		["AE", "monday"],
		["EG", "saturday"],
		["JP", "sunday"],
	] as const)("%s starts on %s", (code, day) => {
		expect(weekStartOf(code)).toBe(day);
	});
});

describe("default zones (BR-F02-05)", () => {
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
		["IN", "Asia/Kolkata"],
	])("%s defaults to %s", (code, zone) => {
		expect(defaultZoneOf(code)).toBe(zone);
	});

	test("not zone.tab's first row where that is a poor guess", () => {
		expect(zonesOf("CA")[0]!.name).toBe("America/St_Johns");
		expect(zonesOf("AU")[0]!.name).toBe("Australia/Lord_Howe");
		expect(zonesOf("RU")[0]!.name).toBe("Europe/Kaliningrad");
	});
});

describe("zones", () => {
	// AC-F02-04
	test("every zone, and UTC, is accepted by Intl.DateTimeFormat", () => {
		const refused = [...allZones, UTC].filter((zone) => {
			try {
				new Intl.DateTimeFormat("en", { timeZone: zone });
				return false;
			} catch {
				return true;
			}
		});
		expect(refused).toEqual([]);
	});

	// AC-F02-04
	test.each([
		["Asia/Calcutta", "Asia/Kolkata"],
		["US/Eastern", "America/New_York"],
		["Europe/Kiev", "Europe/Kyiv"],
		["America/Montreal", "America/Toronto"],
		// Through a "#=" target, which names the right country where the link itself would not.
		["Africa/Asmera", "Africa/Asmara"],
		["Pacific/Truk", "Pacific/Chuuk"],
		["Iceland", "Atlantic/Reykjavik"],
		// Through a "#=" target that is itself a link: Australia/Canberra to Australia/Sydney.
		["Australia/ACT", "Australia/Sydney"],
	])("the legacy name %s is %s", (legacy, current) => {
		expect(canonicalZone(legacy)).toBe(current);
	});

	test("a #= target puts a legacy name in its own country", () => {
		expect(
			prefill({ zone: "Africa/Asmera", language: undefined })?.country,
		).toBe("ER");
		expect(prefill({ zone: "Pacific/Truk", language: undefined })?.country).toBe(
			"FM",
		);
		expect(prefill({ zone: "Iceland", language: undefined })?.country).toBe(
			"IS",
		);
	});

	test("follows tzdb where it merged a legacy name into another country's zone", () => {
		// tzdb 2026e links these with no "#=", so the module follows the link (D-209).
		expect(canonicalZone("Atlantic/Jan_Mayen")).toBe("Europe/Berlin");
		expect(canonicalZone("Africa/Timbuktu")).toBe("Africa/Abidjan");
	});

	test.each(["CET", "EET", "EST", "HST", "MET", "MST", "WET"])(
		"the abbreviation %s is not an alias, so it counts as unknown",
		(zone) => {
			expect(canonicalZone(zone)).toBeNull();
		},
	);

	test("a device reporting an abbreviation gets its country from the language", () => {
		expect(prefill({ zone: "EST", language: "en-US" })).toMatchObject({
			country: "US",
			timezone: "America/New_York",
		});
		expect(prefill({ zone: "CET", language: "de-DE" })).toMatchObject({
			country: "DE",
			timezone: "Europe/Berlin",
		});
		expect(prefill({ zone: "EST", language: undefined })).toBeNull();
	});

	test.each([
		["Japan", "JP"],
		["GB", "GB"],
		["PRC", "CN"],
		["NZ", "NZ"],
		["Poland", "PL"],
	])("the place name %s is still an alias, in %s", (zone, country) => {
		expect(prefill({ zone, language: undefined })?.country).toBe(country);
	});

	test("every alias leads to a zone.tab zone", () => {
		for (const target of Object.values(GEO_DATA.aliases)) {
			expect(countryOfZone(target), target).not.toBeNull();
		}
	});

	test("never aliases a zone.tab name, so Kuwait and Oslo keep their countries", () => {
		expect(canonicalZone("Asia/Kuwait")).toBe("Asia/Kuwait");
		expect(countryOfZone("Asia/Kuwait")).toBe("KW");
		expect(canonicalZone("Europe/Oslo")).toBe("Europe/Oslo");
		expect(countryOfZone("Europe/Oslo")).toBe("NO");
		for (const name of Object.keys(GEO_DATA.aliases)) {
			expect(countryOfZone(name), name).toBeNull();
		}
	});

	test.each([
		"Etc/GMT-4",
		"Etc/UTC",
		"GMT",
		"",
		"asia/kolkata",
		"Mars/Olympus_Mons",
		"__proto__",
	])("%j is not a zone the module knows", (zone) => {
		expect(canonicalZone(zone)).toBeNull();
	});

	test("UTC is valid but belongs to no country", () => {
		expect(canonicalZone(UTC)).toBe(UTC);
		expect(isValidZone(UTC)).toBe(true);
		expect(countryOfZone(UTC)).toBeNull();
	});

	test.each([...allZones.slice(0, 5), "America/New_York", "Asia/Kolkata", UTC])(
		"%s may be stored",
		(zone) => {
			expect(isValidZone(zone)).toBe(true);
		},
	);

	test.each([
		"Asia/Calcutta",
		"US/Eastern",
		"Etc/UTC",
		"",
		"utc",
		"__proto__",
		null,
		5,
	])("%j may not be stored: only zone.tab names and UTC", (zone) => {
		expect(isValidZone(zone)).toBe(false);
	});

	test("a zone belongs to its own country only (D-211)", () => {
		expect(isZoneOf("US", "America/Chicago")).toBe(true);
		expect(isZoneOf("CA", "America/Chicago")).toBe(false);
		expect(isZoneOf("IN", "Asia/Calcutta")).toBe(false);
		expect(isZoneOf("GB", UTC)).toBe(false);
		expect(isZoneOf("XX", "America/Chicago")).toBe(false);
		expect(isZoneOf("US", 5)).toBe(false);
	});

	test("every zone belongs to exactly one country", () => {
		expect(new Set(allZones).size).toBe(allZones.length);
	});
});

describe("locales (BR-F02-18)", () => {
	test.each([
		["IN", "hi-IN-u-nu-latn"],
		["DE", "de-DE-u-nu-latn"],
		["FR", "fr-FR-u-nu-latn"],
		["JP", "ja-JP-u-nu-latn"],
		["KW", "en-KW-u-nu-latn"],
	])("%s formats numbers with %s", (code, locale) => {
		expect(numberLocaleOf(code)).toBe(locale);
	});

	test("the date locale is English with the country's conventions", () => {
		expect(dateLocaleOf("DE")).toBe("en-DE");
		expect(dateLocaleOf("IN")).toBe("en-IN");
	});

	// AC-F02-13 (the profiles' formats, through the geo module)
	test.each([
		["IN", 10_000_000, "INR", "₹1,00,000.00"],
		["US", 124_050, "USD", "$1,240.50"],
		["DE", 124_050, "EUR", "1.240,50 €"],
		["JP", 1240, "JPY", "￥1,240"],
		["KW", 1_240_500, "KWD", "KWD 1,240.500"],
	] as const)("a %s profile writes %i %s as %s", (code, minor, currency, text) => {
		const normalize = (value: string) => value.replace(/[  ]/g, " ");
		expect(normalize(formatMoney(minor, currency, numberLocaleOf(code)))).toBe(
			text,
		);
	});

	// AC-F02-13
	test("a DE profile writes 63.3% as 63,3 %", () => {
		const text = formatPercent(633, 1000, numberLocaleOf("DE"));
		expect(text.replace(/[  ]/g, " ")).toBe("63,3 %");
	});
});
