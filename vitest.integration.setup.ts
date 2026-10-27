import { existsSync } from "node:fs";
import { Client } from "pg";
import { loadEnvFile } from "./scripts/db/env-file";
import { report, verifyDatabase } from "./scripts/db/verify";
import { parseOwnerEnv, parseServerEnv } from "./src/server/env";

/** Runs once before the database tests (`pnpm test:integration`).
 *
 * 1. Loads `.env.test`, never `.env`. In CI there is no file; the workflow sets the variables.
 * 2. Refuses to run unless `DAYBOOK_TEST_DATABASE=true`, a marker that only a test database's
 *    variables carry, so the suite can never write to the main branch by mistake.
 * 3. Runs `db:verify` (BR-P2-37): the tests prove isolation, which only means something on a
 *    database whose roles, policies and grants are right. */
export default async function setup(): Promise<void> {
	if (existsSync(".env.test")) loadEnvFile(["--env", ".env.test"]);
	if (process.env["DAYBOOK_TEST_DATABASE"] !== "true") {
		throw new Error(
			"The database tests run only against a test database. Add DAYBOOK_TEST_DATABASE=true to "
				+ ".env.test (the Neon test branch) or to CI's environment.",
		);
	}
	parseServerEnv(process.env);
	const env = parseOwnerEnv(process.env);
	const client = new Client({
		connectionString: env.DATABASE_URL_OWNER,
		connectionTimeoutMillis: 15_000,
	});
	await client.connect();
	try {
		if (!report(await verifyDatabase(client))) {
			throw new Error(
				"The test database failed db:verify; fix it before running the tests.",
			);
		}
	} finally {
		await client.end();
	}
}
