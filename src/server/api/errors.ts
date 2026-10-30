import "server-only";
import { getTableColumns } from "drizzle-orm";
import { getTableConfig } from "drizzle-orm/pg-core";
import { DatabaseError } from "pg";
import type { z } from "zod";
import { ALL_TABLES } from "../db/schema";

/** The error codes P2 defines for every route (API-9, P2 section 8). A feature spec adds its
 * own codes, with their status and message, here when it is built. */
export const ERRORS = {
	bad_request: { status: 400, message: "The request could not be read." },
	unauthenticated: {
		status: 401,
		message: "Your session has expired. Log in again.",
	},
	cross_origin: {
		status: 403,
		message: "This request came from another site and was blocked.",
	},
	profile_required: {
		status: 403,
		message: "Finish setting up your profile first.",
	},
	premium_required: { status: 403, message: "This is part of Daybook Premium." },
	feature_off: { status: 403, message: "This feature is switched off right now." },
	not_found: {
		status: 404,
		message: "We could not find that. It may have been deleted.",
	},
	version_conflict: {
		status: 409,
		message: "This was changed on another device.",
	},
	build_mismatch: {
		status: 409,
		message: "Daybook was updated. Reload to keep saving changes.",
	},
	id_conflict: { status: 409, message: "This could not be created. Try again." },
	has_dependents: {
		status: 409,
		message: "This still has linked items. Remove them first.",
	},
	payload_too_large: {
		status: 413,
		message: "That is too much data for one request.",
	},
	unsupported_media_type: {
		status: 415,
		message: "This request format is not supported.",
	},
	validation_failed: { status: 422, message: "Some fields need attention." },
	parent_missing: {
		status: 422,
		message: "The item this belongs to no longer exists.",
	},
	idempotency_key_reused: {
		status: 422,
		message:
			"This change conflicts with an earlier one. Discard it and try again.",
	},
	currency_mismatch: {
		status: 422,
		message: "Not saved: your currency changed after this was made.",
	},
	// TIME-7: a user-entered date outside its entry window (F03, BR-F03-08).
	date_out_of_window: {
		status: 422,
		message: "Choose today or one of the 10 days before.",
	},
	// F03: a 21st saved Transactions view (BR-F03-63).
	limit_reached: {
		status: 422,
		message: "You have 20 views. Delete one to save another.",
	},
	rate_limited: {
		status: 429,
		message: "Too many attempts. Wait a few seconds and try again.",
	},
	timeout: { status: 503, message: "This took too long. We will try again." },
	internal: {
		status: 500,
		message: "Something went wrong on our side. Your change was not saved.",
	},
} as const satisfies Record<string, { status: number; message: string }>;

export type ErrorCode = keyof typeof ERRORS;

/** `internal` reads differently for a read, which saves nothing (P2 section 8). */
const INTERNAL_READ_MESSAGE = "This could not be loaded.";

export type ApiErrorOptions = {
	message?: string;
	/** One message per field, for `validation_failed` (API-9). */
	fields?: Record<string, string>;
	details?: Record<string, unknown>;
	/** Sent to Sentry as a security event, never to the user (BR-P2-24). */
	securityEvent?: boolean;
	cause?: unknown;
};

/** An error a route answers with: a code from `ERRORS`, its status and a safe message. */
export class ApiError extends Error {
	readonly code: ErrorCode;
	readonly status: number;
	readonly fields: Record<string, string>;
	readonly details: Record<string, unknown>;
	readonly securityEvent: boolean;

	constructor(code: ErrorCode, options: ApiErrorOptions = {}) {
		super(options.message ?? ERRORS[code].message, { cause: options.cause });
		this.name = "ApiError";
		this.code = code;
		this.status = ERRORS[code].status;
		this.fields = options.fields ?? {};
		this.details = options.details ?? {};
		this.securityEvent = options.securityEvent ?? false;
	}
}

export type ErrorEnvelope = {
	error: {
		code: ErrorCode;
		message: string;
		fields: Record<string, string>;
		details: Record<string, unknown>;
		requestId: string;
	};
};

/** The one error shape every route answers with (API-9). */
export function envelope(
	error: ApiError,
	requestId: string,
	{ read = false }: { read?: boolean } = {},
): ErrorEnvelope {
	return {
		error: {
			code: error.code,
			message:
				read && error.code === "internal" ?
					INTERNAL_READ_MESSAGE
				:	error.message,
			fields: error.fields,
			details: error.details,
			requestId,
		},
	};
}

/** The message for a body field no schema knows (P2 section 8, D-492). */
export const UNKNOWN_FIELD_MESSAGE = "Remove this field.";

/** Turns a Zod failure into `validation_failed` with one message per field (BR-P2-24). The
 * first message wins for a field; a problem with the body as a whole goes under `_body`. An
 * unknown field is named at its own path, such as `filter.month`, rather than on its parent
 * (D-492). */
export function fromZodError(error: z.ZodError): ApiError {
	const fields: Record<string, string> = {};
	for (const issue of error.issues) {
		if (issue.code === "unrecognized_keys") {
			for (const key of issue.keys) {
				fields[[...issue.path, key].join(".")] ??= UNKNOWN_FIELD_MESSAGE;
			}
			continue;
		}
		const field = issue.path.length > 0 ? issue.path.join(".") : "_body";
		fields[field] ??= issue.message;
	}
	return new ApiError("validation_failed", { fields, cause: error });
}

/** The Postgres error behind `error`, unwrapping Drizzle's `DrizzleQueryError`, whose own
 * message holds the query and its parameter values and must never be shown or logged. */
export function databaseErrorOf(error: unknown): DatabaseError | null {
	let current: unknown = error;
	for (let depth = 0; depth < 5 && current instanceof Error; depth++) {
		if (current instanceof DatabaseError) return current;
		current = current.cause;
	}
	return null;
}

/** What a database error may say in logs and Sentry: its SQLSTATE, table and constraint (or
 * column, for NOT NULL), never its message, detail, query or parameters (D-381). */
export function describeDatabaseError(error: DatabaseError): Record<string, string> {
	const described: Record<string, string> = { sqlstate: error.code ?? "unknown" };
	if (error.table) described["table"] = error.table;
	if (error.constraint) described["constraint"] = error.constraint;
	if (error.code === "23502" && error.column) described["column"] = error.column;
	return described;
}

/** What any error may say in a log: its name and, for a Postgres error (Drizzle's wrapper
 * unwrapped), `describeDatabaseError`. Never its message: a Drizzle error's message holds the
 * query's parameter values, such as emails, amounts and session tokens (D-381). */
export function describeError(error: unknown): Record<string, string> {
	const db = databaseErrorOf(error);
	if (db) return { name: "DatabaseError", ...describeDatabaseError(db) };
	return { name: error instanceof Error ? error.name : typeof error };
}

type FieldIndex = {
	byConstraint: Map<string, string[]>;
	byColumn: Map<string, string>;
};

/** Adds one table's unique constraints, primary key and columns to `index`. */
function indexTable(table: (typeof ALL_TABLES)[number], index: FieldIndex): void {
	const config = getTableConfig(table);
	const schema = config.schema ?? "public";
	const fieldOf = new Map(
		Object.entries(getTableColumns(table)).map(([field, column]) => [
			column.name,
			field,
		]),
	);
	const fields = (columns: { name: string }[]) =>
		columns.map((column) => fieldOf.get(column.name) ?? column.name);
	for (const [column, field] of fieldOf) {
		index.byColumn.set(`${schema}.${config.name}.${column}`, field);
	}
	const primary = config.columns.filter((column) => column.primary);
	if (primary.length)
		index.byConstraint.set(`${schema}.${config.name}_pkey`, fields(primary));
	for (const column of config.columns) {
		if (column.isUnique && column.uniqueName) {
			index.byConstraint.set(
				`${schema}.${column.uniqueName}`,
				fields([column]),
			);
		}
	}
	for (const constraint of config.uniqueConstraints) {
		const name = constraint.getName();
		if (name)
			index.byConstraint.set(`${schema}.${name}`, fields(constraint.columns));
	}
}

/** Field names for database errors, read once from the schema. A field is the API's name for
 * a column (`weekStart` for `week_start`), so a message lands on the field the client sent.
 *
 * - `byConstraint`: `schema.constraint` to the fields of a unique constraint or primary key.
 *   Postgres always names the constraint; on a table with RLS it leaves out the
 *   `Key (...)=(...)` detail on purpose, so the detail cannot be relied on.
 * - `byColumn`: `schema.table.column` to the field, for a NOT NULL violation. */
const FIELDS: FieldIndex = (() => {
	const index: FieldIndex = { byConstraint: new Map(), byColumn: new Map() };
	for (const table of ALL_TABLES) indexTable(table, index);
	return index;
})();

/** The fields of the unique constraint a violation names, or none for a constraint the
 * schema does not know. */
function uniqueFields(db: DatabaseError): string[] {
	return FIELDS.byConstraint.get(`${db.schema}.${db.constraint}`) ?? [];
}

/** The field of the column a NOT NULL violation names, or the column itself. */
function requiredField(db: DatabaseError): string | null {
	if (!db.column) return null;
	return FIELDS.byColumn.get(`${db.schema}.${db.table}.${db.column}`) ?? db.column;
}

/** Maps any error to the `ApiError` a route answers with (BR-P2-24). An `ApiError` passes
 * through; a Postgres error maps by SQLSTATE; anything else is `internal`. */
export function toApiError(error: unknown): ApiError {
	if (error instanceof ApiError) return error;
	const db = databaseErrorOf(error);
	if (!db) return new ApiError("internal", { cause: error });
	switch (db.code) {
		case "23505": {
			const fields = Object.fromEntries(
				uniqueFields(db).map((field) => [field, "This is already in use."]),
			);
			return new ApiError("validation_failed", { fields, cause: db });
		}
		case "23514":
			return new ApiError("validation_failed", { cause: db });
		case "23502": {
			const field = requiredField(db);
			return new ApiError("validation_failed", {
				fields: field ? { [field]: "Required" } : {},
				cause: db,
			});
		}
		case "23503":
			// A delete or key change that would orphan child rows says the key "is still
			// referenced"; an insert or update with a missing parent says it "is not present".
			return /is still referenced/.test(db.detail ?? "") ?
					new ApiError("has_dependents", { cause: db })
				:	new ApiError("parent_missing", { cause: db });
		case "42501":
			// A write that RLS's WITH CHECK refuses is someone reaching for another user's row:
			// answer as if it did not exist, and report it. Any other permission error is a bug.
			return /row-level security/.test(db.message) ?
					new ApiError("not_found", { securityEvent: true, cause: db })
				:	new ApiError("internal", { cause: db });
		case "57014":
			return new ApiError("timeout", { cause: db });
		default:
			return new ApiError("internal", { cause: db });
	}
}
