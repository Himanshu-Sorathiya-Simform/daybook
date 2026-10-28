import "server-only";
import { databaseErrorOf, describeDatabaseError } from "../api/errors";

/** What an error may say in a log: its name and, for a Postgres error, its SQLSTATE, table
 * and constraint. Never its message: a Drizzle error's message holds the query's parameter
 * values, which for Better Auth are emails, password hashes and session tokens (D-381). */
export function describeError(error: unknown): Record<string, string> {
	const db = databaseErrorOf(error);
	if (db) return { name: "DatabaseError", ...describeDatabaseError(db) };
	return { name: error instanceof Error ? error.name : typeof error };
}

export type AuthLogLevel = "debug" | "info" | "warn" | "error";

/** Better Auth's `logger.log`. It keeps Better Auth's own message, which is fixed text, and
 * replaces every extra argument: an error becomes `describeError`, anything else (request
 * details, user fields) is dropped. */
export function logAuth(level: AuthLogLevel, message: string, ...args: unknown[]) {
	const errors = args.filter((arg) => arg instanceof Error).map(describeError);
	const write =
		level === "error" ? console.error
		: level === "warn" ? console.warn
		: console.log;
	write(`[auth] ${message}`, ...errors);
}
