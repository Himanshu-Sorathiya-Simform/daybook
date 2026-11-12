import { describe, expect, test } from "vitest";

import { AUTH_MESSAGES, authFailure, SIGN_UP_TEXT } from "../messages";

describe("AUTH_MESSAGES (F01 section 8, D-510)", () => {
	test("holds F01's exact wording", () => {
		expect(AUTH_MESSAGES).toEqual({
			emailRequired: "Enter your email.",
			emailInvalid: "Enter a valid email address, like name@example.com.",
			emailTooLong: "Use an email address of up to 254 characters.",
			emailTaken: "An account with this email already exists.",
			passwordRequired: "Enter a password.",
			passwordTooShort: "Use at least 12 characters.",
			passwordTooLong: "Use 128 characters or fewer.",
			passwordBreached:
				"This password has appeared in a data breach. Choose a different one.",
			name: "Enter a name of up to 50 characters.",
			wrongCredentials: "Email or password is incorrect.",
			rateLimited: "Too many attempts. Wait a few seconds and try again.",
			offline: "You are offline. Connect to log in.",
			oldSession:
				"We couldn't finish logging out the last session. Try again in a moment.",
			failed: "Something went wrong. Try again.",
			expired: "Your session has expired. Log in to continue.",
			forgotPassword:
				"Password reset by email is not available in this demo. Ask the developer to reset it.",
		});
	});
});

describe("SIGN_UP_TEXT (F01 section 6)", () => {
	test("holds the sign-up screen's hints and line", () => {
		expect(SIGN_UP_TEXT).toEqual({
			nameHint: "Shown in Daybook. You can change it later in Settings.",
			passwordHint: "At least 12 characters.",
			nextStep:
				"Next, you'll confirm your country, currency, time zone and week start.",
		});
	});
});

describe("authFailure", () => {
	test.each([
		[
			"USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL",
			422,
			{ field: "email", message: AUTH_MESSAGES.emailTaken },
		],
		[
			"USER_ALREADY_EXISTS",
			422,
			{ field: "email", message: AUTH_MESSAGES.emailTaken },
		],
		[
			"INVALID_EMAIL",
			400,
			{ field: "email", message: AUTH_MESSAGES.emailInvalid },
		],
		[
			"PASSWORD_TOO_SHORT",
			400,
			{ field: "password", message: AUTH_MESSAGES.passwordTooShort },
		],
		[
			"PASSWORD_TOO_LONG",
			400,
			{ field: "password", message: AUTH_MESSAGES.passwordTooLong },
		],
		[
			"PASSWORD_BREACHED",
			400,
			{ field: "password", message: AUTH_MESSAGES.passwordBreached },
		],
		["INVALID_NAME", 400, { field: "name", message: AUTH_MESSAGES.name }],
		["INVALID_EMAIL_OR_PASSWORD", 401, { form: AUTH_MESSAGES.wrongCredentials }],
	])("%s (%i) shows %o", (code, status, expected) => {
		expect(authFailure({ code, status })).toEqual(expected);
	});

	// BR-F01-08
	test("a 429 without a code is the rate-limit line", () => {
		expect(authFailure({ status: 429 })).toEqual({
			form: AUTH_MESSAGES.rateLimited,
		});
	});

	test("a code wins over the status", () => {
		expect(authFailure({ code: "INVALID_NAME", status: 429 })).toEqual({
			field: "name",
			message: AUTH_MESSAGES.name,
		});
	});

	test.each([
		["an unknown code", { code: "SOMETHING_NEW", status: 400 }],
		["a server error", { status: 500 }],
		["a 503", { status: 503 }],
		["a 403 from the origin check", { code: "INVALID_ORIGIN", status: 403 }],
		["our allow-list's 404", { status: 404 }],
		["FIELD_NOT_ALLOWED", { code: "FIELD_NOT_ALLOWED", status: 400 }],
		["no status at all", { status: 0 }],
	])("%s is the generic line (D-510)", (_name, error) => {
		expect(authFailure(error)).toEqual({ form: AUTH_MESSAGES.failed });
	});
});
