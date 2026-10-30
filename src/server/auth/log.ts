import "server-only";
import { describeError } from "../api/errors";

export type AuthLogLevel = "debug" | "info" | "warn" | "error";

function writerFor(level: AuthLogLevel) {
	if (level === "error") return console.error;
	if (level === "warn") return console.warn;
	return console.log;
}

/** Better Auth's `logger.log`. It keeps Better Auth's own message, which is fixed text, and
 * replaces every extra argument: an error becomes `describeError`, anything else (request
 * details, user fields) is dropped. */
export function logAuth(level: AuthLogLevel, message: string, ...args: unknown[]) {
	const errors = args.filter((arg) => arg instanceof Error).map(describeError);
	writerFor(level)(`[auth] ${message}`, ...errors);
}
