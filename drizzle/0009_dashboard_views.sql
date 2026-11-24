CREATE TABLE "app"."dashboard_views" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"name" text NOT NULL,
	"widgets" jsonb NOT NULL,
	"format_version" integer NOT NULL,
	"changed_at" timestamp with time zone NOT NULL,
	"deleted" boolean DEFAULT false NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "dashboard_views_user_id_id_key" UNIQUE("user_id","id"),
	CONSTRAINT "dashboard_views_name_text" CHECK (("app"."dashboard_views"."deleted" AND "app"."dashboard_views"."name" = '')
				OR (NOT "app"."dashboard_views"."deleted"
					AND char_length("app"."dashboard_views"."name") BETWEEN 1 AND 40
					AND "app"."dashboard_views"."name" !~ '[\x01-\x1f\x7f-\x9f]'
					AND "app"."dashboard_views"."name" IS NFC NORMALIZED)),
	CONSTRAINT "dashboard_views_widgets_array" CHECK (jsonb_typeof("app"."dashboard_views"."widgets") = 'array'
				AND (NOT "app"."dashboard_views"."deleted" OR "app"."dashboard_views"."widgets" = '[]'::jsonb)),
	CONSTRAINT "dashboard_views_widgets_count" CHECK (CASE WHEN jsonb_typeof("app"."dashboard_views"."widgets") = 'array'
				THEN jsonb_array_length("app"."dashboard_views"."widgets") <= 50 ELSE true END),
	CONSTRAINT "dashboard_views_widgets_entries" CHECK (CASE WHEN jsonb_typeof("app"."dashboard_views"."widgets") = 'array'
				THEN jsonb_array_length(jsonb_path_query_array("app"."dashboard_views"."widgets", 'strict $[*] ? (@.type() == "object"
	&& !exists(@.keyvalue() ? (@.key != "id" && @.key != "size" && @.key != "hidden"))
	&& @.id.type() == "string"
	&& @.id like_regex "^.{1,64}$"
	&& @.size.type() == "number" && @.size.floor() == @.size
	&& @.hidden.type() == "boolean")'::jsonpath,
					'{}', true)) = jsonb_array_length("app"."dashboard_views"."widgets")
				ELSE true END),
	CONSTRAINT "dashboard_views_version_positive" CHECK ("app"."dashboard_views"."version" >= 1)
);
--> statement-breakpoint
ALTER TABLE "app"."dashboard_views" ADD CONSTRAINT "dashboard_views_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint

-- ===========================================================================================
-- Written by hand below this line (BR-P2-36): row-level security and grants.
-- Grants follow P2, section 3 exactly; db:verify fails on any extra or missing one (BR-P2-02).
-- ===========================================================================================

-- Private table: dashboard_views. RLS enabled and forced, with exactly the two policies (BR-P2-04).
ALTER TABLE "app"."dashboard_views" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "app"."dashboard_views" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY owner_isolation ON "app"."dashboard_views" FOR ALL TO daybook_runtime
	USING (user_id = nullif(current_setting('app.user_id', true), '')::uuid)
	WITH CHECK (user_id = nullif(current_setting('app.user_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY system_access ON "app"."dashboard_views" FOR ALL TO daybook_system
	USING (true) WITH CHECK (true);--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "app"."dashboard_views" TO daybook_runtime;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "app"."dashboard_views" TO daybook_system;
