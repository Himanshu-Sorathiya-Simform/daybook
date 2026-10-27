import "server-only";
import { sql } from "drizzle-orm";
import {
	check,
	date,
	index,
	integer,
	jsonb,
	pgSchema,
	smallint,
	text,
	timestamp,
	unique,
	uuid,
} from "drizzle-orm/pg-core";
import { user } from "./auth";

/** Every table that is not Better Auth's lives in schema `app` (D-192). Grants, row-level
 * security and the two policies are written by hand in each migration (BR-P2-36); a test
 * and `db:verify` check them.
 *
 * No column has a time default: every instant and date comes from the request clock as a
 * bound parameter (BR-P2-43). */
export const appSchema = pgSchema("app");

const instant = (name: string) => timestamp(name, { withTimezone: true });

/** The columns every private table has (P2, section 3). */
const privateColumns = () => ({
	id: uuid("id").primaryKey(),
	userId: uuid("user_id")
		.notNull()
		.references(() => user.id, { onDelete: "cascade" }),
	createdAt: instant("created_at").notNull(),
	updatedAt: instant("updated_at").notNull(),
});

// --- Reference data: no user_id, no RLS; the runtime role reads, migrations write (SEC-3).

/** The supported currencies and their ISO 4217 exponents (MON-2), mirrored from
 * `src/lib/currency.ts` by migration. */
export const currencies = appSchema.table(
	"currencies",
	{
		code: text("code").primaryKey(),
		exponent: smallint("exponent").notNull(),
	},
	(t) => [
		check("currencies_code_format", sql`${t.code} ~ '^[A-Z]{3}$'`),
		check("currencies_exponent_range", sql`${t.exponent} BETWEEN 0 AND 3`),
	],
);

/** The 20 fixed categories (CAT-1 to CAT-3), mirrored from `src/lib/categories.ts` by
 * migration. `kind` lets SQL check that a Transaction's category suits its type (TXN-3).
 * Icons and colours stay in code: no query needs them (D-417). */
export const categories = appSchema.table(
	"categories",
	{
		key: text("key").primaryKey(),
		kind: text("kind").notNull(),
		label: text("label").notNull(),
		position: smallint("position").notNull().unique(),
	},
	(t) => [
		check("categories_key_format", sql`${t.key} ~ '^[a-z_]+$'`),
		check("categories_kind_values", sql`${t.kind} IN ('expense', 'income')`),
		check("categories_position_positive", sql`${t.position} >= 1`),
	],
);

// --- Private data: user_id, RLS enabled and forced, owner_isolation and system_access.

/** One per user: country, currency, timezone and week start (F02). `last_catch_up_on` and
 * `goals_chosen_at` are bookkeeping that never moves `version` (BR-P2-14, F02). */
export const profile = appSchema.table(
	"profile",
	{
		...privateColumns(),
		country: text("country").notNull(),
		currency: text("currency")
			.notNull()
			.references(() => currencies.code),
		timezone: text("timezone").notNull(),
		weekStart: text("week_start").notNull(),
		lastCatchUpOn: date("last_catch_up_on", { mode: "string" }).notNull(),
		goalsChosenAt: instant("goals_chosen_at"),
		version: integer("version").notNull().default(1),
	},
	(t) => [
		unique("profile_user_id_key").on(t.userId),
		check("profile_country_format", sql`${t.country} ~ '^[A-Z]{2}$'`),
		check(
			"profile_timezone_length",
			sql`char_length(${t.timezone}) BETWEEN 1 AND 64`,
		),
		check(
			"profile_week_start_values",
			sql`${t.weekStart} IN ('monday', 'sunday', 'saturday')`,
		),
		check("profile_version_positive", sql`${t.version} >= 1`),
	],
);

/** One per mutation's `Idempotency-Key` (API-3, BR-P2-18). The wrapper inserts it with the
 * request's hash, then stores the response before commit. The daily pass deletes rows older
 * than 90 days, hence the index on `created_at` (BR-P2-27). Only the server updates a row,
 * never a user, so it has no `version`. */
export const idempotencyRecords = appSchema.table(
	"idempotency_records",
	{
		...privateColumns(),
		key: uuid("key").notNull(),
		requestHash: text("request_hash").notNull(),
		statusCode: smallint("status_code"),
		responseBody: jsonb("response_body"),
	},
	(t) => [
		unique("idempotency_records_user_id_key_key").on(t.userId, t.key),
		index("idempotency_records_created_at_idx").on(t.createdAt),
		check(
			"idempotency_records_request_hash_format",
			sql`${t.requestHash} ~ '^[0-9a-f]{64}$'`,
		),
		check(
			"idempotency_records_status_code_range",
			sql`${t.statusCode} BETWEEN 100 AND 599`,
		),
	],
);
