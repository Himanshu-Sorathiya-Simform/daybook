import { afterEach, describe, expect, test, vi } from "vitest";

import { countryCodes } from "@/lib/geo";
import {
	countryName,
	countryOptions,
	currencyName,
	currencyOptions,
	offsetLabel,
	WEEK_START_OPTIONS,
	zoneCity,
	zoneLabel,
	zoneOptions,
} from "../options";

const NOV = new Date("2026-11-02T06:30:00.000Z");
const JULY = new Date("2026-07-01T12:00:00.000Z");

afterEach(() => vi.restoreAllMocks());

describe("countryOptions (F02 section 6, D-511)", () => {
	const options = countryOptions();

	test("lists every country in the geo module once", () => {
		expect(options).toHaveLength(countryCodes().length);
		expect(new Set(options.map((option) => option.value)).size).toBe(
			options.length,
		);
	});

	test("labels each with its English name", () => {
		expect(options.find((option) => option.value === "IN")?.label).toBe("India");
		expect(options.find((option) => option.value === "CI")?.label).toBe(
			"Côte d’Ivoire",
		);
		expect(options.find((option) => option.value === "GB")?.label).toBe(
			"United Kingdom",
		);
	});

	test("sorts by English name as English readers expect, accents alongside plain letters", () => {
		expect(options.slice(0, 3).map((option) => option.label)).toEqual([
			"Afghanistan",
			"Åland Islands",
			"Albania",
		]);
		expect(options.at(-1)?.label).toBe("Zimbabwe");
		const collator = new Intl.Collator("en");
		for (let i = 1; i < options.length; i += 1) {
			expect(
				collator.compare(options[i - 1]!.label, options[i]!.label),
			).toBeLessThanOrEqual(0);
		}
	});

	test("countryName falls back to the code for a code Intl does not know", () => {
		vi.spyOn(Intl.DisplayNames.prototype, "of").mockReturnValue(undefined);
		expect(countryName("ZZ")).toBe("ZZ");
	});
});

describe("currencies (F02 section 6)", () => {
	test.each([
		["INR", "Indian rupee"],
		["USD", "US dollar"],
		["EUR", "Euro"],
		["GBP", "British pound"],
		["JPY", "Japanese yen"],
		["KWD", "Kuwaiti dinar"],
	] as const)("%s is %s", (code, name) => {
		expect(currencyName(code)).toBe(name);
	});

	test('lists the six, in MON-2 order, as "Indian rupee (INR)"', () => {
		expect(currencyOptions()).toEqual([
			{ value: "INR", label: "Indian rupee (INR)" },
			{ value: "USD", label: "US dollar (USD)" },
			{ value: "EUR", label: "Euro (EUR)" },
			{ value: "GBP", label: "British pound (GBP)" },
			{ value: "JPY", label: "Japanese yen (JPY)" },
			{ value: "KWD", label: "Kuwaiti dinar (KWD)" },
		]);
	});

	test("falls back to the code for a currency Intl does not know", () => {
		vi.spyOn(Intl.DisplayNames.prototype, "of").mockReturnValue(undefined);
		expect(currencyName("INR")).toBe("INR");
	});
});

describe("offsetLabel (F02 section 5)", () => {
	test.each([
		["Asia/Kolkata", NOV, "GMT+05:30"],
		["America/New_York", NOV, "GMT-05:00"],
		["America/New_York", JULY, "GMT-04:00"],
		["Europe/London", JULY, "GMT+01:00"],
		["Asia/Kathmandu", NOV, "GMT+05:45"],
		["America/St_Johns", NOV, "GMT-03:30"],
		["Pacific/Chatham", NOV, "GMT+13:45"],
		["UTC", NOV, "GMT+00:00"],
	])("%s at %s is %s", (zone, at, label) => {
		expect(offsetLabel(zone, at)).toBe(label);
	});

	test("an engine that writes UTC as plain GMT gets GMT+00:00", () => {
		vi.spyOn(Intl.DateTimeFormat.prototype, "formatToParts").mockReturnValue([
			{ type: "timeZoneName", value: "GMT" },
		]);
		expect(offsetLabel("UTC", NOV)).toBe("GMT+00:00");
	});

	test("an engine with no zone name part gets GMT+00:00", () => {
		vi.spyOn(Intl.DateTimeFormat.prototype, "formatToParts").mockReturnValue([]);
		expect(offsetLabel("UTC", NOV)).toBe("GMT+00:00");
	});
});

describe("zone labels (F02 section 5)", () => {
	test.each([
		["Asia/Kolkata", "Kolkata"],
		["America/Argentina/Buenos_Aires", "Buenos Aires"],
		["America/Port_of_Spain", "Port of Spain"],
		["UTC", "UTC"],
	])("the city of %s is %s", (zone, city) => {
		expect(zoneCity(zone)).toBe(city);
	});

	test("one zone: the city and the offset", () => {
		expect(zoneLabel({ name: "Asia/Kolkata", comment: "" }, false, NOV)).toBe(
			"Kolkata (GMT+05:30)",
		);
	});

	test("several zones: the comment joins the city", () => {
		expect(
			zoneLabel(
				{ name: "America/New_York", comment: "Eastern (most areas)" },
				true,
				NOV,
			),
		).toBe("New York, Eastern (most areas) (GMT-05:00)");
	});

	test("a zone of several with no comment shows no stray comma", () => {
		expect(zoneLabel({ name: "Asia/Kolkata", comment: "" }, true, NOV)).toBe(
			"Kolkata (GMT+05:30)",
		);
	});

	test("one zone never shows its comment", () => {
		expect(
			zoneLabel({ name: "Asia/Kolkata", comment: "India" }, false, NOV),
		).toBe("Kolkata (GMT+05:30)");
	});
});

describe("zoneOptions (D-511)", () => {
	test("a one-zone country has one option", () => {
		expect(zoneOptions("IN", NOV)).toEqual([
			{ value: "Asia/Kolkata", label: "Kolkata (GMT+05:30)" },
		]);
	});

	test("keeps zone.tab's order, the main zone first, with comments", () => {
		const options = zoneOptions("US", NOV);
		expect(options[0]).toEqual({
			value: "America/New_York",
			label: "New York, Eastern (most areas) (GMT-05:00)",
		});
		expect(options[1]).toEqual({
			value: "America/Detroit",
			label: "Detroit, Eastern - MI (most areas) (GMT-05:00)",
		});
	});

	test("Germany lists Berlin, then Busingen", () => {
		expect(zoneOptions("DE", NOV).map((option) => option.value)).toEqual([
			"Europe/Berlin",
			"Europe/Busingen",
		]);
	});

	test("offsets follow the given time", () => {
		expect(zoneOptions("DE", JULY)[0]?.label).toBe(
			"Berlin, most of Germany (GMT+02:00)",
		);
		expect(zoneOptions("DE", NOV)[0]?.label).toBe(
			"Berlin, most of Germany (GMT+01:00)",
		);
	});
});

describe("WEEK_START_OPTIONS", () => {
	test("Monday, Sunday, Saturday, in F02's order", () => {
		expect(WEEK_START_OPTIONS).toEqual([
			{ value: "monday", label: "Monday" },
			{ value: "sunday", label: "Sunday" },
			{ value: "saturday", label: "Saturday" },
		]);
	});
});
