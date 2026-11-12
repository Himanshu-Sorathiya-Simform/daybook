import "server-only";
import {
	budgets,
	categories,
	currencies,
	dailyPassMarkers,
	idempotencyRecords,
	profile,
	transactionViews,
	transactions,
} from "./app";
import { account, rateLimit, session, user, verification } from "./auth";

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
	rateLimit,
	currencies,
	categories,
	profile,
	idempotencyRecords,
	transactions,
	transactionViews,
	budgets,
	dailyPassMarkers,
] as const;
