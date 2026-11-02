import "server-only";
import {
	bigint,
	boolean,
	index,
	integer,
	pgSchema,
	text,
	timestamp,
	uuid,
} from "drizzle-orm/pg-core";

/** Better Auth's five tables, in schema `auth` (D-192), which only `daybook_auth` can reach
 * (D-19). Each object key is Better Auth's field name, which its Drizzle adapter looks up;
 * the table and column names are snake_case. A test compares these tables with the installed Better
 * Auth's own definitions, so an upgrade that adds a field fails there first.
 *
 * Two differences from Better Auth's generated schema, both deliberate:
 * - Ids are `uuid` (UUIDv7, D-416), because every private table's `user_id` is a uuid that
 *   RLS compares with `current_setting('app.user_id')::uuid` (SEC-2).
 * - Times are `timestamptz` (TIME-1). Better Auth sets every time itself, so no column has a
 *   database default (BR-P2-43 exempts this schema, but none is needed). */
export const authSchema = pgSchema("auth");

const timestamps = {
	createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
};

export const user = authSchema.table("user", {
	id: uuid("id").primaryKey(),
	name: text("name").notNull(),
	email: text("email").notNull().unique(),
	emailVerified: boolean("email_verified").notNull().default(false),
	image: text("image"),
	...timestamps,
});

export const session = authSchema.table(
	"session",
	{
		id: uuid("id").primaryKey(),
		expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
		token: text("token").notNull().unique(),
		ipAddress: text("ip_address"),
		userAgent: text("user_agent"),
		userId: uuid("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		...timestamps,
	},
	(t) => [index("session_user_id_idx").on(t.userId)],
);

export const account = authSchema.table(
	"account",
	{
		id: uuid("id").primaryKey(),
		accountId: text("account_id").notNull(),
		providerId: text("provider_id").notNull(),
		userId: uuid("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		accessToken: text("access_token"),
		refreshToken: text("refresh_token"),
		idToken: text("id_token"),
		accessTokenExpiresAt: timestamp("access_token_expires_at", {
			withTimezone: true,
		}),
		refreshTokenExpiresAt: timestamp("refresh_token_expires_at", {
			withTimezone: true,
		}),
		scope: text("scope"),
		password: text("password"),
		...timestamps,
	},
	(t) => [index("account_user_id_idx").on(t.userId)],
);

export const verification = authSchema.table(
	"verification",
	{
		id: uuid("id").primaryKey(),
		identifier: text("identifier").notNull(),
		value: text("value").notNull(),
		expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
		...timestamps,
	},
	(t) => [index("verification_identifier_idx").on(t.identifier)],
);

/** Better Auth's rate limiter counts here, so every server instance shares one count (D-153).
 * `key` is the client address and path (`203.0.113.7|/sign-in/email`); `lastRequest` is
 * Better Auth's own clock in epoch milliseconds, a number rather than a `timestamptz`,
 * because the limiter compares it in its queries as one. Better Auth deletes rows older than
 * its longest window itself. No index on `last_request`: every limited request rewrites it,
 * and without an index Postgres can update the row in place; the table holds about a minute
 * of rows. */
export const rateLimit = authSchema.table("rate_limit", {
	id: uuid("id").primaryKey(),
	key: text("key").notNull().unique(),
	count: integer("count").notNull(),
	lastRequest: bigint("last_request", { mode: "number" }).notNull(),
});
