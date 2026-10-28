import { fileURLToPath } from "node:url";
import { configDefaults, defineConfig } from "vitest/config";

/** Files that change something every other file shares, so they run alone, one after another,
 * once the rest have finished:
 * - verify breaks the schema inside rolled-back transactions, which lock the tables it touches;
 * - scripts runs bootstrap, which sets every role's password again;
 * - auth adds a temporary constraint to `auth.account`, which would fail other sign-ups;
 * - daily-pass writes the shared day markers and purges every user's old records. */
const SERIAL = [
	"scripts/db/tests/verify.integration.test.ts",
	"scripts/db/tests/scripts.integration.test.ts",
	"src/server/auth/tests/auth.integration.test.ts",
	"src/server/system/tests/daily-pass.integration.test.ts",
];

/** The database tests (`pnpm test:integration`): `*.integration.test.ts` files, run in Node
 * against a real Postgres, never a mock (testing rule). Locally that is the Neon test branch
 * from `.env.test`; in CI, a Postgres service container.
 *
 * Every other file creates its own users and touches only their rows, so those files run in
 * parallel first; `SERIAL` runs afterwards, one file at a time (`groupOrder`). */
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
		globalSetup: ["./vitest.integration.setup.ts"],
		// Each query crosses to the database's region and back; Neon may also be waking up.
		testTimeout: 30_000,
		hookTimeout: 60_000,
		projects: [
			{
				extends: true,
				test: {
					name: "database",
					include: ["**/*.integration.test.ts"],
					exclude: [
						...configDefaults.exclude,
						".next/**",
						"e2e/**",
						...SERIAL,
					],
					sequence: { groupOrder: 0 },
				},
			},
			{
				extends: true,
				test: {
					name: "database-serial",
					include: SERIAL,
					fileParallelism: false,
					sequence: { groupOrder: 1 },
				},
			},
		],
	},
});
