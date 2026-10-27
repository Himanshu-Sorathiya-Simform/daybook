-- The schemas already exist: db:bootstrap creates them with their USAGE grants (D-412).
CREATE SCHEMA IF NOT EXISTS "app";
--> statement-breakpoint
CREATE SCHEMA IF NOT EXISTS "auth";
--> statement-breakpoint
CREATE TABLE "app"."categories" (
	"key" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"label" text NOT NULL,
	"position" smallint NOT NULL,
	CONSTRAINT "categories_position_unique" UNIQUE("position"),
	CONSTRAINT "categories_key_format" CHECK ("app"."categories"."key" ~ '^[a-z_]+$'),
	CONSTRAINT "categories_kind_values" CHECK ("app"."categories"."kind" IN ('expense', 'income')),
	CONSTRAINT "categories_position_positive" CHECK ("app"."categories"."position" >= 1)
);
--> statement-breakpoint
CREATE TABLE "app"."currencies" (
	"code" text PRIMARY KEY NOT NULL,
	"exponent" smallint NOT NULL,
	CONSTRAINT "currencies_code_format" CHECK ("app"."currencies"."code" ~ '^[A-Z]{3}$'),
	CONSTRAINT "currencies_exponent_range" CHECK ("app"."currencies"."exponent" BETWEEN 0 AND 3)
);
--> statement-breakpoint
CREATE TABLE "app"."idempotency_records" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"key" uuid NOT NULL,
	"request_hash" text NOT NULL,
	"status_code" smallint,
	"response_body" jsonb,
	CONSTRAINT "idempotency_records_user_id_key_key" UNIQUE("user_id","key"),
	CONSTRAINT "idempotency_records_request_hash_format" CHECK ("app"."idempotency_records"."request_hash" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "idempotency_records_status_code_range" CHECK ("app"."idempotency_records"."status_code" BETWEEN 100 AND 599)
);
--> statement-breakpoint
CREATE TABLE "app"."profile" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"country" text NOT NULL,
	"currency" text NOT NULL,
	"timezone" text NOT NULL,
	"week_start" text NOT NULL,
	"last_catch_up_on" date NOT NULL,
	"goals_chosen_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "profile_user_id_key" UNIQUE("user_id"),
	CONSTRAINT "profile_country_format" CHECK ("app"."profile"."country" ~ '^[A-Z]{2}$'),
	CONSTRAINT "profile_timezone_length" CHECK (char_length("app"."profile"."timezone") BETWEEN 1 AND 64),
	CONSTRAINT "profile_week_start_values" CHECK ("app"."profile"."week_start" IN ('monday', 'sunday', 'saturday')),
	CONSTRAINT "profile_version_positive" CHECK ("app"."profile"."version" >= 1)
);
--> statement-breakpoint
CREATE TABLE "auth"."account" (
	"id" uuid PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" uuid NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth"."session" (
	"id" uuid PRIMARY KEY NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"token" text NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "auth"."user" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "auth"."verification" (
	"id" uuid PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "app"."idempotency_records" ADD CONSTRAINT "idempotency_records_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."profile" ADD CONSTRAINT "profile_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."profile" ADD CONSTRAINT "profile_currency_currencies_code_fk" FOREIGN KEY ("currency") REFERENCES "app"."currencies"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth"."account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth"."session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idempotency_records_created_at_idx" ON "app"."idempotency_records" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "account_user_id_idx" ON "auth"."account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "session_user_id_idx" ON "auth"."session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "auth"."verification" USING btree ("identifier");--> statement-breakpoint

-- ===========================================================================================
-- Written by hand below this line (BR-P2-36): grants, row-level security and reference rows.
-- Grants follow P2, section 3 exactly; db:verify fails on any extra or missing one (BR-P2-02).
-- ===========================================================================================

-- Better Auth's tables: daybook_auth only. No other Daybook role is granted anything in auth.
GRANT SELECT, INSERT, UPDATE, DELETE ON "auth"."user" TO daybook_auth;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "auth"."session" TO daybook_auth;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "auth"."account" TO daybook_auth;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "auth"."verification" TO daybook_auth;--> statement-breakpoint

-- Reference data: the runtime role reads; the system module writes (SEC-3).
GRANT SELECT ON "app"."currencies" TO daybook_runtime;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "app"."currencies" TO daybook_system;--> statement-breakpoint
GRANT SELECT ON "app"."categories" TO daybook_runtime;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "app"."categories" TO daybook_system;--> statement-breakpoint

-- Private table: profile. RLS enabled and forced, with exactly the two policies (BR-P2-04).
ALTER TABLE "app"."profile" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "app"."profile" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY owner_isolation ON "app"."profile" FOR ALL TO daybook_runtime
	USING (user_id = nullif(current_setting('app.user_id', true), '')::uuid)
	WITH CHECK (user_id = nullif(current_setting('app.user_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY system_access ON "app"."profile" FOR ALL TO daybook_system
	USING (true) WITH CHECK (true);--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "app"."profile" TO daybook_runtime;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "app"."profile" TO daybook_system;--> statement-breakpoint

-- Private table: idempotency_records. Same pattern.
ALTER TABLE "app"."idempotency_records" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "app"."idempotency_records" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY owner_isolation ON "app"."idempotency_records" FOR ALL TO daybook_runtime
	USING (user_id = nullif(current_setting('app.user_id', true), '')::uuid)
	WITH CHECK (user_id = nullif(current_setting('app.user_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY system_access ON "app"."idempotency_records" FOR ALL TO daybook_system
	USING (true) WITH CHECK (true);--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "app"."idempotency_records" TO daybook_runtime;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "app"."idempotency_records" TO daybook_system;--> statement-breakpoint

-- Reference rows, mirrored from src/lib/currency.ts (MON-2) and src/lib/categories.ts
-- (CAT-2, CAT-3). A test checks these lists against the code.
INSERT INTO "app"."currencies" ("code", "exponent") VALUES
	('INR', 2),
	('USD', 2),
	('EUR', 2),
	('GBP', 2),
	('JPY', 0),
	('KWD', 3);--> statement-breakpoint
INSERT INTO "app"."categories" ("key", "kind", "label", "position") VALUES
	('food', 'expense', 'Food', 1),
	('shopping', 'expense', 'Shopping', 2),
	('transportation', 'expense', 'Transportation', 3),
	('utilities', 'expense', 'Utilities', 4),
	('entertainment', 'expense', 'Entertainment', 5),
	('housing', 'expense', 'Housing', 6),
	('health', 'expense', 'Health', 7),
	('education', 'expense', 'Education', 8),
	('travel', 'expense', 'Travel', 9),
	('insurance', 'expense', 'Insurance', 10),
	('personal_care', 'expense', 'Personal care', 11),
	('gifts_donations', 'expense', 'Gifts and donations', 12),
	('fees_taxes', 'expense', 'Fees and taxes', 13),
	('loans', 'expense', 'Loans', 14),
	('other', 'expense', 'Other', 15),
	('salary', 'income', 'Salary', 16),
	('freelance', 'income', 'Freelance', 17),
	('investments', 'income', 'Investments', 18),
	('gifts', 'income', 'Gifts', 19),
	('other_income', 'income', 'Other income', 20);
