/**
 * `pnpm db:migrate [--env <file>]` applies the migrations in `drizzle/` as the owner, over the
 * direct endpoint (BR-P2-36). The app never migrates on start. Every pending migration runs
 * in one transaction, so a failure leaves the database as it was. Drizzle keeps its log in
 * `drizzle.__drizzle_migrations`, a schema the Daybook roles cannot reach.
 *
 * Run `pnpm db:bootstrap` first: migrations grant to the roles it creates. Afterwards it runs
 * the same checks as `pnpm db:verify` and fails if any does (BR-P2-37).
 */
import { pathToFileURL } from "node:url";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Client, type ClientBase } from "pg";
import { parseOwnerEnv } from "../../src/server/env";
import { loadEnvFile } from "./env-file";
import { report, verifyDatabase } from "./verify";

export const MIGRATIONS_FOLDER = "drizzle";

/** How many migrations the database has recorded, or 0 before the first run. */
async function appliedCount(client: ClientBase): Promise<number> {
	// Two queries: Postgres resolves every table a statement names before running it, even
	// in a CASE branch that never runs, so the count must wait until the table exists.
	const log = await client.query<{ exists: boolean }>(
		"SELECT to_regclass('drizzle.__drizzle_migrations') IS NOT NULL AS exists",
	);
	if (!log.rows[0]!.exists) return 0;
	const { rows } = await client.query<{ count: number }>(
		"SELECT count(*)::int AS count FROM drizzle.__drizzle_migrations",
	);
	return rows[0]!.count;
}

/** Applies every pending migration and returns how many were applied. */
export async function runMigrations(client: Client): Promise<number> {
	const before = await appliedCount(client);
	await migrate(drizzle({ client }), { migrationsFolder: MIGRATIONS_FOLDER });
	return (await appliedCount(client)) - before;
}

async function main(): Promise<void> {
	const file = loadEnvFile(process.argv.slice(2));
	const env = parseOwnerEnv(process.env);
	const target = new URL(env.DATABASE_URL_OWNER);
	console.log(
		`Migrating ${target.hostname}/${target.pathname.slice(1)} as ${decodeURIComponent(target.username)}`
			+ (file ? ` (variables from ${file})` : ""),
	);
	const client = new Client({
		connectionString: env.DATABASE_URL_OWNER,
		connectionTimeoutMillis: 10_000,
	});
	await client.connect();
	try {
		const applied = await runMigrations(client);
		console.log(
			applied === 0 ?
				"Nothing to apply: the database is up to date."
			:	`Applied ${applied} migration${applied === 1 ? "" : "s"}.`,
		);
		if (!report(await verifyDatabase(client))) process.exitCode = 1;
	} finally {
		await client.end();
	}
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	main().catch((error: unknown) => {
		console.error(error instanceof Error ? error.message : error);
		process.exitCode = 1;
	});
}
