/**
 * `pnpm db:bootstrap [--env <file>]` creates Daybook's three database roles and its two
 * schemas, as the owner over the direct endpoint (BR-P2-01, D-14). Run it once per Neon
 * project or branch, before the first migration. Running it again is safe: an existing role
 * only gets its password set from the environment again.
 *
 * Roles are never created in the Neon Console, which would give them `BYPASSRLS`, and never
 * by a migration.
 */
import { pathToFileURL } from "node:url";
import { Client, type ClientBase } from "pg";
import { parseOwnerEnv, type OwnerEnv } from "../../src/server/env";
import { loadEnvFile } from "./env-file";

export const ROLES = ["daybook_auth", "daybook_runtime", "daybook_system"] as const;
export type Role = (typeof ROLES)[number];

const PASSWORD_VARIABLE = {
	daybook_auth: "DB_PASSWORD_AUTH",
	daybook_runtime: "DB_PASSWORD_RUNTIME",
	daybook_system: "DB_PASSWORD_SYSTEM",
} as const satisfies Record<Role, keyof OwnerEnv>;

/** Who may enter which schema (P2, section 3). Table grants come with each migration. */
const SCHEMA_SQL = [
	"CREATE SCHEMA IF NOT EXISTS auth",
	"CREATE SCHEMA IF NOT EXISTS app",
	"REVOKE ALL ON SCHEMA auth, app FROM PUBLIC",
	"GRANT USAGE ON SCHEMA auth TO daybook_auth",
	"GRANT USAGE ON SCHEMA app TO daybook_runtime, daybook_system",
];

export type RoleResult = { role: Role; action: "created" | "password set" };

type RoleRow = {
	rolname: string;
	rolsuper: boolean;
	rolcreaterole: boolean;
	rolcreatedb: boolean;
	rolbypassrls: boolean;
	rolreplication: boolean;
	rolcanlogin: boolean;
};

/** Creates or updates the roles and schemas in one transaction: all of it or none.
 * Throws, and rolls back, if any role ends up with more than a plain login (BR-P2-03). */
export async function bootstrap(
	client: ClientBase,
	env: OwnerEnv,
): Promise<RoleResult[]> {
	const results: RoleResult[] = [];
	await client.query("BEGIN");
	try {
		for (const role of ROLES) {
			const existing = await client.query(
				"SELECT 1 FROM pg_roles WHERE rolname = $1",
				[role],
			);
			const verb = existing.rowCount ? "ALTER" : "CREATE";
			// Postgres quotes the name and the password itself, through format('%I') and
			// format('%L'). No other option is named: a role's defaults are no superuser, no
			// CREATEDB, no CREATEROLE, no BYPASSRLS and no replication, and Neon's owner may be
			// refused for naming some of them even to turn them off. The check below proves them.
			const statement = await client.query<{ sql: string }>(
				`SELECT format('${verb} ROLE %I WITH LOGIN PASSWORD %L', $1::text, $2::text) AS sql`,
				[role, env[PASSWORD_VARIABLE[role]]],
			);
			await client.query(statement.rows[0]!.sql);
			results.push({
				role,
				action: verb === "CREATE" ? "created" : "password set",
			});
		}
		for (const sql of SCHEMA_SQL) await client.query(sql);
		await assertPlainRoles(client);
		await client.query("COMMIT");
	} catch (error) {
		await client.query("ROLLBACK");
		throw error;
	}
	return results;
}

async function assertPlainRoles(client: ClientBase): Promise<void> {
	const { rows } = await client.query<RoleRow>(
		`SELECT rolname, rolsuper, rolcreaterole, rolcreatedb, rolbypassrls, rolreplication,
		        rolcanlogin
		   FROM pg_roles WHERE rolname = ANY($1)`,
		[ROLES],
	);
	const problems = ROLES.flatMap((role) => {
		const row = rows.find((r) => r.rolname === role);
		if (!row) return [`${role} does not exist`];
		const powers = (
			[
				["superuser", row.rolsuper],
				["CREATEROLE", row.rolcreaterole],
				["CREATEDB", row.rolcreatedb],
				["BYPASSRLS", row.rolbypassrls],
				["REPLICATION", row.rolreplication],
			] as const
		).flatMap(([name, has]) => (has ? [`${role} has ${name}`] : []));
		return row.rolcanlogin ? powers : [...powers, `${role} cannot log in`];
	});
	if (problems.length > 0) {
		throw new Error(
			`The roles are not plain login roles:\n  - ${problems.join("\n  - ")}`,
		);
	}
}

async function main(): Promise<void> {
	const file = loadEnvFile(process.argv.slice(2));
	const env = parseOwnerEnv(process.env);
	const target = new URL(env.DATABASE_URL_OWNER);
	console.log(
		`Bootstrapping ${target.hostname}/${target.pathname.slice(1)} as ${decodeURIComponent(target.username)}`
			+ (file ? ` (variables from ${file})` : ""),
	);
	const client = new Client({
		connectionString: env.DATABASE_URL_OWNER,
		connectionTimeoutMillis: 10_000,
	});
	await client.connect();
	try {
		for (const { role, action } of await bootstrap(client, env)) {
			console.log(`  ${role}: ${action}`);
		}
		console.log("  schemas auth and app: ready");
		console.log("Done. Every role is a plain login role.");
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
