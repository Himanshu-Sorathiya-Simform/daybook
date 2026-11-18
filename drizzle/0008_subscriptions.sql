CREATE TABLE "app"."subscription_skips" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"subscription_id" uuid NOT NULL,
	"due_on" date NOT NULL,
	CONSTRAINT "subscription_skips_user_id_subscription_id_due_on_key" UNIQUE("user_id","subscription_id","due_on")
);
--> statement-breakpoint
CREATE TABLE "app"."subscriptions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"name" text NOT NULL,
	"amount_minor" bigint NOT NULL,
	"cadence_unit" text NOT NULL,
	"cadence_every" integer NOT NULL,
	"start_date" date NOT NULL,
	"category" text NOT NULL,
	"category_kind" text GENERATED ALWAYS AS ('expense') STORED,
	"note" text,
	"end_date" date,
	"pause_from" date,
	"pause_until" date,
	"charges_from" date NOT NULL,
	"last_change_on" date NOT NULL,
	"demo" boolean DEFAULT false NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "subscriptions_user_id_id_key" UNIQUE("user_id","id"),
	CONSTRAINT "subscriptions_name_text" CHECK (char_length("app"."subscriptions"."name") BETWEEN 1 AND 60
			AND "app"."subscriptions"."name" !~ '[\x01-\x1f\x7f-\x9f]'
			AND "app"."subscriptions"."name" IS NFC NORMALIZED),
	CONSTRAINT "subscriptions_note_text" CHECK (char_length("app"."subscriptions"."note") BETWEEN 1 AND 500
			AND "app"."subscriptions"."note" !~ '[\x01-\x09\x0b-\x1f\x7f-\x9f]'
			AND "app"."subscriptions"."note" IS NFC NORMALIZED),
	CONSTRAINT "subscriptions_amount_range" CHECK ("app"."subscriptions"."amount_minor" BETWEEN 1 AND 999999999999),
	CONSTRAINT "subscriptions_cadence_values" CHECK (("app"."subscriptions"."cadence_unit" = 'week' AND "app"."subscriptions"."cadence_every" BETWEEN 1 AND 52)
				OR ("app"."subscriptions"."cadence_unit" = 'month' AND "app"."subscriptions"."cadence_every" BETWEEN 1 AND 24)),
	CONSTRAINT "subscriptions_end_after_start" CHECK ("app"."subscriptions"."end_date" IS NULL OR "app"."subscriptions"."end_date" >= "app"."subscriptions"."start_date"),
	CONSTRAINT "subscriptions_pause_pair" CHECK (("app"."subscriptions"."pause_from" IS NULL AND "app"."subscriptions"."pause_until" IS NULL)
				OR ("app"."subscriptions"."pause_from" IS NOT NULL AND "app"."subscriptions"."pause_until" IS NOT NULL
					AND "app"."subscriptions"."pause_until" > "app"."subscriptions"."pause_from")),
	CONSTRAINT "subscriptions_charges_from_not_before_start" CHECK ("app"."subscriptions"."charges_from" >= "app"."subscriptions"."start_date"),
	CONSTRAINT "subscriptions_version_positive" CHECK ("app"."subscriptions"."version" >= 1)
);
--> statement-breakpoint
ALTER TABLE "app"."transactions" ADD COLUMN "subscription_id" uuid;--> statement-breakpoint
ALTER TABLE "app"."transactions" ADD COLUMN "due_on" date;--> statement-breakpoint
ALTER TABLE "app"."transactions" ADD COLUMN "edited" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "app"."subscription_skips" ADD CONSTRAINT "subscription_skips_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."subscription_skips" ADD CONSTRAINT "subscription_skips_subscription_fk" FOREIGN KEY ("user_id","subscription_id") REFERENCES "app"."subscriptions"("user_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."subscriptions" ADD CONSTRAINT "subscriptions_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."subscriptions" ADD CONSTRAINT "subscriptions_category_kind_fk" FOREIGN KEY ("category","category_kind") REFERENCES "app"."categories"("key","kind") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."transactions" ADD CONSTRAINT "transactions_subscription_fk" FOREIGN KEY ("user_id","subscription_id") REFERENCES "app"."subscriptions"("user_id","id") ON DELETE SET NULL ("subscription_id") ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "transactions_subscription_due_key" ON "app"."transactions" USING btree ("user_id","subscription_id","due_on");--> statement-breakpoint
-- A charge written before this migration (the golden seed, a stress load) has no due date; its
-- due date is its day (BR-F05-02). Without it the charge check below would refuse the table.
UPDATE "app"."transactions" SET "due_on" = "occurred_on" WHERE "source" = 'subscription';--> statement-breakpoint
ALTER TABLE "app"."transactions" ADD CONSTRAINT "transactions_charge_link" CHECK (("app"."transactions"."source" <> 'manual' OR ("app"."transactions"."subscription_id" IS NULL
				AND "app"."transactions"."due_on" IS NULL AND NOT "app"."transactions"."edited"))
				AND ("app"."transactions"."source" <> 'subscription' OR "app"."transactions"."due_on" IS NOT NULL));--> statement-breakpoint
ALTER TABLE "app"."transactions" ADD CONSTRAINT "transactions_due_on_is_occurred_on" CHECK ("app"."transactions"."due_on" IS NULL OR "app"."transactions"."due_on" = "app"."transactions"."occurred_on");--> statement-breakpoint

-- ===========================================================================================
-- Written by hand below this line (BR-P2-36): row-level security and grants.
-- Grants follow P2, section 3 exactly; db:verify fails on any extra or missing one (BR-P2-02).
-- Above the line, transactions_subscription_fk got its column list by hand: Drizzle Kit writes
-- a bare SET NULL, which would also null user_id (BR-P2-06). The backfill UPDATE was added
-- before the checks that need it.
-- ===========================================================================================

-- Private table: subscriptions. RLS enabled and forced, with exactly the two policies (BR-P2-04).
ALTER TABLE "app"."subscriptions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "app"."subscriptions" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY owner_isolation ON "app"."subscriptions" FOR ALL TO daybook_runtime
	USING (user_id = nullif(current_setting('app.user_id', true), '')::uuid)
	WITH CHECK (user_id = nullif(current_setting('app.user_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY system_access ON "app"."subscriptions" FOR ALL TO daybook_system
	USING (true) WITH CHECK (true);--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "app"."subscriptions" TO daybook_runtime;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "app"."subscriptions" TO daybook_system;--> statement-breakpoint

-- Private table: subscription_skips. The same two policies and grants.
ALTER TABLE "app"."subscription_skips" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "app"."subscription_skips" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY owner_isolation ON "app"."subscription_skips" FOR ALL TO daybook_runtime
	USING (user_id = nullif(current_setting('app.user_id', true), '')::uuid)
	WITH CHECK (user_id = nullif(current_setting('app.user_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY system_access ON "app"."subscription_skips" FOR ALL TO daybook_system
	USING (true) WITH CHECK (true);--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "app"."subscription_skips" TO daybook_runtime;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "app"."subscription_skips" TO daybook_system;
