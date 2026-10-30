DROP INDEX "app"."transactions_payee_idx";--> statement-breakpoint

-- ===========================================================================================
-- Written by hand below this line (BR-P2-36): the search index and its extension.
-- ===========================================================================================

-- Under RLS, Postgres uses a condition as an index condition only when it is leakproof.
-- ILIKE, LIKE and lower() are not, so neither index above could serve the runtime role;
-- search scans the user's rows instead (D-48, D-468). The index goes before the extension
-- whose operator class it uses.
DROP INDEX "app"."transactions_search_idx";--> statement-breakpoint
DROP EXTENSION pg_trgm;
