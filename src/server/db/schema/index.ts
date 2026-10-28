import "server-only";
import {
	categories,
	currencies,
	dailyPassMarkers,
	idempotencyRecords,
	profile,
} from "./app";
import { account, session, user, verification } from "./auth";

export * from "./app";
export * from "./auth";

/** Every table, for code that walks the schema (the error mapper's field names). Listed by
 * hand rather than read from this module's exports, which some loaders do not expose; a test
 * checks it against the exports. */
export const ALL_TABLES = [
	user,
	session,
	account,
	verification,
	currencies,
	categories,
	profile,
	idempotencyRecords,
	dailyPassMarkers,
] as const;
