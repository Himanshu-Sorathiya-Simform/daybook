import { describe, expect, test } from "vitest";

import {
	CURRENCY_EXPONENTS,
	currencyExponent,
	currencySymbol,
	type CurrencyCode,
} from "@/lib/currency";

describe("exponents", () => {
	// MON-2: each exponent equals the fraction digits Intl uses for that currency.
	test.each(Object.keys(CURRENCY_EXPONENTS) as CurrencyCode[])(
		"%s matches Intl",
		(currency) => {
			const digits = new Intl.NumberFormat("en-US", {
				style: "currency",
				currency,
			}).resolvedOptions().maximumFractionDigits;

			expect(currencyExponent(currency)).toBe(digits);
		},
	);

	test("JPY has no fraction and KWD has three digits", () => {
		expect(currencyExponent("JPY")).toBe(0);
		expect(currencyExponent("KWD")).toBe(3);
	});
});

describe("symbol", () => {
	test("is the rupee sign in the Indian format", () => {
		expect(currencySymbol("INR", "hi-IN-u-nu-latn")).toBe("₹");
	});

	test("is the euro sign in the German format", () => {
		expect(currencySymbol("EUR", "de-DE-u-nu-latn")).toBe("€");
	});

	test("follows the currency, not the country", () => {
		expect(currencySymbol("USD", "de-DE-u-nu-latn")).toBe("$");
	});
});
