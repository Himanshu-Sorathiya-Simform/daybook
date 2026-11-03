// @vitest-environment node
import { isAPIError } from "better-auth/api";
import { describe, expect, test } from "vitest";
import {
	AUTH_REFUSALS,
	isBody,
	MAX_EMAIL,
	MAX_NAME,
	normalizeEmail,
	normalizeName,
	refuse,
} from "../rules";

describe("normalizeEmail (BR-F01-01)", () => {
	test.each([
		["asha@example.com", "asha@example.com"],
		["Asha@Example.COM", "asha@example.com"],
		["  asha@example.com  ", "asha@example.com"],
		["\tAsha@Example.com\n", "asha@example.com"],
		["\r\n ASHA@EXAMPLE.COM \r\n", "asha@example.com"],
		// The no-break space is whitespace to `trim`.
		[" asha@example.com ", "asha@example.com"],
		["", ""],
		["   ", ""],
		// Not an email: left for Better Auth's validation, only trimmed and lowercased.
		["Not An Email", "not an email"],
	])("%j becomes %j", (input, expected) => {
		expect(normalizeEmail(input)).toBe(expected);
	});

	test("keeps inner characters other than case, so plus addressing survives", () => {
		expect(normalizeEmail("Asha+Bills@Example.com")).toBe(
			"asha+bills@example.com",
		);
	});

	test.each([undefined, null, 5, true, {}, ["a@b.c"]])(
		"returns %j unchanged, for Better Auth's validation to refuse",
		(input) => {
			expect(normalizeEmail(input)).toBe(input);
		},
	);
});

describe("normalizeName (BR-F01-01, root 6.7)", () => {
	test.each([
		["Asha", "Asha"],
		["  Asha  ", "Asha"],
		["Asha\n", "Asha"],
		["\tAsha Rao\t", "Asha Rao"],
		["Asha  Rao", "Asha  Rao"],
		["आशा", "आशा"],
		["أشا", "أشا"],
		["李", "李"],
		["A", "A"],
		["😀", "😀"],
	])("accepts %j as %j", (input, expected) => {
		expect(normalizeName(input)).toBe(expected);
	});

	test("normalizes to NFC, so a decomposed é is stored composed", () => {
		const decomposed = "René";
		expect(normalizeName(decomposed)).toBe("René");
	});

	test("counts 50 code points after NFC, not UTF-16 units", () => {
		// 50 decomposed é are 100 code points before NFC and 50 after.
		expect(normalizeName("é".repeat(50))).toBe("é".repeat(50));
		// Each emoji is 2 UTF-16 units but 1 code point.
		expect(normalizeName("😀".repeat(MAX_NAME))).toBe("😀".repeat(MAX_NAME));
		expect(normalizeName("😀".repeat(MAX_NAME + 1))).toBeNull();
	});

	test("accepts exactly 50 characters and refuses 51", () => {
		expect(MAX_NAME).toBe(50);
		expect(normalizeName("a".repeat(50))).toBe("a".repeat(50));
		expect(normalizeName("a".repeat(51))).toBeNull();
	});

	test("measures after trimming, so 50 characters with spaces around are allowed", () => {
		expect(normalizeName(`  ${"a".repeat(50)}  `)).toBe("a".repeat(50));
	});

	test("counts each code point of a joined emoji", () => {
		// A family emoji is 5 code points: 3 people and 2 zero-width joiners.
		const family = "👨‍👩‍👧";
		expect(normalizeName(family.repeat(10))).toBe(family.repeat(10));
		expect(normalizeName(`${family.repeat(10)}a`)).toBeNull();
	});

	test.each([
		["empty", ""],
		["spaces only", "   "],
		["a zero-width space only", "​"],
		["joiners and a variation selector only", "‍‌️"],
	])("refuses %s", (_, input) => {
		expect(normalizeName(input)).toBeNull();
	});

	test.each([
		["a NUL", "As\u0000ha"],
		["a tab inside", "As\tha"],
		["a line feed inside", "As\nha"],
		["a carriage return inside", "As\rha"],
		["DEL", "As\u007fha"],
		["a C1 control (NEL)", "As\u0085ha"],
		["the last C1 control", "As\u009fha"],
		["a line separator", "As ha"],
		["a paragraph separator", "As ha"],
		["a lone high surrogate", "As\ud800ha"],
		["a lone low surrogate", "As\udc00ha"],
	])("refuses %s", (_, input) => {
		expect(normalizeName(input)).toBeNull();
	});

	test.each([undefined, null, 0, 42, true, {}, ["Asha"]])(
		"refuses %j",
		(input) => {
			expect(normalizeName(input)).toBeNull();
		},
	);
});

describe("isBody", () => {
	test.each([{}, { email: "a@b.c" }, Object.create(null) as object])(
		"accepts the object %j",
		(input) => {
			expect(isBody(input)).toBe(true);
		},
	);

	test.each([undefined, null, "body", 0, true, [], [{ name: "Asha" }]])(
		"refuses %j",
		(input) => {
			expect(isBody(input)).toBe(false);
		},
	);
});

describe("refusals", () => {
	test("the limits are F01's", () => {
		expect(MAX_EMAIL).toBe(254);
		expect(MAX_NAME).toBe(50);
	});

	test("messages match F01, section 8, where F01 names one", () => {
		expect(AUTH_REFUSALS).toEqual({
			INVALID_EMAIL: "Enter a valid email address, like name@example.com.",
			INVALID_NAME: "Enter a name of up to 50 characters.",
			FIELD_NOT_ALLOWED: "Only the name can be changed.",
			PASSWORD_BREACHED:
				"This password has appeared in a data breach. Choose a different one.",
		});
	});

	test.each(Object.keys(AUTH_REFUSALS) as (keyof typeof AUTH_REFUSALS)[])(
		"%s is a 400 in Better Auth's error shape",
		(code) => {
			const error = refuse(code);
			expect(isAPIError(error)).toBe(true);
			expect(error.statusCode).toBe(400);
			expect(error.body).toEqual({ code, message: AUTH_REFUSALS[code] });
		},
	);
});
