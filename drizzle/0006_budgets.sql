CREATE TABLE "app"."budgets" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"category" text NOT NULL,
	"category_kind" text GENERATED ALWAYS AS ('expense') STORED,
	"schedule" jsonb NOT NULL,
	"overrides" jsonb NOT NULL,
	"demo" boolean DEFAULT false NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "budgets_user_id_category_key" UNIQUE("user_id","category"),
	CONSTRAINT "budgets_schedule_array" CHECK (jsonb_typeof("app"."budgets"."schedule") = 'array' AND "app"."budgets"."schedule" <> '[]'::jsonb),
	CONSTRAINT "budgets_overrides_array" CHECK (jsonb_typeof("app"."budgets"."overrides") = 'array'),
	CONSTRAINT "budgets_version_positive" CHECK ("app"."budgets"."version" >= 1)
);
--> statement-breakpoint
ALTER TABLE "app"."budgets" ADD CONSTRAINT "budgets_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."budgets" ADD CONSTRAINT "budgets_category_kind_fk" FOREIGN KEY ("category","category_kind") REFERENCES "app"."categories"("key","kind") ON DELETE no action ON UPDATE no action;--> statement-breakpoint

-- ===========================================================================================
-- Written by hand below this line (BR-P2-36): row-level security and grants.
-- Grants follow P2, section 3 exactly; db:verify fails on any extra or missing one (BR-P2-02).
-- ===========================================================================================

-- Private table: budgets. RLS enabled and forced, with exactly the two policies (BR-P2-04).
ALTER TABLE "app"."budgets" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "app"."budgets" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY owner_isolation ON "app"."budgets" FOR ALL TO daybook_runtime
	USING (user_id = nullif(current_setting('app.user_id', true), '')::uuid)
	WITH CHECK (user_id = nullif(current_setting('app.user_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY system_access ON "app"."budgets" FOR ALL TO daybook_system
	USING (true) WITH CHECK (true);--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "app"."budgets" TO daybook_runtime;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "app"."budgets" TO daybook_system;
