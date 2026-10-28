CREATE TABLE "app"."daily_pass_markers" (
	"day" date PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);--> statement-breakpoint

-- ===========================================================================================
-- Written by hand below this line (BR-P2-36): grants.
-- Grants follow P2, section 3 exactly; db:verify fails on any extra or missing one (BR-P2-02).
-- ===========================================================================================

-- System table: daily_pass_markers (D-437). No user_id and no RLS; only the system module
-- reads or writes it, and the runtime role gets nothing.
GRANT SELECT, INSERT, UPDATE, DELETE ON "app"."daily_pass_markers" TO daybook_system;
