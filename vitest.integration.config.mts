import { fileURLToPath } from "node:url";
import { configDefaults, defineConfig } from "vitest/config";

/** The database tests (`pnpm test:integration`): `*.integration.test.ts` files, run in Node
 * against a real Postgres, never a mock (testing rule). Locally that is the Neon test branch
 * from `.env.test`; in CI, a Postgres service container. One file at a time, since files
 * share the database. */
export default defineConfig({
	resolve: {
		tsconfigPaths: true,
		alias: {
			"server-only": fileURLToPath(
				new URL("./node_modules/server-only/empty.js", import.meta.url),
			),
		},
	},
	test: {
		environment: "node",
		include: ["**/*.integration.test.ts"],
		exclude: [...configDefaults.exclude, ".next/**", "e2e/**"],
		globalSetup: ["./vitest.integration.setup.ts"],
		fileParallelism: false,
		// Each query crosses to the database's region and back; Neon may also be waking up.
		testTimeout: 30_000,
		hookTimeout: 60_000,
	},
});
