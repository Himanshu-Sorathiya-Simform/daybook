import { defineConfig } from "drizzle-kit";

/** Drizzle Kit only generates migrations here (`pnpm db:generate`), which needs no database.
 * `pnpm db:migrate` applies them through `scripts/db/migrate.ts` as the owner (BR-P2-36). */
export default defineConfig({
	dialect: "postgresql",
	schema: "./src/server/db/schema/index.ts",
	out: "./drizzle",
	schemaFilter: ["auth", "app"],
	strict: true,
	verbose: true,
});
