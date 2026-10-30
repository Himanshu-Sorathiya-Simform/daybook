CREATE TABLE "app"."transactions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"type" text NOT NULL,
	"amount_minor" bigint NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"occurred_on" date NOT NULL,
	"category" text NOT NULL,
	"category_kind" text GENERATED ALWAYS AS (CASE "type" WHEN 'income' THEN 'income' ELSE 'expense' END) STORED,
	"payee" text NOT NULL,
	"description" text,
	"note" text,
	"source" text NOT NULL,
	"demo" boolean DEFAULT false NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "transactions_type_values" CHECK ("app"."transactions"."type" IN ('income', 'expense', 'refund')),
	CONSTRAINT "transactions_amount_range" CHECK ("app"."transactions"."amount_minor" BETWEEN 1 AND 999999999999),
	CONSTRAINT "transactions_occurred_at_minute" CHECK (date_trunc('minute', "app"."transactions"."occurred_at") = "app"."transactions"."occurred_at"),
	CONSTRAINT "transactions_occurred_on_fits" CHECK ("app"."transactions"."occurred_on" BETWEEN (("app"."transactions"."occurred_at" AT TIME ZONE 'UTC') - interval '12 hours')::date
				AND (("app"."transactions"."occurred_at" AT TIME ZONE 'UTC') + interval '14 hours')::date),
	CONSTRAINT "transactions_payee_text" CHECK (char_length("app"."transactions"."payee") BETWEEN 1 AND 80
			AND "app"."transactions"."payee" !~ '[\x01-\x1f\x7f-\x9f]'
			AND "app"."transactions"."payee" IS NFC NORMALIZED),
	CONSTRAINT "transactions_description_text" CHECK (char_length("app"."transactions"."description") BETWEEN 1 AND 120
			AND "app"."transactions"."description" !~ '[\x01-\x1f\x7f-\x9f]'
			AND "app"."transactions"."description" IS NFC NORMALIZED),
	CONSTRAINT "transactions_note_text" CHECK (char_length("app"."transactions"."note") BETWEEN 1 AND 500
			AND "app"."transactions"."note" !~ '[\x01-\x09\x0b-\x1f\x7f-\x9f]'
			AND "app"."transactions"."note" IS NFC NORMALIZED),
	CONSTRAINT "transactions_source_values" CHECK ("app"."transactions"."source" IN ('manual', 'subscription')),
	CONSTRAINT "transactions_version_positive" CHECK ("app"."transactions"."version" >= 1)
);
--> statement-breakpoint
ALTER TABLE "app"."transactions" ADD CONSTRAINT "transactions_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."categories" ADD CONSTRAINT "categories_key_kind_key" UNIQUE("key","kind");--> statement-breakpoint
ALTER TABLE "app"."transactions" ADD CONSTRAINT "transactions_category_kind_fk" FOREIGN KEY ("category","category_kind") REFERENCES "app"."categories"("key","kind") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "transactions_date_order_idx" ON "app"."transactions" USING btree ("user_id","occurred_on","occurred_at","id");--> statement-breakpoint
CREATE INDEX "transactions_amount_order_idx" ON "app"."transactions" USING btree ("user_id","amount_minor","occurred_on","occurred_at","id");--> statement-breakpoint
CREATE INDEX "transactions_payee_idx" ON "app"."transactions" USING btree ("user_id",lower("payee") text_pattern_ops);--> statement-breakpoint

-- ===========================================================================================
-- Written by hand below this line (BR-P2-36): the search index, row-level security and grants.
-- Grants follow P2, section 3 exactly; db:verify fails on any extra or missing one (BR-P2-02).
-- Above the line, categories_key_kind_key was moved before the composite foreign key that
-- needs it; Drizzle Kit wrote it last.
-- ===========================================================================================

-- Text search (BR-F03-35, FIL-3, D-468): a trigram index on F03's search expression, which
-- ILIKE uses. Queries must write the expression exactly as here. pg_trgm lives in public.
CREATE EXTENSION IF NOT EXISTS pg_trgm;--> statement-breakpoint
CREATE INDEX "transactions_search_idx" ON "app"."transactions" USING gin ((
	coalesce("payee", '') || E'\x1f' || coalesce("description", '') || E'\x1f' || coalesce("note", '')
) gin_trgm_ops);--> statement-breakpoint

-- Private table: transactions. RLS enabled and forced, with exactly the two policies (BR-P2-04).
ALTER TABLE "app"."transactions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "app"."transactions" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY owner_isolation ON "app"."transactions" FOR ALL TO daybook_runtime
	USING (user_id = nullif(current_setting('app.user_id', true), '')::uuid)
	WITH CHECK (user_id = nullif(current_setting('app.user_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY system_access ON "app"."transactions" FOR ALL TO daybook_system
	USING (true) WITH CHECK (true);--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "app"."transactions" TO daybook_runtime;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "app"."transactions" TO daybook_system;
