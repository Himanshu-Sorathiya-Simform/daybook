// @vitest-environment node
import { inspect } from "node:util";
import { DrizzleQueryError } from "drizzle-orm/errors";
import { DatabaseError } from "pg";
import { afterEach, describe, expect, test, vi } from "vitest";
import { describeError, logAuth } from "../log";

function databaseError(): DatabaseError {
	const error = new DatabaseError(
		'duplicate key value violates unique constraint "user_email_unique"',
		0,
		"error",
	);
	error.code = "23505";
	error.schema = "auth";
	error.table = "user";
	error.constraint = "user_email_unique";
	error.detail = "Key (email)=(asha@example.com) already exists.";
	return error;
}

/** Drizzle's wrapper, whose message holds the query and its parameter values. */
function drizzleError(): DrizzleQueryError {
	return new DrizzleQueryError(
		'insert into "auth"."user" ("email") values ($1)',
		["asha@example.com"],
		databaseError(),
	);
}

describe("describeError", () => {
	test("gives a Postgres error's SQLSTATE, table and constraint, never its detail", () => {
		expect(describeError(databaseError())).toEqual({
			name: "DatabaseError",
			sqlstate: "23505",
			table: "user",
			constraint: "user_email_unique",
		});
	});

	test("unwraps Drizzle's wrapper and leaves its query and parameters out", () => {
		const described = describeError(drizzleError());
		expect(described).toEqual(describeError(databaseError()));
		expect(JSON.stringify(described)).not.toContain("asha@example.com");
	});

	test("gives only the name of any other error", () => {
		expect(describeError(new TypeError("token abc123 failed"))).toEqual({
			name: "TypeError",
		});
	});

	test("gives the type of something thrown that is not an error", () => {
		expect(describeError("asha@example.com")).toEqual({ name: "string" });
		expect(describeError(undefined)).toEqual({ name: "undefined" });
	});
});

describe("logAuth", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	test.each([
		["error", "error"],
		["warn", "warn"],
		["info", "log"],
		["debug", "log"],
	] as const)("writes %s to console.%s with an [auth] prefix", (level, method) => {
		const spy = vi.spyOn(console, method).mockImplementation(() => {});
		logAuth(level, "Something happened");
		expect(spy).toHaveBeenCalledWith("[auth] Something happened");
	});

	test("replaces an error argument with its description", () => {
		const spy = vi.spyOn(console, "error").mockImplementation(() => {});
		logAuth("error", "Failed to create user", drizzleError());
		expect(spy).toHaveBeenCalledWith("[auth] Failed to create user", {
			name: "DatabaseError",
			sqlstate: "23505",
			table: "user",
			constraint: "user_email_unique",
		});
		// inspect prints an error's message and cause, which JSON.stringify would drop.
		expect(inspect(spy.mock.calls, { depth: 10 })).not.toContain(
			"asha@example.com",
		);
	});

	test("drops every argument that is not an error", () => {
		const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
		logAuth(
			"warn",
			"Blocked",
			{ email: "asha@example.com" },
			"asha@example.com",
			42,
		);
		expect(spy).toHaveBeenCalledWith("[auth] Blocked");
	});

	test("keeps several errors in order", () => {
		const spy = vi.spyOn(console, "error").mockImplementation(() => {});
		logAuth("error", "Two", new RangeError("a"), { x: 1 }, new TypeError("b"));
		expect(spy).toHaveBeenCalledWith(
			"[auth] Two",
			{ name: "RangeError" },
			{ name: "TypeError" },
		);
	});
});
