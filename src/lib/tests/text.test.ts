import { describe, expect, test } from "vitest";

import {
	codePointLength,
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
