CREATE TABLE "app"."transaction_views" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"name" text NOT NULL,
	"filter" jsonb NOT NULL,
	"sort" text NOT NULL,
	"dir" text NOT NULL,
	"group_by" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "transaction_views_name_text" CHECK (char_length("app"."transaction_views"."name") BETWEEN 1 AND 40
			AND "app"."transaction_views"."name" !~ '[\x01-\x1f\x7f-\x9f]'
			AND "app"."transaction_views"."name" IS NFC NORMALIZED),
	CONSTRAINT "transaction_views_filter_object" CHECK (jsonb_typeof("app"."transaction_views"."filter") = 'object'),
	CONSTRAINT "transaction_views_sort_values" CHECK ("app"."transaction_views"."sort" IN ('date', 'amount')),
	CONSTRAINT "transaction_views_dir_values" CHECK ("app"."transaction_views"."dir" IN ('desc', 'asc')),
	CONSTRAINT "transaction_views_group_by_values" CHECK ("app"."transaction_views"."group_by" IN ('day', 'category', 'payee', 'none')),
	CONSTRAINT "transaction_views_day_needs_date_sort" CHECK (NOT ("app"."transaction_views"."sort" = 'amount' AND "app"."transaction_views"."group_by" = 'day')),
	CONSTRAINT "transaction_views_version_positive" CHECK ("app"."transaction_views"."version" >= 1)
);
--> statement-breakpoint
ALTER TABLE "app"."transaction_views" ADD CONSTRAINT "transaction_views_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "transaction_views_user_id_name_key" ON "app"."transaction_views" USING btree ("user_id",lower("name"));--> statement-breakpoint
CREATE INDEX "transaction_views_order_idx" ON "app"."transaction_views" USING btree ("user_id","created_at","id");--> statement-breakpoint

-- ===========================================================================================
-- Written by hand below this line (BR-P2-36): row-level security and grants.
-- Grants follow P2, section 3 exactly; db:verify fails on any extra or missing one (BR-P2-02).
-- ===========================================================================================

-- Private table: transaction_views. RLS enabled and forced, with exactly the two policies
-- (BR-P2-04).
ALTER TABLE "app"."transaction_views" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "app"."transaction_views" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY owner_isolation ON "app"."transaction_views" FOR ALL TO daybook_runtime
	USING (user_id = nullif(current_setting('app.user_id', true), '')::uuid)
	WITH CHECK (user_id = nullif(current_setting('app.user_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY system_access ON "app"."transaction_views" FOR ALL TO daybook_system
	USING (true) WITH CHECK (true);--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "app"."transaction_views" TO daybook_runtime;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "app"."transaction_views" TO daybook_system;
