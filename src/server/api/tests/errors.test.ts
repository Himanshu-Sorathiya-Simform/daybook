// @vitest-environment node
import { DrizzleQueryError } from "drizzle-orm";
import { inspect } from "node:util";
import { DatabaseError } from "pg";
import { describe, expect, test } from "vitest";
import { z } from "zod";
import {
	ApiError,
	databaseErrorOf,
	describeDatabaseError,
	describeError,
	envelope,
	ERRORS,
	fromZodError,
	toApiError,
} from "../errors";

function dbError(
	fields: Partial<DatabaseError> & { message?: string },
): DatabaseError {
	const error = new DatabaseError(fields.message ?? "database error", 0, "error");
	Object.assign(error, fields);
	return error;
}

describe("ERRORS", () => {
	test.each([
		["bad_request", 400],
		["unauthenticated", 401],
		["cross_origin", 403],
		["profile_required", 403],
		["premium_required", 403],
		["feature_off", 403],
		["not_found", 404],
		["version_conflict", 409],
		["build_mismatch", 409],
		["id_conflict", 409],
		["has_dependents", 409],
		["payload_too_large", 413],
		["unsupported_media_type", 415],
		["validation_failed", 422],
		["parent_missing", 422],
		["idempotency_key_reused", 422],
		["currency_mismatch", 422],
		["date_out_of_window", 422],
		["rate_limited", 429],
		["internal", 500],
		["timeout", 503],
	] as const)("%s answers %i (API-9)", (code, status) => {
		expect(ERRORS[code].status).toBe(status);
	});

	test("holds exactly the twenty codes of P2, section 8, and F03's date_out_of_window", () => {
		expect(Object.keys(ERRORS)).toHaveLength(21);
	});

	test("gives every code a message that ends with a full stop", () => {
		for (const { message } of Object.values(ERRORS))
			expect(message).toMatch(/\.$/);
	});
});

describe("ApiError", () => {
	test("takes its status and default message from its code", () => {
		const error = new ApiError("version_conflict");
		expect(error).toMatchObject({
			code: "version_conflict",
			status: 409,
			message: "This was changed on another device.",
			fields: {},
			details: {},
			securityEvent: false,
			name: "ApiError",
		});
	});

	test("keeps a message, fields, details and cause given to it", () => {
		const cause = new Error("root");
		const error = new ApiError("validation_failed", {
			message: "Payee is required.",
			fields: { payee: "Required" },
			details: { limit: 3 },
			securityEvent: true,
			cause,
		});
		expect(error.message).toBe("Payee is required.");
		expect(error.fields).toEqual({ payee: "Required" });
		expect(error.details).toEqual({ limit: 3 });
		expect(error.securityEvent).toBe(true);
		expect(error.cause).toBe(cause);
	});
});

describe("envelope", () => {
	test("has the API-9 shape", () => {
		const error = new ApiError("validation_failed", {
			fields: { payee: "Required" },
		});
		expect(envelope(error, "req-1")).toEqual({
			error: {
				code: "validation_failed",
				message: "Some fields need attention.",
				fields: { payee: "Required" },
				details: {},
				requestId: "req-1",
			},
		});
	});

	test("says a failed read could not be loaded, since nothing was being saved", () => {
		expect(
			envelope(new ApiError("internal"), "r", { read: true }).error.message,
		).toBe("This could not be loaded.");
	});

	test("keeps the saving message for a failed write", () => {
		expect(envelope(new ApiError("internal"), "r").error.message).toBe(
			"Something went wrong on our side. Your change was not saved.",
		);
	});

	test("changes only internal's message for reads", () => {
		expect(
			envelope(new ApiError("not_found"), "r", { read: true }).error.message,
		).toBe(ERRORS.not_found.message);
	});
});

describe("fromZodError", () => {
	const schema = z.object({
		payee: z.string().min(1, "Required"),
		amountMinor: z.number(),
	});

	test("gives one message per field", () => {
		const result = schema.safeParse({ payee: "", amountMinor: "12" });
		const error = fromZodError(result.error!);
		expect(error.code).toBe("validation_failed");
		expect(Object.keys(error.fields).sort()).toEqual(["amountMinor", "payee"]);
		expect(error.fields["payee"]).toBe("Required");
	});

	test("keeps the first message when a field fails twice", () => {
		const twice = z.object({
			name: z.string().min(3, "Too short").regex(/^a/, "Starts with a"),
		});
		expect(fromZodError(twice.safeParse({ name: "b" }).error!).fields).toEqual({
			name: "Too short",
		});
	});

	test("joins nested paths with dots", () => {
		const nested = z.object({ items: z.array(z.object({ id: z.string() })) });
		expect(
			Object.keys(
				fromZodError(nested.safeParse({ items: [{ id: 1 }] }).error!).fields,
			),
		).toEqual(["items.0.id"]);
	});

	test("puts a problem with the whole body under _body", () => {
		expect(fromZodError(schema.safeParse("text").error!).fields).toHaveProperty(
			"_body",
		);
	});
});

describe("databaseErrorOf", () => {
	test("returns a Postgres error as it is", () => {
		const db = dbError({ code: "23505" });
		expect(databaseErrorOf(db)).toBe(db);
	});

	test("unwraps Drizzle's query error", () => {
		const db = dbError({ code: "23505" });
		expect(databaseErrorOf(new DrizzleQueryError("select 1", [], db))).toBe(db);
	});

	test.each([
		["a plain error", new Error("x")],
		["a string", "x"],
		["null", null],
	])("returns null for %s", (_label, value) => {
		expect(databaseErrorOf(value)).toBeNull();
	});
});

describe("describeDatabaseError", () => {
	test("names the SQLSTATE, table and constraint, and nothing that holds data", () => {
		const described = describeDatabaseError(
			dbError({
				code: "23505",
				table: "profile",
				constraint: "profile_user_id_key",
				detail: "Key (user_id)=(secret-value) already exists.",
				message:
					'duplicate key value violates unique constraint "profile_user_id_key"',
			}),
		);
		expect(described).toEqual({
			sqlstate: "23505",
			table: "profile",
			constraint: "profile_user_id_key",
		});
		expect(JSON.stringify(described)).not.toContain("secret-value");
	});

	test("adds the column for a NOT NULL violation", () => {
		expect(
			describeDatabaseError(
				dbError({ code: "23502", table: "profile", column: "country" }),
			),
		).toEqual({ sqlstate: "23502", table: "profile", column: "country" });
	});
});

describe("describeError", () => {
	const duplicate = () =>
		dbError({
			code: "23505",
			table: "user",
			constraint: "user_email_unique",
			detail: "Key (email)=(asha@example.com) already exists.",
		});

	test("gives a Postgres error's SQLSTATE, table and constraint, never its detail", () => {
		expect(describeError(duplicate())).toEqual({
			name: "DatabaseError",
			sqlstate: "23505",
			table: "user",
			constraint: "user_email_unique",
		});
	});

	test("unwraps Drizzle's wrapper and leaves its query and parameters out", () => {
		const wrapped = new DrizzleQueryError(
			'insert into "auth"."user" ("email") values ($1)',
			["asha@example.com"],
			duplicate(),
		);
		const described = describeError(wrapped);
		expect(described).toEqual(describeError(duplicate()));
		expect(inspect(described)).not.toContain("asha@example.com");
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

describe("toApiError (BR-P2-24)", () => {
	test("passes an ApiError through unchanged", () => {
		const error = new ApiError("version_conflict");
		expect(toApiError(error)).toBe(error);
	});

	test("maps a unique violation to validation_failed on its constraint's fields", () => {
		const error = toApiError(
			dbError({
				code: "23505",
				schema: "app",
				constraint: "idempotency_records_user_id_key_key",
			}),
		);
		expect(error.code).toBe("validation_failed");
		expect(error.fields).toEqual({
			userId: "This is already in use.",
			key: "This is already in use.",
		});
	});

	test.each([
		["a single-column unique", "auth", "user_email_unique", ["email"]],
		["a named single-column unique", "app", "profile_user_id_key", ["userId"]],
		[
			"an unnamed unique column",
			"app",
			"categories_position_unique",
			["position"],
		],
		["a primary key", "app", "profile_pkey", ["id"]],
		["a text primary key", "app", "currencies_pkey", ["code"]],
	])("names the fields of %s", (_label, schema, constraint, fields) => {
		expect(
			Object.keys(
				toApiError(dbError({ code: "23505", schema, constraint })).fields,
			),
		).toEqual(fields);
	});

	test("does not need the detail, which Postgres leaves out on tables with RLS", () => {
		const error = toApiError(
			dbError({
				code: "23505",
				schema: "app",
				constraint: "profile_user_id_key",
			}),
		);
		expect(error.fields).toEqual({ userId: "This is already in use." });
	});

	test("never copies a unique violation's values into the answer", () => {
		const error = toApiError(
			dbError({
				code: "23505",
				schema: "auth",
				constraint: "user_email_unique",
				detail: "Key (email)=(private@example.test) already exists.",
			}),
		);
		expect(JSON.stringify(envelope(error, "r"))).not.toContain(
			"private@example.test",
		);
	});

	test("maps a unique violation of a constraint the schema does not know to no fields", () => {
		expect(
			toApiError(
				dbError({ code: "23505", schema: "app", constraint: "mystery_key" }),
			).fields,
		).toEqual({});
	});

	test("matches a constraint within its own schema only", () => {
		expect(
			toApiError(
				dbError({
					code: "23505",
					schema: "auth",
					constraint: "profile_user_id_key",
				}),
			).fields,
		).toEqual({});
	});

	test("maps a check violation to validation_failed", () => {
		expect(toApiError(dbError({ code: "23514" })).code).toBe(
			"validation_failed",
		);
	});

	test("maps a NOT NULL violation to validation_failed on the column's field", () => {
		const error = toApiError(
			dbError({
				code: "23502",
				schema: "app",
				table: "profile",
				column: "week_start",
			}),
		);
		expect(error.code).toBe("validation_failed");
		expect(error.fields).toEqual({ weekStart: "Required" });
	});

	test("uses the column itself for a NOT NULL violation on a table the schema does not know", () => {
		expect(
			toApiError(
				dbError({
					code: "23502",
					schema: "app",
					table: "mystery",
					column: "x",
				}),
			).fields,
		).toEqual({ x: "Required" });
	});

	test("maps a NOT NULL violation without a column to no fields", () => {
		expect(toApiError(dbError({ code: "23502" })).fields).toEqual({});
	});

	test("maps a missing parent on insert or update to parent_missing", () => {
		expect(
			toApiError(
				dbError({
					code: "23503",
					detail: 'Key (currency)=(XXX) is not present in table "currencies".',
				}),
			).code,
		).toBe("parent_missing");
	});

	test("maps a delete that would orphan children to has_dependents", () => {
		expect(
			toApiError(
				dbError({
					code: "23503",
					detail: 'Key (code)=(INR) is still referenced from table "profile".',
				}),
			).code,
		).toBe("has_dependents");
	});

	test("maps an RLS WITH CHECK refusal to not_found, flagged as a security event", () => {
		const error = toApiError(
			dbError({
				code: "42501",
				message:
					'new row violates row-level security policy for table "profile"',
			}),
		);
		expect(error.code).toBe("not_found");
		expect(error.securityEvent).toBe(true);
	});

	test("maps any other permission error to internal, since it is a bug", () => {
		const error = toApiError(
			dbError({ code: "42501", message: "permission denied for schema auth" }),
		);
		expect(error.code).toBe("internal");
		expect(error.securityEvent).toBe(false);
	});

	test("maps a statement timeout to timeout, which the queue retries", () => {
		expect(toApiError(dbError({ code: "57014" })).code).toBe("timeout");
	});

	test.each([
		["a deadlock", "40P01"],
		["a bad uuid", "22P02"],
		["no code", undefined],
	])("maps %s to internal", (_label, code) => {
		expect(toApiError(dbError({ code })).code).toBe("internal");
	});

	test("maps a Postgres error inside Drizzle's wrapper by its own code", () => {
		const wrapped = new DrizzleQueryError(
			"insert ...",
			["secret"],
			dbError({ code: "57014" }),
		);
		expect(toApiError(wrapped).code).toBe("timeout");
	});

	test("maps any other error to internal and keeps it as the cause", () => {
		const cause = new TypeError("boom");
		const error = toApiError(cause);
		expect(error.code).toBe("internal");
		expect(error.cause).toBe(cause);
	});

	test("never uses Drizzle's message, which holds the query's parameter values", () => {
		const wrapped = new DrizzleQueryError(
			"insert into app.profile ...",
			["Swiggy", 64000],
			dbError({ code: "23514" }),
		);
		const answer = JSON.stringify(envelope(toApiError(wrapped), "r"));
		expect(answer).not.toContain("Swiggy");
		expect(answer).not.toContain("insert into");
	});
});
