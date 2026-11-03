CREATE TABLE "auth"."rate_limit" (
	"id" uuid PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"count" integer NOT NULL,
	"last_request" bigint NOT NULL,
	CONSTRAINT "rate_limit_key_unique" UNIQUE("key")
);
--> statement-breakpoint

-- ===========================================================================================
-- Written by hand below this line (BR-P2-36): grants.
-- Grants follow P2, section 3 exactly; db:verify fails on any extra or missing one (BR-P2-02).
-- ===========================================================================================

-- Better Auth's rate limiter (D-153): daybook_auth only, like every table in auth.
GRANT SELECT, INSERT, UPDATE, DELETE ON "auth"."rate_limit" TO daybook_auth;
