/**
 * `pnpm db:check-connections [--env <file>]` proves the app's three database URLs work: each
 * logs in over the pooled endpoint as its own role. Run it after `db:bootstrap`, after
 * changing a password, or after pointing a file at a new Neon branch. It prints role names
 * and pass or fail only, never a URL, host or password.
 */
import { pathToFileURL } from "node:url";
import { Client } from "pg";
import { parseServerEnv, type ServerEnv } from "../../src/server/env";
import { loadEnvFile } from "./env-file";

const SLOTS = [
	{ url: "DATABASE_URL_AUTH", password: "DB_PASSWORD_AUTH", role: "daybook_auth" },
	{
		url: "DATABASE_URL_RUNTIME",
		password: "DB_PASSWORD_RUNTIME",
		role: "daybook_runtime",
	},
	{
		url: "DATABASE_URL_SYSTEM",
		password: "DB_PASSWORD_SYSTEM",
		role: "daybook_system",
	},
] as const;

export type Slot = (typeof SLOTS)[number];

/** Checks that need no connection. Each one runs only when its input exists: a deployed
 * app has neither the owner URL nor the role passwords (D-409). */
export function staticProblems(
	slot: Slot,
	env: ServerEnv,
	source: Readonly<Record<string, string | undefined>>,
): string[] {
	const url = new URL(env[slot.url]);
	const problems: string[] = [];
	const password = source[slot.password];
	if (password !== undefined && decodeURIComponent(url.password) !== password) {
		problems.push(`its password differs from ${slot.password}`);
	}
	const owner = source["DATABASE_URL_OWNER"];
	const ownerUrl = owner === undefined ? null : URL.parse(owner);
	// Only Neon has a separate pooled endpoint; a CI or local Postgres has one host.
	if (ownerUrl?.hostname.endsWith(".neon.tech")) {
		const [endpoint, ...rest] = ownerUrl.hostname.split(".");
		const pooledHost = [`${endpoint}-pooler`, ...rest].join(".");
		if (url.hostname !== pooledHost) {
			problems.push(
				"its host is not the pooled endpoint of DATABASE_URL_OWNER's branch",
			);
		}
	}
	return problems;
}

/** Logs in and returns the role the server says we are, or the reason it failed. */
async function loginAs(connectionString: string): Promise<string> {
	const client = new Client({ connectionString, connectionTimeoutMillis: 15_000 });
	try {
		await client.connect();
		const { rows } = await client.query<{ role: string }>(
			"SELECT current_user AS role",
		);
		return rows[0]!.role;
	} finally {
		await client.end().catch(() => {});
	}
}

export type SlotResult = { slot: Slot; problems: string[] };

/** Runs every check for the three slots, logging in once per role. */
export async function checkConnections(
	env: ServerEnv,
	source: Readonly<Record<string, string | undefined>>,
): Promise<SlotResult[]> {
	// The three logins do not depend on each other, so they run together; the results keep
	// the order of SLOTS.
	return Promise.all(
		SLOTS.map(async (slot): Promise<SlotResult> => {
			const problems = staticProblems(slot, env, source);
			try {
				const role = await loginAs(env[slot.url]);
				if (role !== slot.role) problems.push(`it logged in as ${role}`);
			} catch (error) {
				// pg's messages name the problem (password authentication failed, timeout), never
				// the password itself.
				problems.push(
					`login failed: ${error instanceof Error ? error.message : "unknown"}`,
				);
			}
			return { slot, problems };
		}),
	);
}

async function main(): Promise<void> {
	const file = loadEnvFile(process.argv.slice(2));
	console.log(
		`Checking database connections${file ? ` (variables from ${file})` : ""}`,
	);
	const env = parseServerEnv(process.env);
	const results = await checkConnections(env, process.env);
	for (const { slot, problems } of results) {
		console.log(
			problems.length === 0 ?
				`  ${slot.url}: ok, logged in as ${slot.role}`
			:	`  ${slot.url}: FAILED, ${problems.join("; ")}`,
		);
	}
	if (results.some((r) => r.problems.length > 0)) process.exitCode = 1;
	else console.log("Done. All three roles log in.");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	main().catch((error: unknown) => {
		console.error(error instanceof Error ? error.message : error);
		process.exitCode = 1;
	});
}
