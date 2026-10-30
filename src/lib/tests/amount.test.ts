import { afterEach, describe, expect, test, vi } from "vitest";

import {
	amountMessage,
	formatAmountInput,
	numberSigns,
	parseAmount,
	parseNumericQuery,
	parseUrlAmount,
	writeUrlAmount,
	type AmountError,
} from "@/lib/amount";
import { CURRENCY_EXPONENTS, maxMinor, type CurrencyCode } from "@/lib/currency";

// Number locales as F02 computes them (D-214): the country's format with Latin digits.
const IN = "hi-IN-u-nu-latn";
const US = "en-US-u-nu-latn";
const DE = "de-DE-u-nu-latn";
const FR = "fr-FR-u-nu-latn";
const AT = "de-AT-u-nu-latn";
const CH = "de-CH-u-nu-latn";
const JP = "ja-JP-u-nu-latn";
const KW = "en-KW-u-nu-latn";

const NBSP = " ";
const NNBSP = " ";

afterEach(() => {
	vi.restoreAllMocks();
});

type Case = [typed: string, numberLocale: string, currency: CurrencyCode];

function ok(typed: string, numberLocale: string, currency: CurrencyCode) {
	return parseAmount(typed, { currency, numberLocale });
}

describe("numberSigns (BR-F03-04)", () => {
	test.each([
		[IN, "INR", ".", [","], true],
		["en-IN-u-nu-latn", "INR", ".", [","], true],
		[US, "USD", ".", [","], false],
		[DE, "EUR", ",", ["."], false],
		[FR, "EUR", ",", [" "], false],
		[CH, "EUR", ".", ["'"], false],
		[JP, "JPY", ".", [","], false],
		[KW, "KWD", ".", [","], false],
		["en-GB-u-nu-latn", "GBP", ".", [","], false],
	] as [string, CurrencyCode, string, string[], boolean][])(
		"%s with %s: decimal %j, grouping %j, Indian grouping %s",
		(numberLocale, currency, decimal, groups, indian) => {
			expect(numberSigns(numberLocale, currency)).toEqual({
				decimal,
				groups,
				indian,
			});
		},
	);

	test("Austria has two grouping signs: the currency format's and the plain number's", () => {
		expect(numberSigns(AT, "EUR")).toEqual({
			decimal: ",",
			groups: [".", " "],
			indian: false,
		});
	});

	test("takes the decimal sign even for a currency with no decimals", () => {
		expect(numberSigns(JP, "JPY").decimal).toBe(".");
		expect(numberSigns(DE, "JPY").decimal).toBe(",");
	});

	test("falls back to . when a format shows no decimal sign", () => {
		vi.spyOn(Intl.NumberFormat.prototype, "formatToParts").mockReturnValue([
			{ type: "integer", value: "1234567" },
		]);

		expect(numberSigns("en-ZZ-u-nu-latn", "USD")).toEqual({
			decimal: ".",
			groups: [],
			indian: false,
		});
	});

	test("depends on the locale, not the currency", () => {
		expect(numberSigns(DE, "INR")).toEqual(numberSigns(DE, "EUR"));
		expect(numberSigns(IN, "EUR").indian).toBe(true);
	});
});

describe("parseAmount", () => {
	// F03 section 5, "Amount parsing", row for row. AC-F03-14.
	describe("the spec's table", () => {
		test.each([
			["1,240.50", IN, "INR", 124050],
			["1240.5", IN, "INR", 124050],
			["1,23,456.50", IN, "INR", 12345650],
			["1.234,50", DE, "EUR", 123450],
			["12,5", DE, "EUR", 1250],
			["1240", JP, "JPY", 1240],
			["1.25", KW, "KWD", 1250],
			["0.004", KW, "KWD", 4],
		] as [...Case, number][])(
			"%j in %s (%s) is %i",
			(typed, locale, currency, minor) => {
				expect(ok(typed, locale, currency)).toEqual({ ok: true, minor });
			},
		);

		test.each([
			["12.50", DE, "EUR", "wrong_decimal"],
			["12,50", US, "USD", "wrong_decimal"],
			["1240.5", JP, "JPY", "too_many_decimals"],
		] as [...Case, AmountError][])(
			"%j in %s (%s) is refused: %s",
			(typed, locale, currency, error) => {
				expect(ok(typed, locale, currency)).toEqual({ ok: false, error });
			},
		);
	});

	describe("grouping", () => {
		test.each([
			["1,234.56", IN, "INR", 123456],
			["1,234,567.89", IN, "INR", 123456789],
			["12,34,567", IN, "INR", 123456700],
			["12,34,56,789", IN, "INR", 12345678900],
			["1,234,567.89", US, "USD", 123456789],
			["1.234", DE, "EUR", 123400],
			["1.234.567,89", DE, "EUR", 123456789],
			["1,240", JP, "JPY", 1240],
			["1,240.500", KW, "KWD", 1240500],
		] as [...Case, number][])(
			"accepts %j in %s (%s) as %i",
			(typed, locale, currency, minor) => {
				expect(ok(typed, locale, currency)).toEqual({ ok: true, minor });
			},
		);

		test.each([
			[" ", "U+0020"],
			[NBSP, "U+00A0"],
			[NNBSP, "U+202F"],
		])("accepts a French space group written as %j (%s)", (space) => {
			expect(ok(`1${space}234${space}567,50`, FR, "EUR")).toEqual({
				ok: true,
				minor: 123456750,
			});
		});

		test.each(["'", "’"])(
			"accepts a Swiss group written as %j",
			(apostrophe) => {
				expect(ok(`1${apostrophe}234.50`, CH, "EUR")).toEqual({
					ok: true,
					minor: 123450,
				});
			},
		);

		test("accepts either of Austria's grouping signs", () => {
			expect(ok("1.234,50", AT, "EUR")).toEqual({ ok: true, minor: 123450 });
			expect(ok(`1${NBSP}234,50`, AT, "EUR")).toEqual({
				ok: true,
				minor: 123450,
			});
		});

		test("refuses two different grouping signs in one amount (D-459)", () => {
			expect(ok(`1.234${NBSP}567,00`, AT, "EUR")).toEqual({
				ok: false,
				error: "wrong_decimal",
			});
		});

		test.each([
			["12,34,567", US, "USD", "Indian grouping outside an Indian locale"],
			["1,2345", IN, "INR", "a last group of four digits"],
			["1,23,4567", IN, "INR", "a broken Indian grouping"],
			["1,23", US, "USD", "a group of two digits"],
			[",123", IN, "INR", "a leading grouping sign"],
			["123,", IN, "INR", "a trailing grouping sign"],
			["1,,234", IN, "INR", "two grouping signs in a row"],
			["1,234.5,6", IN, "INR", "a grouping sign after the decimal sign"],
			["1,2,3", IN, "INR", "single digits between commas"],
			["1234,567", US, "USD", "a first thousands group of four digits"],
			["1234,567", IN, "INR", "a first group of four digits in India"],
			["123,45,678", IN, "INR", "a first Indian group of three digits"],
			["1,234,56,789", IN, "INR", "thousands then Indian groups"],
			[".123", DE, "EUR", "a leading German grouping sign"],
			["1.234.5", DE, "EUR", "a German group of one digit"],
			["1.234,50", FR, "EUR", "a dot in a French amount"],
			["1,234.50", CH, "EUR", "a comma in a Swiss amount"],
		] as [...Case, string][])(
			"refuses %j in %s (%s) as wrong_decimal: %s",
			(typed, locale, currency) => {
				expect(ok(typed, locale, currency)).toEqual({
					ok: false,
					error: "wrong_decimal",
				});
			},
		);

		test("refuses a space where the locale does not group with spaces", () => {
			expect(ok("1 234.50", IN, "INR")).toEqual({
				ok: false,
				error: "not_a_number",
			});
		});

		test("refuses a grouping sign inside the decimals as not a number when it is not the other mark", () => {
			expect(ok("1,5 0", AT, "EUR")).toEqual({
				ok: false,
				error: "not_a_number",
			});
			expect(ok(`12,5${NNBSP}0`, FR, "EUR")).toEqual({
				ok: false,
				error: "not_a_number",
			});
		});

		test("refuses a misplaced French space group as not a number", () => {
			expect(ok("12 50", FR, "EUR")).toEqual({
				ok: false,
				error: "not_a_number",
			});
		});
	});

	describe("decimals", () => {
		test.each([
			[".5", IN, "INR", 50],
			["5.", IN, "INR", 500],
			[",5", DE, "EUR", 50],
			["0.50", IN, "INR", 50],
			["007", IN, "INR", 700],
			["0.01", IN, "INR", 1],
			["0.001", KW, "KWD", 1],
			["1.2", KW, "KWD", 1200],
		] as [...Case, number][])(
			"reads %j in %s (%s) as %i",
			(typed, locale, currency, minor) => {
				expect(ok(typed, locale, currency)).toEqual({ ok: true, minor });
			},
		);

		test.each([
			["1.234", IN, "INR"],
			["0.001", IN, "INR"],
			["12,345", DE, "EUR"],
			["1.2345", KW, "KWD"],
			["1240.0", JP, "JPY"],
		] as Case[])(
			"refuses %j in %s (%s): too many decimals",
			(typed, locale, currency) => {
				expect(ok(typed, locale, currency)).toEqual({
					ok: false,
					error: "too_many_decimals",
				});
			},
		);

		test("treats a misplaced other mark in a yen amount as decimals, which yen has none of", () => {
			expect(ok("12,50", JP, "JPY")).toEqual({
				ok: false,
				error: "too_many_decimals",
			});
		});

		test("refuses two decimal signs", () => {
			expect(ok("12..5", IN, "INR")).toEqual({
				ok: false,
				error: "not_a_number",
			});
			expect(ok("1.2.3", IN, "INR")).toEqual({
				ok: false,
				error: "not_a_number",
			});
			expect(ok("1,2,3", DE, "EUR")).toEqual({
				ok: false,
				error: "not_a_number",
			});
		});

		test("refuses a decimal sign with no digits", () => {
			expect(ok(".", IN, "INR")).toEqual({ ok: false, error: "not_a_number" });
			expect(ok(",", DE, "EUR")).toEqual({ ok: false, error: "not_a_number" });
		});
	});

	describe("characters that are not part of a number", () => {
		test.each([
			"-50",
			"+50",
			"1e3",
			"₹50",
			"50₹",
			"abc",
			"5 0",
			"1_000",
			"Infinity",
			"NaN",
			"0x10",
			"５０",
			"٥٠",
		])("refuses %j as not a number", (typed) => {
			expect(ok(typed, IN, "INR")).toEqual({
				ok: false,
				error: "not_a_number",
			});
		});
	});

	describe("empty, zero and the largest amount", () => {
		test.each(["", " ", "   ", "\t"])("refuses %j as required", (typed) => {
			expect(ok(typed, IN, "INR")).toEqual({ ok: false, error: "required" });
		});

		test("trims spaces around the amount", () => {
			expect(ok("  640  ", IN, "INR")).toEqual({ ok: true, minor: 64000 });
		});

		test.each([
			["0", IN, "INR"],
			["0.00", IN, "INR"],
			["000", IN, "INR"],
			["0,00", DE, "EUR"],
			["0", JP, "JPY"],
			["0.000", KW, "KWD"],
		] as Case[])("refuses %j in %s (%s) as zero", (typed, locale, currency) => {
			expect(ok(typed, locale, currency)).toEqual({
				ok: false,
				error: "zero",
			});
		});

		// BR-F03-03: the largest amount per currency, then one minor unit more.
		test.each([
			["999999999.99", "1000000000", IN, "INR"],
			["999,999,999.99", "1,000,000,000.00", US, "USD"],
			["999999999", "1000000000", JP, "JPY"],
			["999999999.999", "1000000000", KW, "KWD"],
			["999.999.999,99", "1.000.000.000", DE, "EUR"],
		] as [string, string, string, CurrencyCode][])(
			"accepts %j and refuses %j in %s (%s)",
			(largest, over, locale, currency) => {
				expect(ok(largest, locale, currency)).toEqual({
					ok: true,
					minor: maxMinor(currency),
				});
				expect(ok(over, locale, currency)).toEqual({
					ok: false,
					error: "too_large",
				});
			},
		);

		test("ignores leading zeros when checking the largest amount", () => {
			expect(ok("000999999999.99", IN, "INR")).toEqual({
				ok: true,
				minor: 99999999999,
			});
			expect(ok("0001000000000", IN, "INR")).toEqual({
				ok: false,
				error: "too_large",
			});
		});

		test("refuses a very long number without losing precision", () => {
			expect(ok("9".repeat(40), IN, "INR")).toEqual({
				ok: false,
				error: "too_large",
			});
		});

		test("checks the decimals before the size", () => {
			expect(ok("9999999999.999", IN, "INR")).toEqual({
				ok: false,
				error: "too_many_decimals",
			});
		});
	});

	test("answers a safe integer for every currency's largest amount", () => {
		for (const currency of Object.keys(CURRENCY_EXPONENTS) as CurrencyCode[]) {
			const text = formatAmountInput(maxMinor(currency), {
				currency,
				numberLocale: US,
			});
			const result = ok(text, US, currency);
			expect(result).toEqual({ ok: true, minor: maxMinor(currency) });
		}
	});
});

// T1: the edges of BR-F03-04, each worked out from the rule, not from the code.
describe("parseAmount edge cases (BR-F03-04, D-459, D-501)", () => {
	describe("a bare decimal sign", () => {
		test.each([
			[".5", IN, "INR", 50],
			["5.", IN, "INR", 500],
			["0.5", IN, "INR", 50],
			["00.5", IN, "INR", 50],
			[",5", DE, "EUR", 50],
			["5,", DE, "EUR", 500],
		] as [...Case, number][])(
			"reads %j in %s (%s) as %i, a decimal sign with digits on one side",
			(typed, locale, currency, minor) => {
				expect(ok(typed, locale, currency)).toEqual({ ok: true, minor });
			},
		);

		test.each([
			[".", IN, "INR", "not_a_number"],
			[",", DE, "EUR", "not_a_number"],
			["..", IN, "INR", "not_a_number"],
			// The other mark, with nothing around it, still names the right sign.
			[",", IN, "INR", "wrong_decimal"],
			[".", DE, "EUR", "wrong_decimal"],
		] as [...Case, AmountError][])(
			"refuses %j in %s (%s): %s",
			(typed, locale, currency, error) => {
				expect(ok(typed, locale, currency)).toEqual({ ok: false, error });
			},
		);
	});

	// D-501: a grouping starts at a digit above 0. "0,001" is how a German user writes a
	// thousandth, and reading it as 1,000 grouped with a leading zero would repeat the "12.50
	// read as 1,250" mistake that BR-F03-04's other-mark rule exists to stop.
	describe("a leading zero before a grouping sign", () => {
		test.each([
			["0,001", IN, "INR"],
			["0,000", IN, "INR"],
			["01,000", IN, "INR"],
			["0,00,000", IN, "INR"],
			["0,001", US, "USD"],
			["0.001", DE, "EUR"],
			["0.500", DE, "EUR"],
			["00.001", DE, "EUR"],
		] as Case[])(
			"refuses %j in %s (%s) as the other mark",
			(typed, locale, currency) => {
				expect(ok(typed, locale, currency)).toEqual({
					ok: false,
					error: "wrong_decimal",
				});
			},
		);

		test("in yen it shows the decimals message, as any misplaced mark does", () => {
			expect(ok("0,001", IN, "JPY")).toEqual({
				ok: false,
				error: "too_many_decimals",
			});
		});

		test("the decimal sign still takes a leading zero", () => {
			expect(ok("0,001", DE, "EUR")).toEqual({
				ok: false,
				error: "too_many_decimals",
			});
			expect(ok("0,001", DE, "KWD")).toEqual({ ok: true, minor: 1 });
			expect(ok("0,5", DE, "EUR")).toEqual({ ok: true, minor: 50 });
		});

		test.each([
			["1,000", IN, "INR", 100000],
			["10,000", IN, "INR", 1000000],
			["10,00,000", IN, "INR", 100000000],
			["100,000", US, "USD", 10000000],
			["1.000", DE, "EUR", 100000],
		] as [...Case, number][])(
			"a grouping that starts above 0 still reads: %j in %s (%s) is %i",
			(typed, locale, currency, minor) => {
				expect(ok(typed, locale, currency)).toEqual({ ok: true, minor });
			},
		);

		test("a leading zero in the whole part alone is fine", () => {
			expect(ok("0640", IN, "INR")).toEqual({ ok: true, minor: 64000 });
			expect(ok("007.50", IN, "INR")).toEqual({ ok: true, minor: 750 });
		});
	});

	// BR-F03-04: only U+0020, U+00A0 and U+202F read as a space group, and only where the
	// format groups with a space; `trim` takes every kind of space at the two ends.
	describe("spaces and invisible characters", () => {
		test.each([
			["thin space (U+2009)", "1\u2009000"],
			["ideographic space (U+3000)", "1\u3000000"],
			["figure space (U+2007)", "1\u2007000"],
			["zero-width space (U+200B)", "1\u200b000"],
			["zero-width no-break space (U+FEFF)", "1\ufeff000"],
			["a line feed", "1\n000"],
		])("refuses a %s inside a space-grouped amount", (_name, typed) => {
			expect(ok(typed, FR, "EUR")).toEqual({
				ok: false,
				error: "not_a_number",
			});
			expect(ok(typed, IN, "INR")).toEqual({
				ok: false,
				error: "not_a_number",
			});
		});

		test.each([
			["a thin space", "\u20091240.50"],
			["an ideographic space", "\u30001240.50"],
			["a byte order mark", "\ufeff1240.50"],
			["a no-break space", "\u00a01240.50"],
			["a line feed", "\n1240.50"],
		])("takes %s at either end, as any other space", (_name, typed) => {
			expect(ok(typed, IN, "INR")).toEqual({ ok: true, minor: 124050 });
			expect(ok(`${typed}\u2009`, IN, "INR")).toEqual({
				ok: true,
				minor: 124050,
			});
		});

		test("refuses a zero-width space at an end, which is not whitespace", () => {
			expect(ok("\u200b640", IN, "INR")).toEqual({
				ok: false,
				error: "not_a_number",
			});
			expect(ok("640\u200b", IN, "INR")).toEqual({
				ok: false,
				error: "not_a_number",
			});
		});

		test.each([
			["a space", "1 240,50"],
			["a no-break space", `1${NBSP}240,50`],
			["a narrow no-break space", `1${NNBSP}240,50`],
		])("reads %s as the group in a French amount", (_name, typed) => {
			expect(ok(typed, FR, "EUR")).toEqual({ ok: true, minor: 124050 });
		});
	});

	// D-459: one grouping sign in a whole amount. Austria groups with "." and with a space.
	describe("Austrian amounts, which hold two grouping signs", () => {
		test.each([
			["1.000,50", 100050],
			["1 000,50", 100050],
			[`1${NBSP}000,50`, 100050],
			[`1${NNBSP}000,50`, 100050],
			["1.234.567,89", 123456789],
			["1 234 567,89", 123456789],
		])("reads %j as %i", (typed, minor) => {
			expect(ok(typed, AT, "EUR")).toEqual({ ok: true, minor });
		});

		test.each([
			["1.000 000,50", "a point and a space"],
			["1 000.000,50", "a space and a point"],
			["1.000 000", "a point and a space with no decimals"],
		])("refuses %j: %s, which is two grouping signs", (typed) => {
			expect(ok(typed, AT, "EUR").ok).toBe(false);
		});

		test("refuses a point with the decimal comma, as the other mark", () => {
			expect(ok("1 000.50", AT, "EUR")).toEqual({
				ok: false,
				error: "wrong_decimal",
			});
			expect(ok("12.50", AT, "EUR")).toEqual({
				ok: false,
				error: "wrong_decimal",
			});
		});

		test("refuses an apostrophe, which Austria does not group with", () => {
			expect(ok("1'000,50", AT, "EUR")).toEqual({
				ok: false,
				error: "not_a_number",
			});
		});
	});

	describe("yen in an Indian format", () => {
		test.each([
			["1,240", 1240],
			["12,34,567", 1234567],
			["1240", 1240],
			// No decimal digits follow the sign, so none exceed yen's zero.
			["1240.", 1240],
		])("reads %j as %i yen", (typed, minor) => {
			expect(ok(typed, IN, "JPY")).toEqual({ ok: true, minor });
		});

		test.each(["1.240", "1,24,0", "12.5", "0.5"])(
			"shows the decimals message for %j",
			(typed) => {
				const result = ok(typed, IN, "JPY");
				expect(result.ok).toBe(false);
				if (!result.ok) expect(result.error).toBe("too_many_decimals");
			},
		);
	});

	// MON-5: 999,999,999.99 for INR, written with Indian grouping.
	describe("the INR maximum with Indian grouping", () => {
		test("99,99,99,999.99 is the largest amount", () => {
			expect(ok("99,99,99,999.99", IN, "INR")).toEqual({
				ok: true,
				minor: maxMinor("INR"),
			});
			expect(maxMinor("INR")).toBe(99_999_999_999);
		});

		test.each(["1,00,00,00,000", "1,00,00,00,000.00", "1,00,00,00,000.01"])(
			"%j is one past it, too large",
			(typed) => {
				expect(ok(typed, IN, "INR")).toEqual({
					ok: false,
					error: "too_large",
				});
			},
		);

		test("99,99,99,999 with no decimals is 999,999,999.00", () => {
			expect(ok("99,99,99,999", IN, "INR")).toEqual({
				ok: true,
				minor: 99_999_999_900,
			});
		});

		test("the same amount in thousands grouping is the same amount", () => {
			expect(ok("999,999,999.99", IN, "INR")).toEqual(
				ok("99,99,99,999.99", IN, "INR"),
			);
		});

		test("100,00,00,000 is a broken Indian grouping, not an amount", () => {
			expect(ok("100,00,00,000", IN, "INR")).toEqual({
				ok: false,
				error: "wrong_decimal",
			});
		});
	});
});

describe("amountMessage (F03 section 8)", () => {
	test.each([
		["required", IN, "INR", "Enter an amount."],
		["zero", IN, "INR", "Enter an amount above zero."],
		["not_a_number", IN, "INR", "Enter a number, like 1,240.50."],
		["not_a_number", DE, "EUR", "Enter a number, like 1.240,50."],
		["not_a_number", FR, "EUR", `Enter a number, like 1${NNBSP}240,50.`],
		["not_a_number", JP, "JPY", "Enter a number, like 1,240."],
		["not_a_number", KW, "KWD", "Enter a number, like 1,240.500."],
		["wrong_decimal", US, "USD", "Use . for decimals, like 12.50."],
		["wrong_decimal", IN, "INR", "Use . for decimals, like 12.50."],
		["wrong_decimal", DE, "EUR", "Use , for decimals, like 12,50."],
		["wrong_decimal", KW, "KWD", "Use . for decimals, like 12.500."],
		["too_many_decimals", IN, "INR", "Use at most 2 decimal places."],
		["too_many_decimals", JP, "JPY", "Yen amounts have no decimals."],
		["too_many_decimals", KW, "KWD", "Use at most 3 decimal places."],
		["too_large", US, "USD", "The largest amount is 999,999,999.99."],
		["too_large", IN, "INR", "The largest amount is 99,99,99,999.99."],
		["too_large", DE, "EUR", "The largest amount is 999.999.999,99."],
		["too_large", JP, "JPY", "The largest amount is 999,999,999."],
		["too_large", KW, "KWD", "The largest amount is 999,999,999.999."],
	] as [AmountError, string, CurrencyCode, string][])(
		"%s in %s (%s) reads %j",
		(error, numberLocale, currency, message) => {
			expect(amountMessage(error, { currency, numberLocale })).toBe(message);
		},
	);
});

describe("formatAmountInput, the blur re-format", () => {
	test.each([
		[124050, IN, "INR", "1,240.50"],
		[12345650, IN, "INR", "1,23,456.50"],
		[5, IN, "INR", "0.05"],
		[124050, US, "USD", "1,240.50"],
		[124050, DE, "EUR", "1.240,50"],
		[123450, FR, "EUR", `1${NNBSP}234,50`],
		[123450, AT, "EUR", "1.234,50"],
		[123450, CH, "EUR", "1'234.50"],
		[1240, JP, "JPY", "1,240"],
		[1250, KW, "KWD", "1.250"],
	] as [number, string, CurrencyCode, string][])(
		"writes %i in %s (%s) as %j, without a currency sign",
		(minor, numberLocale, currency, text) => {
			expect(formatAmountInput(minor, { currency, numberLocale })).toBe(text);
		},
	);

	// Every value the field writes on blur must read back as the same amount.
	test.each([
		[IN, "INR"],
		[US, "USD"],
		[DE, "EUR"],
		[FR, "EUR"],
		[AT, "EUR"],
		[CH, "EUR"],
		["en-GB-u-nu-latn", "GBP"],
		[JP, "JPY"],
		[KW, "KWD"],
	] as [string, CurrencyCode][])(
		"reads back exactly in %s (%s)",
		(numberLocale, currency) => {
			const amounts = [
				1,
				9,
				10,
				99,
				100,
				101,
				999,
				1000,
				64900,
				123456,
				1234567,
				98765432,
				maxMinor(currency),
			];
			for (const minor of amounts) {
				const text = formatAmountInput(minor, { currency, numberLocale });
				expect(parseAmount(text, { currency, numberLocale })).toEqual({
					ok: true,
					minor,
				});
			}
		},
	);
});

describe("URL amounts (BR-F03-36, root 6.9)", () => {
	test.each([
		["1500", "INR", 150000],
		["1500.5", "INR", 150050],
		["1500.50", "INR", 150050],
		["0.01", "INR", 1],
		["0015", "INR", 1500],
		["999999999.99", "INR", 99999999999],
		["1500", "JPY", 1500],
		["1.25", "KWD", 1250],
		["1.250", "KWD", 1250],
	] as [string, CurrencyCode, number][])(
		"reads %j in %s as %i",
		(text, currency, minor) => {
			expect(parseUrlAmount(text, currency)).toBe(minor);
		},
	);

	test.each([
		["", "INR", "empty"],
		["1,500", "INR", "grouping"],
		["1 500", "INR", "a space"],
		["1500,50", "INR", "a comma decimal"],
		["1500.505", "INR", "too many decimals"],
		["1500.0", "JPY", "any decimals in yen"],
		["1.2505", "KWD", "four decimals in dinars"],
		["-5", "INR", "a sign"],
		["+5", "INR", "a plus"],
		[".5", "INR", "no whole part"],
		["5.", "INR", "no decimals after the point"],
		["1e3", "INR", "an exponent"],
		["0", "INR", "zero"],
		["0.00", "INR", "zero with decimals"],
		["1000000000", "INR", "above the maximum"],
		[" 15", "INR", "a leading space"],
		["１５", "INR", "full-width digits"],
	] as [string, CurrencyCode, string][])(
		"refuses %j in %s: %s",
		(text, currency) => {
			expect(parseUrlAmount(text, currency)).toBeNull();
		},
	);

	test.each([
		[150000, "INR", "1500.00"],
		[150050, "INR", "1500.50"],
		[1, "INR", "0.01"],
		[99999999999, "INR", "999999999.99"],
		[1500, "JPY", "1500"],
		[1250, "KWD", "1.250"],
		[4, "KWD", "0.004"],
	] as [number, CurrencyCode, string][])(
		"writes %i in %s as %j",
		(minor, currency, text) => {
			expect(writeUrlAmount(minor, currency)).toBe(text);
		},
	);

	test("reads back what it writes, for every currency", () => {
		for (const currency of Object.keys(CURRENCY_EXPONENTS) as CurrencyCode[]) {
			for (const minor of [1, 7, 100, 64900, 123456789, maxMinor(currency)]) {
				expect(
					parseUrlAmount(writeUrlAmount(minor, currency), currency),
				).toBe(minor);
			}
		}
	});
});

describe("parseNumericQuery (BR-F03-35)", () => {
	// Golden check H: q=649 matches the two Netflix charges of 649.00.
	test.each([
		["649", "INR", 64900],
		["1,240.50", "INR", 124050],
		["1,23,456.50", "INR", 12345650],
		["12,34,567", "INR", 123456700],
		["1,234,567", "INR", 123456700],
		["12", "INR", 1200],
		["0.5", "INR", 50],
		["649", "JPY", 649],
		["1.25", "KWD", 1250],
	] as [string, CurrencyCode, number][])(
		"reads %j in %s as %i",
		(q, currency, minor) => {
			expect(parseNumericQuery(q, currency)).toBe(minor);
		},
	);

	// T1, D-501: a leading zero before a grouping sign is not an amount, so it is text.
	test.each([
		["0,001", "INR"],
		["01,000", "INR"],
		["0.001", "EUR"],
	] as [string, CurrencyCode][])(
		"treats %j as text, not an amount (D-501)",
		(q, currency) => {
			// Search reads one fixed format: "." decimal, "," grouping.
			expect(parseNumericQuery(q, currency)).toBeNull();
		},
	);

	test.each([
		[".5", "INR", 50],
		["5.", "INR", 500],
	] as [string, CurrencyCode, number][])(
		"reads %j as %i minor units",
		(q, currency, minor) => {
			expect(parseNumericQuery(q, currency)).toBe(minor);
		},
	);

	test.each([".", ",", "..", ",5"])("treats %j as text", (q) => {
		expect(parseNumericQuery(q, "INR")).toBeNull();
	});

	test.each([
		["swiggy", "INR", "text"],
		["50%", "INR", "a percent sign"],
		["6.4.9", "INR", "two points"],
		["649.001", "INR", "too many decimals"],
		["64.9", "JPY", "decimals in yen"],
		["1,2345", "INR", "a broken grouping"],
		["12,50", "INR", "a comma decimal"],
		["0", "INR", "zero, which the amount field refuses"],
		["1000000000", "INR", "above the maximum"],
		["-649", "INR", "a sign"],
		["", "INR", "empty"],
		[" 649", "INR", "a space"],
		["1.234,50", "INR", "a German amount"],
	] as [string, CurrencyCode, string][])(
		"treats %j in %s as text: %s",
		(q, currency) => {
			expect(parseNumericQuery(q, currency)).toBeNull();
		},
	);
});
