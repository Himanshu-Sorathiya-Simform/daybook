import { describe, expect, test } from "vitest";

import {
	codePointLength,
	lowercase,
	normalizeText,
	optionalTextSchema,
	textSchema,
} from "@/lib/text";

const PAYEE = {
	max: 80,
	messages: { required: "Enter who you paid, or who paid you." },
};

describe("normalizeText (root 6.7, BR-F03-12)", () => {
	test("trims spaces at both ends and keeps the ones inside", () => {
		expect(normalizeText("  Sunrise   Apartments  ")).toEqual({
			ok: true,
			value: "Sunrise   Apartments",
		});
	});

	test("trims every kind of whitespace at the ends, including no-break spaces", () => {
		expect(normalizeText("  Swiggy ")).toEqual({
			ok: true,
			value: "Swiggy",
		});
	});

	test("normalizes to NFC, so a combining accent joins its letter", () => {
		const decomposed = "Café";
		const result = normalizeText(decomposed);

		expect(result).toEqual({ ok: true, value: "Café" });
		expect(result.ok && codePointLength(result.value)).toBe(4);
	});

	test("keeps the case typed", () => {
		expect(normalizeText("sWiGgY")).toEqual({ ok: true, value: "sWiGgY" });
	});

	test("keeps emoji and text outside the Latin script", () => {
		expect(normalizeText("👍🏽 चाय")).toEqual({ ok: true, value: "👍🏽 चाय" });
	});

	test("turns an empty or blank string into an empty string", () => {
		expect(normalizeText("")).toEqual({ ok: true, value: "" });
		expect(normalizeText(" \n\t ")).toEqual({ ok: true, value: "" });
	});

	describe("control characters", () => {
		test.each([
			["U+0000", "\u0000"],
			["U+0009 (tab)", "\t"],
			["U+000A (line feed)", "\n"],
			["U+000D (carriage return)", "\r"],
			["U+001B (escape)", "\u001b"],
			["U+001F (unit separator, the search joiner)", "\u001f"],
			["U+007F (delete)", "\u007f"],
			["U+0085 (next line)", "\u0085"],
			["U+009F", "\u009f"],
		])("refuses %s inside single-line text", (_name, character) => {
			expect(normalizeText(`a${character}b`)).toEqual({ ok: false });
		});

		test.each([
			["U+0020 (space)", " "],
			["U+007E (tilde)", "~"],
			["U+00A0 (no-break space)", " "],
			["U+00AD (soft hyphen)", "­"],
			["U+200B (zero-width space)", "​"],
		])("accepts %s, which is not a control character", (_name, character) => {
			expect(normalizeText(`a${character}b`)).toEqual({
				ok: true,
				value: `a${character}b`,
			});
		});
	});

	// B3, D-498: a lone surrogate is not text. In a text column the driver would turn it into
	// U+FFFD, and in jsonb Postgres refuses it, so it is refused before either.
	describe("lone surrogates", () => {
		test.each([
			["a high surrogate alone", "a\ud800b"],
			["a low surrogate alone", "a\udc00b"],
			["a low surrogate before a high one", "\udc00\ud800"],
			["a high surrogate at the end", "Swiggy\ud83d"],
			["a low surrogate at the start", "\ude00Swiggy"],
			["two high surrogates", "\ud83d\ud83d"],
		])("refuses %s", (_name, text) => {
			expect(normalizeText(text)).toEqual({ ok: false });
			expect(normalizeText(text, { multiline: true })).toEqual({ ok: false });
		});

		test("accepts a surrogate pair, which is one character", () => {
			expect(normalizeText("👍")).toEqual({ ok: true, value: "👍" });
			expect(normalizeText("𝄞 𐐀")).toEqual({ ok: true, value: "𝄞 𐐀" });
		});
	});

	// Q3, D-498: a line must stay one line.
	describe("line and paragraph separators in single-line text", () => {
		test.each([
			["U+2028 (line separator)", "\u2028"],
			["U+2029 (paragraph separator)", "\u2029"],
		])("refuses %s inside text", (_name, character) => {
			expect(normalizeText(`a${character}b`)).toEqual({ ok: false });
		});

		test("trims them at the ends like any whitespace", () => {
			expect(normalizeText("\u2028Swiggy\u2029")).toEqual({
				ok: true,
				value: "Swiggy",
			});
		});

		test("a note keeps them inside, since it holds many lines", () => {
			expect(normalizeText("a\u2028b", { multiline: true })).toEqual({
				ok: true,
				value: "a\u2028b",
			});
		});
	});

	// Q3, D-498: text with nothing to see is empty, so a payee can't be made of zero-width spaces.
	describe("text of invisible characters only", () => {
		test.each([
			["a zero-width space", "\u200b"],
			["zero-width spaces", "\u200b\u200b\u200b"],
			["a zero-width joiner", "\u200d"],
			["a zero-width non-joiner", "\u200c"],
			["a left-to-right mark", "\u200e"],
			["a word joiner", "\u2060"],
			["a soft hyphen", "\u00ad"],
			["a variation selector", "\ufe0f"],
			["a combining grapheme joiner", "\u034f"],
			["a Hangul filler", "\u3164"],
			["a tag character", "\u{e0041}"],
			["invisible characters between spaces", " \u200b \u200b "],
			["an invisible character between no-break spaces", "\u00a0\u200b\u00a0"],
		])("turns %s into an empty string", (_name, text) => {
			expect(normalizeText(text)).toEqual({ ok: true, value: "" });
		});

		test("turns them into an empty string in a note too, line feeds included", () => {
			expect(normalizeText("\n\u200b\n", { multiline: true })).toEqual({
				ok: true,
				value: "",
			});
		});

		test.each([
			["a zero-width space before a letter", "\u200ba"],
			["a zero-width space between letters", "a\u200bb"],
			["a zero-width joiner inside an emoji", "👨\u200d👩\u200d👧"],
			["a variation selector after a heart", "❤\ufe0f"],
			["a skin tone emoji", "👍🏽"],
			["a Braille blank, which is a visible cell", "\u2800"],
		])("keeps %s", (_name, text) => {
			expect(normalizeText(text)).toEqual({ ok: true, value: text });
		});
	});

	describe("multiline text, as a note", () => {
		test("keeps line feeds", () => {
			expect(normalizeText("Line 1\nLine 2", { multiline: true })).toEqual({
				ok: true,
				value: "Line 1\nLine 2",
			});
		});

		test("turns CRLF into LF", () => {
			expect(
				normalizeText("Line 1\r\nLine 2\r\n\r\nLine 4", { multiline: true }),
			).toEqual({ ok: true, value: "Line 1\nLine 2\n\nLine 4" });
		});

		test("refuses a carriage return that is not part of CRLF", () => {
			expect(normalizeText("Line 1\rLine 2", { multiline: true })).toEqual({
				ok: false,
			});
		});

		test("refuses every other control character", () => {
			expect(normalizeText("a\tb", { multiline: true })).toEqual({
				ok: false,
			});
			expect(normalizeText("a\u001fb", { multiline: true })).toEqual({
				ok: false,
			});
			expect(normalizeText("a\u0085b", { multiline: true })).toEqual({
				ok: false,
			});
		});

		test("trims blank lines at the ends", () => {
			expect(normalizeText("\r\n\nNote\n\n", { multiline: true })).toEqual({
				ok: true,
				value: "Note",
			});
		});
	});
});

describe("codePointLength (D-230)", () => {
	test.each([
		["", 0],
		["Swiggy", 6],
		["Café", 4],
		["👍", 1],
		["👍🏽", 2],
		["𝄞", 1],
		["चाय", 3],
	])("counts %j as %i code points", (text, length) => {
		expect(codePointLength(text)).toBe(length);
	});

	test("differs from String length for characters outside the BMP", () => {
		expect("👍".length).toBe(2);
		expect(codePointLength("👍")).toBe(1);
	});
});

describe("textSchema, for required text", () => {
	const payee = textSchema(PAYEE);

	test("answers the normalized text", () => {
		expect(payee.parse("  Swiggy ")).toBe("Swiggy");
		expect(payee.parse("Café")).toBe("Café");
	});

	test("refuses empty and blank text with the field's own message", () => {
		for (const value of ["", "   ", "\n"]) {
			const result = payee.safeParse(value);
			expect(result.success).toBe(false);
			expect(result.error?.issues[0]?.message).toBe(
				"Enter who you paid, or who paid you.",
			);
		}
	});

	test("refuses a missing value or another type with the required message", () => {
		for (const value of [undefined, null, 42, {}]) {
			expect(payee.safeParse(value).error?.issues[0]?.message).toBe(
				"Enter who you paid, or who paid you.",
			);
		}
	});

	test("accepts exactly the maximum in code points and refuses one more", () => {
		expect(payee.parse("a".repeat(80))).toHaveLength(80);
		expect(payee.parse("👍".repeat(80))).toBe("👍".repeat(80));

		const over = payee.safeParse("👍".repeat(81));
		expect(over.error?.issues[0]?.message).toBe("Use 80 characters or fewer.");
	});

	test("measures the length after trimming", () => {
		expect(payee.parse(` ${"a".repeat(80)} `)).toHaveLength(80);
	});

	test("refuses control characters with the shared message", () => {
		expect(payee.safeParse("Swi\tggy").error?.issues[0]?.message).toBe(
			"Remove unsupported characters.",
		);
	});

	test("reports one issue at a time, so a field shows one message", () => {
		expect(payee.safeParse(`${"a".repeat(90)}\t`).error?.issues).toHaveLength(1);
	});

	test("takes custom messages for the length and the characters", () => {
		const name = textSchema({
			max: 40,
			messages: {
				required: "Enter a name.",
				tooLong: "Keep it short.",
				invalid: "No odd characters.",
			},
		});

		expect(name.safeParse("a".repeat(41)).error?.issues[0]?.message).toBe(
			"Keep it short.",
		);
		expect(name.safeParse("a\u0000").error?.issues[0]?.message).toBe(
			"No odd characters.",
		);
	});

	test("reports the field's path inside an object", () => {
		const issue = payee.safeParse("").error?.issues[0];
		expect(issue?.path).toEqual([]);
	});
});

describe("optionalTextSchema, for a description or note", () => {
	const description = optionalTextSchema({ max: 120 });
	const note = optionalTextSchema({ max: 500, multiline: true });

	test("stores empty, blank, null and missing as null (BR-F03-12)", () => {
		for (const value of ["", "   ", null, undefined]) {
			expect(description.parse(value)).toBeNull();
		}
	});

	test("answers the normalized text otherwise", () => {
		expect(description.parse(" Monthly groceries ")).toBe("Monthly groceries");
	});

	test("keeps line feeds only when multiline", () => {
		expect(note.parse("Paid in cash\r\nSplit with Asha")).toBe(
			"Paid in cash\nSplit with Asha",
		);
		expect(description.safeParse("a\nb").error?.issues[0]?.message).toBe(
			"Remove unsupported characters.",
		);
	});

	test("applies the length limit in code points", () => {
		expect(description.parse("é".repeat(120))).toHaveLength(120);
		expect(
			description.safeParse("é".repeat(121)).error?.issues[0]?.message,
		).toBe("Use 120 characters or fewer.");
		expect(note.safeParse("a".repeat(501)).error?.issues[0]?.message).toBe(
			"Use 500 characters or fewer.",
		);
	});

	test("refuses a value that is not text", () => {
		expect(description.safeParse(5).success).toBe(false);
	});
});

describe("the schemas apply the new text rules (D-498)", () => {
	const payee = textSchema(PAYEE);
	const description = optionalTextSchema({ max: 120 });

	test("a required text of invisible characters gets the field's own message", () => {
		expect(payee.safeParse("\u200b\u200b").error?.issues[0]?.message).toBe(
			"Enter who you paid, or who paid you.",
		);
	});

	test("an optional text of invisible characters is null", () => {
		expect(description.parse("\u200b")).toBeNull();
	});

	test("a lone surrogate gets the shared characters message", () => {
		expect(payee.safeParse("Sw\ud800").error?.issues[0]?.message).toBe(
			"Remove unsupported characters.",
		);
		expect(description.safeParse("a\udc00").error?.issues[0]?.message).toBe(
			"Remove unsupported characters.",
		);
	});

	test("a line separator gets the shared characters message", () => {
		expect(payee.safeParse("Swi\u2028ggy").error?.issues[0]?.message).toBe(
			"Remove unsupported characters.",
		);
	});
});

// B9, D-497: Postgres's built-in C.UTF-8 `lower()` maps one code point to one, with no context.
// JavaScript's `toLowerCase` has full mappings and the final-sigma rule, so it can't stand in.
describe("lowercase (D-497)", () => {
	test.each([
		["Swiggy", "swiggy"],
		["BIG BAZAAR", "big bazaar"],
		["", ""],
		["café ÉCOLE", "café école"],
		["१२३ चाय", "१२३ चाय"],
		["𐐀", "𐐨"],
		["ǅ", "ǆ"],
		["ẞ", "ß"],
	])("%j is %j", (text, lowered) => {
		expect(lowercase(text)).toBe(lowered);
	});

	test("İ, the dotted capital I, becomes a plain i, as Postgres does", () => {
		expect(lowercase("İstanbul Kebab")).toBe("istanbul kebab");
		// JavaScript gives "i" and a combining dot, which no search for "ist" would match.
		expect("İstanbul".toLowerCase()).toBe("i\u0307stanbul");
	});

	test("a capital sigma becomes σ at the end of a word too, as Postgres does", () => {
		expect(lowercase("ΟΔΟΣ")).toBe("οδοσ");
		expect(lowercase("Σ")).toBe("σ");
		// JavaScript gives the final form ς here.
		expect("ΟΔΟΣ".toLowerCase()).toBe("οδος");
	});

	test("leaves characters that Postgres 18's Unicode tables don't lowercase", () => {
		// Latin letters from Unicode 17 and Beria Erfe: Node lowercases them, Postgres 18 doesn't.
		expect(lowercase("\ua7ce\ua7d2\ua7d4")).toBe("\ua7ce\ua7d2\ua7d4");
		expect(lowercase("\u{16ea0}\u{16eb8}")).toBe("\u{16ea0}\u{16eb8}");
	});

	test("keeps a lone surrogate as it is", () => {
		expect(lowercase("A\ud800B")).toBe("a\ud800b");
	});

	test("is idempotent", () => {
		for (const text of ["İSTANBUL", "ΟΔΟΣ", "ǅ", "ẞ", "Swiggy"]) {
			expect(lowercase(lowercase(text))).toBe(lowercase(text));
		}
	});
});

// T1: lengths count code points after NFC, in both directions (D-230, BR-F03-12).
describe("length after NFC", () => {
	const payee = textSchema(PAYEE);

	test("a composition-excluded letter grows: 41 of U+0958 is 82 code points, refused at 80", () => {
		// U+0958 (QA) has no composed form in NFC: it becomes U+0915 U+093C, two code points.
		expect([..."\u0958".normalize("NFC")]).toHaveLength(2);
		expect(payee.parse("\u0958".repeat(40))).toHaveLength(80);
		expect(payee.safeParse("\u0958".repeat(41)).error?.issues[0]?.message).toBe(
			"Use 80 characters or fewer.",
		);
	});

	test("decomposed letters shrink: 80 NFD é is 80 code points once composed, and fits", () => {
		const decomposed = "e\u0301".repeat(80);
		expect([...decomposed]).toHaveLength(160);
		expect(payee.parse(decomposed)).toBe("\u00e9".repeat(80));
	});

	test("81 code points typed decomposed that compose to 80 are accepted; 81 composed are not", () => {
		const typed = `${"a".repeat(79)}e\u0301`;
		expect([...typed]).toHaveLength(81);
		expect(payee.parse(typed)).toBe(`${"a".repeat(79)}\u00e9`);
		expect(payee.safeParse("a".repeat(81)).success).toBe(false);
	});

	test("a note counts a CRLF as one code point, since it is stored as a line feed", () => {
		const note = optionalTextSchema({ max: 500, multiline: true });
		// 249 + CRLF + 250 is 501 typed, 500 stored. 250 + CRLF + 250 is 502 typed, 501 stored.
		expect(note.parse(`${"a".repeat(249)}\r\n${"b".repeat(250)}`)).toHaveLength(
			500,
		);
		expect(
			note.safeParse(`${"a".repeat(250)}\r\n${"b".repeat(250)}`).error
				?.issues[0]?.message,
		).toBe("Use 500 characters or fewer.");
	});
});

describe("line breaks at the ends of single-line text", () => {
	test.each([
		["a line feed", "\nSwiggy\n"],
		["a carriage return and line feed", "\r\nSwiggy\r\n"],
		["a tab", "\tSwiggy\t"],
		["a line separator and a paragraph separator", "\u2028Swiggy\u2029"],
		["several kinds", " \n\t Swiggy \r\n "],
	])("trims %s, then accepts the text", (_name, text) => {
		expect(normalizeText(text)).toEqual({ ok: true, value: "Swiggy" });
	});

	test("refuses one inside the text", () => {
		expect(normalizeText("Swi\nggy")).toEqual({ ok: false });
		expect(normalizeText("Swi\r\nggy")).toEqual({ ok: false });
	});

	// JavaScript's trim does not take U+0085, so it stays and is the control character it is.
	test("refuses a next-line character even at the ends, since it is not trimmed", () => {
		expect(normalizeText("\u0085Swiggy")).toEqual({ ok: false });
		expect(normalizeText("Swiggy\u0085")).toEqual({ ok: false });
	});
});
