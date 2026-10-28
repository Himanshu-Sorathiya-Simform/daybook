import "server-only";
import { type SQL, sql } from "drizzle-orm";
import {
	bigint,
	boolean,
	check,
	date,
	foreignKey,
	index,
	integer,
	jsonb,
	pgSchema,
	smallint,
	text,
	timestamp,
	unique,
	uuid,
	type AnyPgColumn,
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
		// The target of a Transaction's composite key (category, category_kind) (D-466).
		unique("categories_key_kind_key").on(t.key, t.kind),
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

/** A text column's backstop (BR-F03-12, D-467): 1 to `max` code points, in NFC, with no
 * control character. `multiline` allows the line feed, for a note. Empty text is stored as
 * null, so a present value is never empty. */
function textCheck(
	name: string,
	column: SQL.Aliased | AnyPgColumn,
	max: number,
	multiline = false,
) {
	const control =
		multiline ?
			"[\\x01-\\x09\\x0b-\\x1f\\x7f-\\x9f]"
		:	"[\\x01-\\x1f\\x7f-\\x9f]";
	return check(
		name,
		sql`char_length(${column}) BETWEEN 1 AND ${sql.raw(String(max))}
			AND ${column} !~ ${sql.raw(`'${control}'`)}
			AND ${column} IS NFC NORMALIZED`,
	);
}

/**
 * One user's ledger (F03 section 3). At M1 it holds income, expenses and refunds; `goal_id`,
 * the Goal types and the charge link (`subscription_id`, `due_on`, `edited`) arrive with F06's
 * and F05's migrations in M2 (D-465). The checks are backstops for the shared schemas'
 * rules (D-467). The trigram search index is written by hand in the migration, after
 * `CREATE EXTENSION pg_trgm`, so it is not declared here (D-468).
 */
export const transactions = appSchema.table(
	"transactions",
	{
		...privateColumns(),
		type: text("type").notNull(),
		amountMinor: bigint("amount_minor", { mode: "number" }).notNull(),
		occurredAt: instant("occurred_at").notNull(),
		occurredOn: date("occurred_on", { mode: "string" }).notNull(),
		category: text("category").notNull(),
		// Lets a foreign key check that the category suits the type (TXN-3, D-466).
		categoryKind: text("category_kind").generatedAlwaysAs(
			sql`CASE "type" WHEN 'income' THEN 'income' ELSE 'expense' END`,
		),
		payee: text("payee").notNull(),
		description: text("description"),
		note: text("note"),
		source: text("source").notNull(),
		demo: boolean("demo").notNull().default(false),
		version: integer("version").notNull().default(1),
	},
	(t) => [
		foreignKey({
			name: "transactions_category_kind_fk",
			columns: [t.category, t.categoryKind],
			foreignColumns: [categories.key, categories.kind],
		}),
		index("transactions_date_order_idx").on(
			t.userId,
			t.occurredOn,
			t.occurredAt,
			t.id,
		),
		index("transactions_amount_order_idx").on(
			t.userId,
			t.amountMinor,
			t.occurredOn,
			t.occurredAt,
			t.id,
		),
		index("transactions_payee_idx").on(
			t.userId,
			sql`lower(${t.payee}) text_pattern_ops`,
		),
		check(
			"transactions_type_values",
			sql`${t.type} IN ('income', 'expense', 'refund')`,
		),
		check(
			"transactions_amount_range",
			sql`${t.amountMinor} BETWEEN 1 AND 999999999999`,
		),
		check(
			"transactions_occurred_at_minute",
			sql`date_trunc('minute', ${t.occurredAt}) = ${t.occurredAt}`,
		),
		check(
			"transactions_occurred_on_fits",
			sql`${t.occurredOn} BETWEEN ((${t.occurredAt} AT TIME ZONE 'UTC') - interval '12 hours')::date
				AND ((${t.occurredAt} AT TIME ZONE 'UTC') + interval '14 hours')::date`,
		),
		textCheck("transactions_payee_text", t.payee, 80),
		textCheck("transactions_description_text", t.description, 120),
		textCheck("transactions_note_text", t.note, 500, true),
		check(
			"transactions_source_values",
			sql`${t.source} IN ('manual', 'subscription')`,
		),
		check("transactions_version_positive", sql`${t.version} >= 1`),
	],
);

// --- System data: no user_id, no RLS; only the system role reads or writes (P2, section 3).

/** One row per UTC day the global daily pass has run (BR-P2-27, D-437). Inserting the day's
 * row is the pass's lock: a second process's insert waits, then finds it. */
export const dailyPassMarkers = appSchema.table("daily_pass_markers", {
	day: date("day", { mode: "string" }).primaryKey(),
	createdAt: instant("created_at").notNull(),
});
