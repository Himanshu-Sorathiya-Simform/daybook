import { describe, expect, test } from "vitest";

import {
	CURRENCY_EXPONENTS,
	currencyExponent,
	currencySymbol,
	type CurrencyCode,
} from "@/lib/currency";

const CODES = Object.keys(CURRENCY_EXPONENTS) as CurrencyCode[];

describe("the supported currencies (MON-2)", () => {
	test("are INR, USD, EUR, GBP, JPY and KWD, and no others", () => {
		expect([...CODES].sort()).toEqual([
			"EUR",
			"GBP",
			"INR",
			"JPY",
			"KWD",
			"USD",
		]);
	});

	test.each([
		["INR", 2],
		["USD", 2],
		["EUR", 2],
		["GBP", 2],
		["JPY", 0],
		["KWD", 3],
	] as [CurrencyCode, number][])(
		"%s has %i decimal digits",
		(currency, digits) => {
			expect(currencyExponent(currency)).toBe(digits);
			expect(CURRENCY_EXPONENTS[currency]).toBe(digits);
		},
	);

	// MON-2: each exponent equals the fraction digits Intl uses for that currency.
	test.each(CODES)("%s matches Intl", (currency) => {
		const digits = new Intl.NumberFormat("en-US", {
			style: "currency",
			currency,
		}).resolvedOptions().maximumFractionDigits;

		expect(currencyExponent(currency)).toBe(digits);
	});

	test("every exponent is a whole number from 0 to 3", () => {
		for (const currency of CODES) {
			const digits = currencyExponent(currency);
			expect(Number.isInteger(digits)).toBe(true);
			expect(digits).toBeGreaterThanOrEqual(0);
			expect(digits).toBeLessThanOrEqual(3);
		}
	});
});

describe("currencySymbol", () => {
	test.each([
		["INR", "hi-IN-u-nu-latn", "₹"],
		["INR", "en-IN-u-nu-latn", "₹"],
		["USD", "en-US-u-nu-latn", "$"],
		["EUR", "de-DE-u-nu-latn", "€"],
		["EUR", "fr-FR-u-nu-latn", "€"],
		["GBP", "en-GB-u-nu-latn", "£"],
		["JPY", "ja-JP-u-nu-latn", "￥"],
		["KWD", "en-US-u-nu-latn", "KWD"],
	] as [CurrencyCode, string, string][])(
		"%s in %s is %s",
		(currency, locale, symbol) => {
			expect(currencySymbol(currency, locale)).toBe(symbol);
		},
	);

	test("follows the currency, not the country", () => {
		expect(currencySymbol("USD", "de-DE-u-nu-latn")).toBe("$");
		expect(currencySymbol("EUR", "hi-IN-u-nu-latn")).toBe("€");
	});

	test("is a single non-empty piece of text for every currency", () => {
		for (const currency of CODES) {
			const symbol = currencySymbol(currency, "en-US-u-nu-latn");
			expect(symbol.length).toBeGreaterThan(0);
			expect(symbol).not.toMatch(/\d/);
		}
	});

	test("refuses a locale that does not exist", () => {
		expect(() => currencySymbol("INR", "not a locale")).toThrow(RangeError);
	});
});
