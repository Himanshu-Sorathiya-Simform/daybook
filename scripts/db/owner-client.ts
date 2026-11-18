import { Client } from "pg";
import { type OwnerEnv, parseOwnerEnv } from "../../src/server/env";
import { loadEnvFile } from "./env-file";

/** What a database command starts with: reads its variables (`--env <file>`), says which
 * database it is about to `doing` something to, and connects as the owner over the direct
 * endpoint. The caller ends the client. */
export async function connectAsOwner(
	doing: string,
): Promise<{ client: Client; env: OwnerEnv }> {
	const file = loadEnvFile(process.argv.slice(2));
	const env = parseOwnerEnv(process.env);
	const target = new URL(env.DATABASE_URL_OWNER);
	console.log(
		`${doing} ${target.hostname}/${target.pathname.slice(1)} as ${decodeURIComponent(target.username)}`
			+ (file ? ` (variables from ${file})` : ""),
	);
	const client = new Client({
		connectionString: env.DATABASE_URL_OWNER,
		connectionTimeoutMillis: 10_000,
	});
	await client.connect();
	return { client, env };
}
