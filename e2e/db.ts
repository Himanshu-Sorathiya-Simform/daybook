import { existsSync } from "node:fs";

import { Client } from "pg";

type RoleUrl = "DATABASE_URL_SYSTEM" | "DATABASE_URL_AUTH";

/**
 * A role's URL for the development database the end-to-end server uses (TST-6). The test
 * process reads it from `.env` only here, when a test first needs the database; the server
 * reads `.env` itself. A variable already set in the environment wins, as Node's loader does.
 */
function databaseUrl(name: RoleUrl): string {
	if (process.env[name] === undefined && existsSync(".env")) {
		process.loadEnvFile(".env");
	}
	const url = process.env[name];
	if (!url) throw new Error(`${name} is not set; the end-to-end data needs it.`);
	return url;
}

/** Runs `fn` with one connection as `role`, closed afterwards: no pool, so parallel workers stay
 * within the free plan's connections. */
export async function withDatabase<T>(
	role: RoleUrl,
	fn: (client: Client) => Promise<T>,
): Promise<T> {
	const client = new Client({ connectionString: databaseUrl(role) });
	await client.connect();
	try {
		return await fn(client);
	} finally {
		await client.end();
	}
}
