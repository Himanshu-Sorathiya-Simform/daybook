import type { AnyFieldApi } from "@tanstack/react-form";
import { describe, expect, test } from "vitest";

import { fieldError } from "../field-error";

/** The two parts of a TanStack field that `fieldError` reads. */
const field = (name: string, errors: unknown[]) =>
	({ name, state: { meta: { errors } } }) as unknown as AnyFieldApi;

describe("fieldError", () => {
	test("the field's own first check message", () => {
		expect(
			fieldError(
				field("email", [{ message: "Enter your email." }, { message: "x" }]),
				null,
			),
		).toBe("Enter your email.");
	});

	test("nothing without a message", () => {
		expect(fieldError(field("email", []), null)).toBeUndefined();
	});

	test("the server's refusal of this field wins over its own checks", () => {
		expect(
			fieldError(field("email", [{ message: "Enter your email." }]), {
				field: "email",
				message: "An account with this email already exists.",
			}),
		).toBe("An account with this email already exists.");
	});

	test("another field's refusal does not show here", () => {
		expect(
			fieldError(field("email", []), {
				field: "password",
				message: "Use at least 12 characters.",
			}),
		).toBeUndefined();
	});

	test("a refusal of the whole form does not show under a field", () => {
		expect(
			fieldError(field("email", []), {
				form: "Something went wrong. Try again.",
			}),
		).toBeUndefined();
	});

	test("an error without a message gives nothing", () => {
		expect(fieldError(field("email", [undefined]), null)).toBeUndefined();
	});
});
