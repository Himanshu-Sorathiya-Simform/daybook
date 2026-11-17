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
	uniqueIndex,
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
			String.raw`[\x01-\x09\x0b-\x1f\x7f-\x9f]`
		:	String.raw`[\x01-\x1f\x7f-\x9f]`;
	const controlPattern = sql.raw(`'${control}'`);
	return check(
		name,
		sql`char_length(${column}) BETWEEN 1 AND ${sql.raw(String(max))}
			AND ${column} !~ ${controlPattern}
			AND ${column} IS NFC NORMALIZED`,
	);
}

/**
 * One recurring bill (F05 section 3). The cadence is two columns, `cadence_unit` and
 * `cadence_every` (D-90); a pause is `pause_from` and `pause_until`, both set or both null
 * (D-94). The checks are backstops for the shared schemas' rules (D-467): the date windows
 * depend on the request clock and stay in code (BR-P2-43). The currency is the profile's,
 * as for Transactions and Budgets (MON-2). `category_kind` lets the category's foreign key
 * refuse an income category (D-466). `UNIQUE (user_id, id)` is the target of the composite
 * keys of its charges and skipped dates (BR-P2-06). Its charges' unique index serves every
 * lookup by Subscription (D-598), so this table needs no index of its own.
 */
export const subscriptions = appSchema.table(
	"subscriptions",
	{
		...privateColumns(),
		name: text("name").notNull(),
		amountMinor: bigint("amount_minor", { mode: "number" }).notNull(),
		cadenceUnit: text("cadence_unit").notNull(),
		cadenceEvery: integer("cadence_every").notNull(),
		startDate: date("start_date", { mode: "string" }).notNull(),
		category: text("category").notNull(),
		categoryKind: text("category_kind").generatedAlwaysAs(sql`'expense'`),
		note: text("note"),
		endDate: date("end_date", { mode: "string" }),
		pauseFrom: date("pause_from", { mode: "string" }),
		pauseUntil: date("pause_until", { mode: "string" }),
		chargesFrom: date("charges_from", { mode: "string" }).notNull(),
		lastChangeOn: date("last_change_on", { mode: "string" }).notNull(),
		demo: boolean("demo").notNull().default(false),
		version: integer("version").notNull().default(1),
	},
	(t) => [
		unique("subscriptions_user_id_id_key").on(t.userId, t.id),
		foreignKey({
			name: "subscriptions_category_kind_fk",
			columns: [t.category, t.categoryKind],
			foreignColumns: [categories.key, categories.kind],
		}),
		textCheck("subscriptions_name_text", t.name, 60),
		textCheck("subscriptions_note_text", t.note, 500, true),
		check(
			"subscriptions_amount_range",
			sql`${t.amountMinor} BETWEEN 1 AND 999999999999`,
		),
		check(
			"subscriptions_cadence_values",
			sql`(${t.cadenceUnit} = 'week' AND ${t.cadenceEvery} BETWEEN 1 AND 52)
				OR (${t.cadenceUnit} = 'month' AND ${t.cadenceEvery} BETWEEN 1 AND 24)`,
		),
		check(
			"subscriptions_end_after_start",
			sql`${t.endDate} IS NULL OR ${t.endDate} >= ${t.startDate}`,
		),
		check(
			"subscriptions_pause_pair",
			sql`(${t.pauseFrom} IS NULL AND ${t.pauseUntil} IS NULL)
				OR (${t.pauseFrom} IS NOT NULL AND ${t.pauseUntil} IS NOT NULL
					AND ${t.pauseUntil} > ${t.pauseFrom})`,
		),
		check(
			"subscriptions_charges_from_not_before_start",
			sql`${t.chargesFrom} >= ${t.startDate}`,
		),
		check("subscriptions_version_positive", sql`${t.version} >= 1`),
	],
);

/**
 * A skipped charge, the tombstone (F05 section 3, D-93): catch-up never charges its date. It
 * is written when a charge is deleted or a future one is skipped, and removed only by Undo
 * skip (BR-F05-27) or together with its Subscription, so its composite key has no action:
 * the Subscription's delete removes the skips first (BR-F05-14). A row is never updated, so
 * it has no `version`; `updated_at` stays the creation instant.
 */
export const subscriptionSkips = appSchema.table(
	"subscription_skips",
	{
		...privateColumns(),
		subscriptionId: uuid("subscription_id").notNull(),
		dueOn: date("due_on", { mode: "string" }).notNull(),
	},
	(t) => [
		unique("subscription_skips_user_id_subscription_id_due_on_key").on(
			t.userId,
			t.subscriptionId,
			t.dueOn,
		),
		foreignKey({
			name: "subscription_skips_subscription_fk",
			columns: [t.userId, t.subscriptionId],
			foreignColumns: [subscriptions.userId, subscriptions.id],
		}),
	],
);

/**
 * One user's ledger (F03 section 3). At M1 it held income, expenses and refunds; the charge
 * link (`subscription_id`, `due_on`, `edited`) arrived with F05's migration (D-598) and
 * `goal_id` and the Goal types come with F06's in M2 (D-465). The checks are backstops for
 * the shared schemas' rules (D-467). The indexes lead with `user_id` and hold only leakproof
 * comparisons, the only kind Postgres uses as an index condition under RLS; text search scans
 * the user's rows instead (D-48, D-468).
 *
 * The charge link is a composite key to the Subscription with `ON DELETE SET NULL
 * (subscription_id)`, written by hand in the migration (BR-P2-06, D-96): deleting a
 * Subscription keeps its charges as ordinary expenses and never nulls `user_id`. The unique
 * index on user, Subscription and due date makes catch-up idempotent and serves the lookups
 * by Subscription; rows with no Subscription never collide, since null is distinct.
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
		subscriptionId: uuid("subscription_id"),
		dueOn: date("due_on", { mode: "string" }),
		edited: boolean("edited").notNull().default(false),
		demo: boolean("demo").notNull().default(false),
		version: integer("version").notNull().default(1),
	},
	(t) => [
		foreignKey({
			name: "transactions_category_kind_fk",
			columns: [t.category, t.categoryKind],
			foreignColumns: [categories.key, categories.kind],
		}),
		foreignKey({
			name: "transactions_subscription_fk",
			columns: [t.userId, t.subscriptionId],
			foreignColumns: [subscriptions.userId, subscriptions.id],
		}).onDelete("set null"),
		uniqueIndex("transactions_subscription_due_key").on(
			t.userId,
			t.subscriptionId,
			t.dueOn,
		),
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
		// A manual row has no charge link and was never an edited charge; a charge always
		// knows its due date, also after its Subscription is deleted (BR-F05-02, BR-F05-14).
		// Each half judges only its own source, so an unknown source fails the source check.
		check(
			"transactions_charge_link",
			sql`(${t.source} <> 'manual' OR (${t.subscriptionId} IS NULL
				AND ${t.dueOn} IS NULL AND NOT ${t.edited}))
				AND (${t.source} <> 'subscription' OR ${t.dueOn} IS NOT NULL)`,
		),
		// A charge's date never moves (BR-F03-16), so its due date is its day.
		check(
			"transactions_due_on_is_occurred_on",
			sql`${t.dueOn} IS NULL OR ${t.dueOn} = ${t.occurredOn}`,
		),
		check("transactions_version_positive", sql`${t.version} >= 1`),
	],
);

/**
 * Saved Transactions views (F03 section 3, BR-F03-63 to BR-F03-69). The filter is a JSON
 * object whose keys and values the shared schema checks (BR-F03-64); `group` is a reserved
 * word, so the column is `group_by`. Names are unique per user by `lower()`. The limit of 20
 * has no backstop here: the create handler serializes creates per user (D-469).
 */
export const transactionViews = appSchema.table(
	"transaction_views",
	{
		...privateColumns(),
		name: text("name").notNull(),
		filter: jsonb("filter").notNull(),
		sort: text("sort").notNull(),
		dir: text("dir").notNull(),
		groupBy: text("group_by").notNull(),
		version: integer("version").notNull().default(1),
	},
	(t) => [
		uniqueIndex("transaction_views_user_id_name_key").on(
			t.userId,
			sql`lower(${t.name})`,
		),
		index("transaction_views_order_idx").on(t.userId, t.createdAt, t.id),
		textCheck("transaction_views_name_text", t.name, 40),
		check(
			"transaction_views_filter_object",
			sql`jsonb_typeof(${t.filter}) = 'object'`,
		),
		check("transaction_views_sort_values", sql`${t.sort} IN ('date', 'amount')`),
		check("transaction_views_dir_values", sql`${t.dir} IN ('desc', 'asc')`),
		check(
			"transaction_views_group_by_values",
			sql`${t.groupBy} IN ('day', 'category', 'payee', 'none')`,
		),
		check(
			"transaction_views_day_needs_date_sort",
			sql`NOT (${t.sort} = 'amount' AND ${t.groupBy} = 'day')`,
		),
		check("transaction_views_version_positive", sql`${t.version} >= 1`),
	],
);

/**
 * A Budget list's entry check (D-563): every entry is an object with exactly `month` (or
 * `from`) and `limitMinor`, the month written `YYYY-MM`, and the limit `null` or a whole number
 * from 1 to MON-5's widest largest, KWD's 999,999,999,999. Strict mode keeps a missing field or
 * a value wrapped in an array from passing; the entries that pass are counted against the
 * array's length, so an entry the path can't judge fails too. A list that is not an array is
 * the array check's to refuse. Order and repeated months stay with the shared schemas.
 */
function entriesCheck(name: string, column: AnyPgColumn, key: "from" | "month") {
	const path = `strict $[*] ? (@.type() == "object"
		&& !exists(@.keyvalue() ? (@.key != "${key}" && @.key != "limitMinor"))
		&& @.${key}.type() == "string"
		&& @.${key} like_regex "^[0-9]{4}-(0[1-9]|1[0-2])$"
		&& (@.limitMinor.type() == "null"
			|| (@.limitMinor.type() == "number" && @.limitMinor >= 1
				&& @.limitMinor <= 999999999999 && @.limitMinor.floor() == @.limitMinor)))`;
	return check(
		name,
		sql`CASE WHEN jsonb_typeof(${column}) = 'array'
			THEN jsonb_array_length(jsonb_path_query_array(${column}, ${sql.raw(`'${path}'`)}::jsonpath,
				'{}', true)) = jsonb_array_length(${column})
			ELSE true END`,
	);
}

/**
 * One Budget per expense category (F04 section 3, BR-F04-01). The schedule and the one-month
 * limits are JSON arrays on the one row, so every write replaces the record under one
 * `version` (D-563). Their entries, order and normalization are the shared schemas' rules
 * (BR-F04-05, BR-F04-25); the table only checks the shapes it can see. `category_kind` lets
 * the category's foreign key refuse an income category, as Transactions do (D-466).
 */
export const budgets = appSchema.table(
	"budgets",
	{
		...privateColumns(),
		category: text("category").notNull(),
		categoryKind: text("category_kind").generatedAlwaysAs(sql`'expense'`),
		schedule: jsonb("schedule").notNull(),
		overrides: jsonb("overrides").notNull(),
		demo: boolean("demo").notNull().default(false),
		version: integer("version").notNull().default(1),
	},
	(t) => [
		unique("budgets_user_id_category_key").on(t.userId, t.category),
		foreignKey({
			name: "budgets_category_kind_fk",
			columns: [t.category, t.categoryKind],
			foreignColumns: [categories.key, categories.kind],
		}),
		// Compared with the empty array, not measured: a CHECK's conditions may run in any
		// order, and `jsonb_array_length` raises an error on anything but an array.
		check(
			"budgets_schedule_array",
			sql`jsonb_typeof(${t.schedule}) = 'array' AND ${t.schedule} <> '[]'::jsonb`,
		),
		check(
			"budgets_overrides_array",
			sql`jsonb_typeof(${t.overrides}) = 'array'`,
		),
		entriesCheck("budgets_schedule_entries", t.schedule, "from"),
		entriesCheck("budgets_overrides_entries", t.overrides, "month"),
		check("budgets_version_positive", sql`${t.version} >= 1`),
	],
);

// --- System data: no user_id, no RLS; only the system role reads or writes (P2, section 3).

/** One row per UTC day the global daily pass has run (BR-P2-27, D-437). Inserting the day's
 * row is the pass's lock: a second process's insert waits, then finds it. */
export const dailyPassMarkers = appSchema.table("daily_pass_markers", {
	day: date("day", { mode: "string" }).primaryKey(),
	createdAt: instant("created_at").notNull(),
});
