import { describe, expect, test } from "vitest";

import { AUTH_MESSAGES } from "../messages";
import { loginSchema, MAX_EMAIL, signUpSchema } from "../schemas";

const VALID = {
	email: "asha@example.com",
	password: "correct horse battery",
	name: "Asha",
};

/** The first message per field, or `{}` when the values pass. */
function messages(schema: typeof signUpSchema | typeof loginSchema, values: object) {
	const result = schema.safeParse(values);
	if (result.success) return {};
	const out: Record<string, string> = {};
	for (const issue of result.error.issues)
		out[issue.path.join(".")] ??= issue.message;
	return out;
}

/** A valid address of exactly `length` characters. */
const emailOf = (length: number) =>
	`${"a".repeat(length - "@example.com".length)}@example.com`;

describe("signUpSchema (F01 section 3 and 8)", () => {
	test("accepts F01's example", () => {
		expect(messages(signUpSchema, VALID)).toEqual({});
	});

	describe("email", () => {
		test.each([
			["empty", ""],
			["only spaces", "   "],
		])("asks for one when %s", (_name, email) => {
			expect(messages(signUpSchema, { ...VALID, email })).toEqual({
				email: AUTH_MESSAGES.emailRequired,
			});
		});

		test.each([
			"asha",
			"asha@",
			"@example.com",
			"asha@@example.com",
			"asha example@x.com",
		])("refuses %j as not an address", (email) => {
			expect(messages(signUpSchema, { ...VALID, email })).toEqual({
				email: AUTH_MESSAGES.emailInvalid,
			});
		});

		test("takes 254 characters and refuses 255 with its own line", () => {
			expect(MAX_EMAIL).toBe(254);
			expect(
				messages(signUpSchema, { ...VALID, email: emailOf(254) }),
			).toEqual({});
			expect(
				messages(signUpSchema, { ...VALID, email: emailOf(255) }),
			).toEqual({
				email: AUTH_MESSAGES.emailTooLong,
			});
		});

		test("counts the length after trimming, as the server does", () => {
			expect(
				messages(signUpSchema, { ...VALID, email: `  ${emailOf(254)}  ` }),
			).toEqual({});
		});

		test("accepts mixed case; the server lowercases it (BR-F01-01)", () => {
			expect(
				messages(signUpSchema, { ...VALID, email: "Asha@Example.COM" }),
			).toEqual({});
		});
	});

	describe("password (SEC-10)", () => {
		test("asks for one when empty", () => {
			expect(messages(signUpSchema, { ...VALID, password: "" })).toEqual({
				password: AUTH_MESSAGES.passwordRequired,
			});
		});

		test.each([
			[11, AUTH_MESSAGES.passwordTooShort],
			[12, undefined],
			[128, undefined],
			[129, AUTH_MESSAGES.passwordTooLong],
		])("%i characters: %s", (length, message) => {
			const result = messages(signUpSchema, {
				...VALID,
				password: "x".repeat(length),
			});
			expect(result).toEqual(message ? { password: message } : {});
		});

		test("is never trimmed: twelve spaces is a password", () => {
			expect(
				messages(signUpSchema, { ...VALID, password: " ".repeat(12) }),
			).toEqual({});
		});

		test("has no rules on what the characters are", () => {
			expect(
				messages(signUpSchema, { ...VALID, password: "aaaaaaaaaaaa" }),
			).toEqual({});
		});

		test("counts as Better Auth counts, in UTF-16 units: an emoji is two", () => {
			// Six emoji are 12 units, so the server takes them; five and one letter are 11.
			expect(
				messages(signUpSchema, { ...VALID, password: "🙂".repeat(6) }),
			).toEqual({});
			expect(
				messages(signUpSchema, { ...VALID, password: `${"🙂".repeat(5)}x` }),
			).toEqual({ password: AUTH_MESSAGES.passwordTooShort });
			// 64 emoji are 128 units; one more letter is 129.
			expect(
				messages(signUpSchema, { ...VALID, password: "🙂".repeat(64) }),
			).toEqual({});
			expect(
				messages(signUpSchema, {
					...VALID,
					password: `${"🙂".repeat(64)}x`,
				}),
			).toEqual({ password: AUTH_MESSAGES.passwordTooLong });
		});

		test("counts an email's length in UTF-16 units too, as the server's hook does", () => {
			// An address with an emoji local part: 121 emoji are 242 units, plus 12 is 254.
			const at254 = `${"🙂".repeat(121)}@example.com`;
			const at256 = `${"🙂".repeat(122)}@example.com`;
			expect(at254.length).toBe(254);
			expect(messages(signUpSchema, { ...VALID, email: at256 })).toEqual({
				email: AUTH_MESSAGES.emailTooLong,
			});
			expect(
				messages(signUpSchema, { ...VALID, email: at254 })["email"],
			).not.toBe(AUTH_MESSAGES.emailTooLong);
		});
	});

	describe("display name (BR-F01-01)", () => {
		test.each([
			["empty", ""],
			["only spaces", "   "],
			["51 characters", "a".repeat(51)],
			["a control character", "As\u0007ha"],
			["a line break inside", "As\nha"],
			["only invisible characters", "​​"],
		])("refuses %s", (_name, name) => {
			expect(messages(signUpSchema, { ...VALID, name })).toEqual({
				name: AUTH_MESSAGES.name,
			});
		});

		test.each([
			["one character", "A"],
			["50 characters", "a".repeat(50)],
			["50 characters padded with spaces", `  ${"a".repeat(50)}  `],
			["50 emoji, counted as code points", "🙂".repeat(50)],
			["accents in NFD form", "Amélie"],
		])("accepts %s", (_name, name) => {
			expect(messages(signUpSchema, { ...VALID, name })).toEqual({});
		});

		test("51 emoji is too long", () => {
			expect(
				messages(signUpSchema, { ...VALID, name: "🙂".repeat(51) }),
			).toEqual({
				name: AUTH_MESSAGES.name,
			});
		});
	});

	test("an empty form gets every field's message", () => {
		expect(
			messages(signUpSchema, { email: "", password: "", name: "" }),
		).toEqual({
			email: AUTH_MESSAGES.emailRequired,
			password: AUTH_MESSAGES.passwordRequired,
			name: AUTH_MESSAGES.name,
		});
	});
});

describe("loginSchema", () => {
	test("asks only that a password was typed", () => {
		expect(
			messages(loginSchema, { email: "asha@example.com", password: "x" }),
		).toEqual({});
		expect(
			messages(loginSchema, { email: "asha@example.com", password: "" }),
		).toEqual({
			password: AUTH_MESSAGES.passwordRequired,
		});
	});

	test("checks the email as sign-up does", () => {
		expect(messages(loginSchema, { email: "", password: "x" })).toEqual({
			email: AUTH_MESSAGES.emailRequired,
		});
		expect(messages(loginSchema, { email: "asha", password: "x" })).toEqual({
			email: AUTH_MESSAGES.emailInvalid,
		});
		expect(
			messages(loginSchema, { email: emailOf(255), password: "x" }),
		).toEqual({
			email: AUTH_MESSAGES.emailTooLong,
		});
	});
});
