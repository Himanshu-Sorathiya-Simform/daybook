import { describe, expect, test } from "vitest";

import {
	MINUS,
	formatMoney,
	formatMoneyShort,
	formatPercent,
	moneyParts,
	percentTenths,
} from "@/lib/money";
import type { CurrencyCode } from "@/lib/currency";

const IN = "hi-IN-u-nu-latn";
const DE = "de-DE-u-nu-latn";
const US = "en-US-u-nu-latn";

describe("MINUS", () => {
	test("is U+2212, not the hyphen", () => {
		expect(MINUS).toBe("−");
		expect(MINUS).not.toBe("-");
	});
});

describe("formatMoney", () => {
	// Golden dataset: October spending is 31,168.00 and Budget A's expense is 18,420.00.
	test("writes INR in the Indian format", () => {
		expect(formatMoney(3116800, "INR", IN)).toBe("₹31,168.00");
		expect(formatMoney(10000000, "INR", IN)).toBe("₹1,00,000.00");
		expect(formatMoney(123456789, "INR", IN)).toBe("₹12,34,567.89");
	});

	test.each([
		["USD", US, 124050, "$1,240.50"],
		["GBP", "en-GB-u-nu-latn", 124050, "£1,240.50"],
		["EUR", DE, 124050, "1.240,50 €"],
		["EUR", "fr-FR-u-nu-latn", 124050, "1 240,50 €"],
		["JPY", "ja-JP-u-nu-latn", 1240, "￥1,240"],
		["KWD", US, 1240500, "KWD 1,240.500"],
	] as [CurrencyCode, string, number, string][])(
		"writes %s in %s as %j",
		(currency, locale, minor, text) => {
			expect(formatMoney(minor, currency, locale)).toBe(text);
		},
	);

	test("respects the exponent: JPY has no decimals, KWD has three", () => {
		expect(formatMoney(1, "JPY", "ja-JP-u-nu-latn")).toBe("￥1");
		expect(formatMoney(1, "KWD", US)).toBe("KWD 0.001");
		expect(formatMoney(1, "INR", IN)).toBe("₹0.01");
	});

	test("pads small amounts to the exponent", () => {
		expect(formatMoney(5, "INR", IN)).toBe("₹0.05");
		expect(formatMoney(0, "INR", IN)).toBe("₹0.00");
		expect(formatMoney(100, "INR", IN)).toBe("₹1.00");
		expect(formatMoney(99, "INR", IN)).toBe("₹0.99");
	});

	test("shows a negative with the minus sign, not a hyphen", () => {
		expect(formatMoney(-1842000, "INR", IN)).toBe("−₹18,420.00");
		expect(formatMoney(-124050, "EUR", DE)).toBe("−1.240,50 €");
		expect(formatMoney(-1240, "JPY", "ja-JP-u-nu-latn")).toBe("−￥1,240");
		expect(formatMoney(-1, "INR", IN)).not.toContain("-");
	});

	test("shows a plus only when asked, and never on zero or a negative", () => {
		expect(formatMoney(8500000, "INR", IN)).toBe("₹85,000.00");
		expect(formatMoney(8500000, "INR", IN, { signDisplay: "always" })).toBe(
			"+₹85,000.00",
		);
		expect(formatMoney(0, "INR", IN, { signDisplay: "always" })).toBe("₹0.00");
		expect(formatMoney(-500, "INR", IN, { signDisplay: "always" })).toBe(
			"−₹5.00",
		);
		expect(formatMoney(8500000, "INR", IN, { signDisplay: "negative" })).toBe(
			"₹85,000.00",
		);
	});

	test("treats negative zero as zero", () => {
		expect(formatMoney(-0, "INR", IN)).toBe("₹0.00");
		expect(formatMoney(-0, "INR", IN, { signDisplay: "always" })).toBe("₹0.00");
	});

	test("stays exact at the largest allowed amount (MON-5)", () => {
		expect(formatMoney(99_999_999_999, "INR", IN)).toBe("₹99,99,99,999.99");
		expect(formatMoney(99_999_999_999, "USD", US)).toBe("$999,999,999.99");
		expect(formatMoney(999_999_999, "JPY", "ja-JP-u-nu-latn")).toBe(
			"￥999,999,999",
		);
		expect(formatMoney(999_999_999_999, "KWD", US)).toBe("KWD 999,999,999.999");
	});

	test("stays exact at the largest safe integer, where a float would round", () => {
		expect(formatMoney(Number.MAX_SAFE_INTEGER, "USD", US)).toBe(
			"$90,071,992,547,409.91",
		);
		expect(formatMoney(-Number.MAX_SAFE_INTEGER, "USD", US)).toBe(
			"−$90,071,992,547,409.91",
		);
	});

	test("never loses a cent to a float: every amount in a sweep formats back to itself", () => {
		for (const minor of [
			1, 7, 29, 57, 99, 101, 1_000_001, 123_456_789_01, 9_007_199_254_740_9,
		]) {
			const text = formatMoney(minor, "USD", US).replace(/[^\d]/g, "");
			expect(text.replace(/^0+/, "")).toBe(String(minor));
		}
	});

	test("refuses a fraction of a minor unit", () => {
		expect(() => formatMoney(12.5, "INR", IN)).toThrow(RangeError);
		expect(() => formatMoney(0.1 + 0.2, "INR", IN)).toThrow(RangeError);
	});

	test.each([NaN, Infinity, -Infinity, Number.MAX_SAFE_INTEGER + 2])(
		"refuses %s",
		(minor) => {
			expect(() => formatMoney(minor, "INR", IN)).toThrow(RangeError);
		},
	);

	test("refuses a locale that does not exist", () => {
		expect(() => formatMoney(100, "INR", "not a locale")).toThrow(RangeError);
	});
});

describe("formatMoneyShort (BR-F03-39, BR-F03-74)", () => {
	test("leaves out the decimals of a whole amount", () => {
		expect(formatMoneyShort(100000, "INR", IN)).toBe("₹1,000");
		expect(formatMoneyShort(250000, "INR", IN)).toBe("₹2,500");
		expect(formatMoneyShort(10000000, "INR", IN)).toBe("₹1,00,000");
	});

	test("keeps every decimal of an amount with a fractional part", () => {
		expect(formatMoneyShort(39999, "INR", IN)).toBe("₹399.99");
		expect(formatMoneyShort(100050, "INR", IN)).toBe("₹1,000.50");
		expect(formatMoneyShort(100005, "INR", IN)).toBe("₹1,000.05");
	});

	test.each([
		["EUR", DE, 124000, "1.240\u00a0€"],
		["EUR", DE, 124050, "1.240,50\u00a0€"],
		["USD", US, 500, "$5"],
		["USD", US, 1, "$0.01"],
		["JPY", "ja-JP-u-nu-latn", 1240, "￥1,240"],
		["KWD", US, 1240000, "KWD\u00a01,240"],
		["KWD", US, 1240001, "KWD\u00a01,240.001"],
	] as [CurrencyCode, string, number, string][])(
		"writes %s in %s for %i as %j",
		(currency, locale, minor, text) => {
			expect(formatMoneyShort(minor, currency, locale)).toBe(text);
		},
	);

	test("zero has no decimals, and a negative amount takes the minus sign", () => {
		expect(formatMoneyShort(0, "INR", IN)).toBe("₹0");
		expect(formatMoneyShort(-100000, "INR", IN)).toBe(`${MINUS}₹1,000`);
		expect(formatMoneyShort(-150, "INR", IN)).toBe(`${MINUS}₹1.50`);
	});

	test("reaches Intl as an exact decimal past the float's precision", () => {
		expect(formatMoneyShort(900719925474099, "INR", US)).toBe(
			"₹9,007,199,254,740.99",
		);
		expect(formatMoneyShort(900719925474000, "INR", US)).toBe(
			"₹9,007,199,254,740",
		);
	});
});

describe("moneyParts", () => {
	test("splits INR into sign, symbol, whole part and fraction", () => {
		expect(moneyParts(-3116800, "INR", IN)).toEqual({
			sign: "−",
			symbol: "₹",
			symbolAfter: false,
			integer: "31,168",
			fraction: ".00",
			text: "−₹31,168.00",
		});
	});

	test("says when the currency sign comes after the number", () => {
		const parts = moneyParts(124050, "EUR", DE);

		expect(parts.symbolAfter).toBe(true);
		expect(parts.symbol).toBe("€");
		expect(parts.integer).toBe("1.240");
		expect(parts.fraction).toBe(",50");
		expect(parts.text).toBe("1.240,50 €");
	});

	test("says when the currency sign comes before the number", () => {
		expect(moneyParts(124050, "USD", US).symbolAfter).toBe(false);
		expect(moneyParts(124050, "INR", IN).symbolAfter).toBe(false);
	});

	test("has no fraction for JPY and three digits for KWD", () => {
		expect(moneyParts(1240, "JPY", "ja-JP-u-nu-latn").fraction).toBe("");
		expect(moneyParts(1240500, "KWD", US).fraction).toBe(".500");
	});

	test("keeps the grouping signs in the whole part", () => {
		expect(moneyParts(10000000, "INR", IN).integer).toBe("1,00,000");
		expect(moneyParts(123456789, "EUR", DE).integer).toBe("1.234.567");
	});

	test("has an empty sign for a positive amount and zero", () => {
		expect(moneyParts(100, "INR", IN).sign).toBe("");
		expect(moneyParts(0, "INR", IN).sign).toBe("");
	});

	test("shows a plus only when asked, and a minus whatever is asked", () => {
		expect(moneyParts(100, "INR", IN, { signDisplay: "always" }).sign).toBe("+");
		expect(moneyParts(0, "INR", IN, { signDisplay: "always" }).sign).toBe("");
		expect(moneyParts(-100, "INR", IN, { signDisplay: "always" }).sign).toBe(
			"−",
		);
		expect(moneyParts(-100, "INR", IN, { signDisplay: "negative" }).sign).toBe(
			"−",
		);
	});

	test.each([
		["INR", IN],
		["USD", US],
		["EUR", DE],
		["GBP", "en-GB-u-nu-latn"],
		["JPY", "ja-JP-u-nu-latn"],
		["KWD", US],
	] as [CurrencyCode, string][])(
		"%s: the parts put back together are the text",
		(currency, locale) => {
			const parts = moneyParts(-1234567, currency, locale);
			const rebuilt =
				parts.symbolAfter ?
					`${parts.sign}${parts.integer}${parts.fraction} ${parts.symbol}`
				:	`${parts.sign}${parts.symbol}${parts.integer}${parts.fraction}`;

			expect(rebuilt.replace(/[   ]/g, "")).toBe(
				parts.text.replace(/[   ]/g, ""),
			);
		},
	);

	test("refuses an amount that is not a safe integer", () => {
		expect(() => moneyParts(1.5, "INR", IN)).toThrow(RangeError);
		expect(() => moneyParts(NaN, "INR", IN)).toThrow(RangeError);
	});
});

describe("percentTenths (MON-7, MON-8)", () => {
	// F04 AC-F04-06's boundary.
	test("rounds half away from zero", () => {
		expect(percentTenths(239850, 300000)).toBe(800);
		expect(percentTenths(239849, 300000)).toBe(799);
		expect(percentTenths(-239850, 300000)).toBe(-800);
		expect(percentTenths(-239849, 300000)).toBe(-799);
	});

	test("gives thirds to the nearest tenth", () => {
		expect(percentTenths(1, 3)).toBe(333);
		expect(percentTenths(2, 3)).toBe(667);
		expect(percentTenths(-2, 3)).toBe(-667);
	});

	test("takes its sign from both numbers", () => {
		expect(percentTenths(1, -4)).toBe(-250);
		expect(percentTenths(-1, -4)).toBe(250);
	});

	test("is 0 for zero, and never −0", () => {
		expect(percentTenths(0, 5)).toBe(0);
		expect(Object.is(percentTenths(-1, 3000), 0)).toBe(true);
		expect(Object.is(percentTenths(0, -5), 0)).toBe(true);
	});

	test("stays exact at MON-5's largest amount", () => {
		expect(percentTenths(99999999999, 1)).toBe(99999999999000);
		expect(percentTenths(99999999999, 99999999998)).toBe(1000);
		expect(percentTenths(1, 99999999999)).toBe(0);
	});

	test("refuses a zero denominator and anything but whole numbers", () => {
		expect(() => percentTenths(1, 0)).toThrow(RangeError);
		expect(() => percentTenths(1.5, 3)).toThrow(RangeError);
		expect(() => percentTenths(1, Number.NaN)).toThrow(RangeError);
		expect(() => percentTenths(2 ** 53, 3)).toThrow(RangeError);
	});

	test("agrees with formatPercent", () => {
		for (const [n, d] of [
			[239850, 300000],
			[-1, 3],
			[622000, 500000],
			[42000, 1100000],
		] as const) {
			const tenths = percentTenths(n, d);
			const text = formatPercent(n, d, "en-US-u-nu-latn");
			expect(text.replace("%", "").replace("−", "-")).toBe(
				(tenths / 10).toFixed(1),
			);
		}
	});
});

describe("formatPercent", () => {
	// Golden dataset: spending rose 3,119.00 on 28,049.00, which is +11.1%.
	test("is computed from two integers with one decimal", () => {
		expect(formatPercent(311900, 2804900, IN)).toBe("11.1%");
	});

	test("shows 100%, more than 100%, and zero", () => {
		expect(formatPercent(5, 5, IN)).toBe("100.0%");
		expect(formatPercent(15, 10, IN)).toBe("150.0%");
		expect(formatPercent(0, 7, IN)).toBe("0.0%");
	});

	test("shows a dash for a zero denominator, even for zero over zero (MON-8)", () => {
		expect(formatPercent(5, 0, IN)).toBe("—");
		expect(formatPercent(0, 0, IN)).toBe("—");
		expect(formatPercent(-5, 0, IN)).toBe("—");
	});

	test("rounds half away from zero, once", () => {
		expect(formatPercent(1, 16, IN)).toBe("6.3%"); // 6.25
		expect(formatPercent(-1, 16, IN)).toBe("−6.3%");
		expect(formatPercent(1, 2000, IN)).toBe("0.1%"); // 0.05
		expect(formatPercent(1, 3, IN)).toBe("33.3%");
		expect(formatPercent(2, 3, IN)).toBe("66.7%");
		expect(formatPercent(1, 1999, IN)).toBe("0.1%"); // 0.0500250...
		expect(formatPercent(1, 2001, IN)).toBe("0.0%"); // 0.04997...
	});

	test("is exact where a float would round the wrong way", () => {
		// 1.005 is not exactly representable as a float, so a float calculation could give 1.0.
		expect(formatPercent(1005, 100000, IN)).toBe("1.0%");
		expect(formatPercent(10050, 1000000, IN)).toBe("1.0%");
		// 0.35 * 100 is 35.00000000000001 in floats, which still has to read 35.0%.
		expect(formatPercent(35, 100, IN)).toBe("35.0%");
		expect(formatPercent(7, 8, IN)).toBe("87.5%");
	});

	test("shows the minus sign for a negative, and never a hyphen", () => {
		expect(formatPercent(-18420, 100000, IN)).toBe("−18.4%");
		expect(formatPercent(18420, -100000, IN)).toBe("−18.4%");
		expect(formatPercent(-18420, -100000, IN)).toBe("18.4%");
	});

	test("shows a plus only when asked, and never on zero", () => {
		expect(formatPercent(311900, 2804900, IN, { signDisplay: "always" })).toBe(
			"+11.1%",
		);
		expect(formatPercent(0, 5, IN, { signDisplay: "always" })).toBe("0.0%");
		expect(formatPercent(-311900, 2804900, IN, { signDisplay: "always" })).toBe(
			"−11.1%",
		);
		expect(formatPercent(311900, 2804900, IN, { signDisplay: "negative" })).toBe(
			"11.1%",
		);
	});

	test("never shows a signed zero", () => {
		expect(formatPercent(-1, 100000, IN)).toBe("0.0%");
		expect(formatPercent(-1, 100000, IN, { signDisplay: "always" })).toBe(
			"0.0%",
		);
		expect(formatPercent(1, 100000, IN, { signDisplay: "always" })).toBe("0.0%");
	});

	test("follows the user's number format", () => {
		expect(formatPercent(311900, 2804900, DE)).toBe("11,1 %");
		expect(formatPercent(311900, 2804900, US)).toBe("11.1%");
	});

	test("works with large numbers without overflow", () => {
		expect(formatPercent(99_999_999_999, 99_999_999_999, IN)).toBe("100.0%");
		expect(
			formatPercent(Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER, IN),
		).toBe("100.0%");
		expect(formatPercent(1, Number.MAX_SAFE_INTEGER, IN)).toBe("0.0%");
	});

	test.each([
		[1.5, 2],
		[1, 2.5],
		[NaN, 1],
		[1, NaN],
		[Infinity, 1],
		[1, Infinity],
	])("refuses %s over %s", (numerator, denominator) => {
		expect(() => formatPercent(numerator, denominator, IN)).toThrow(RangeError);
	});
});
