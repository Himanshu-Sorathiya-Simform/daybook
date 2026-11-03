import { Client } from "pg";
import { afterAll, beforeAll, expect, test } from "vitest";
import { parseOwnerEnv, parseServerEnv } from "../../../src/server/env";
import { bootstrap, ROLES } from "../bootstrap";
import { checkConnections } from "../check-connections";
import { runMigrations } from "../migrate";
import { verifyDatabase } from "../verify";

// The database scripts against a database that has already been set up: by hand on the Neon
// test branch, or by CI's bootstrap and migrate steps. Each must be safe to run again.
let client: Client;

beforeAll(async () => {
	client = new Client({
		connectionString: parseOwnerEnv(process.env).DATABASE_URL_OWNER,
	});
	await client.connect();
});

afterAll(async () => {
	await client.end();
});

test("bootstrap on a set-up database sets each role's password again and keeps them plain", async () => {
	const results = await bootstrap(client, parseOwnerEnv(process.env));
	expect(results).toEqual(ROLES.map((role) => ({ role, action: "password set" })));
	expect(await verifyDatabase(client)).toEqual([]);
});

test("migrate on an up-to-date database applies nothing", async () => {
	expect(await runMigrations(client)).toBe(0);
	expect(await verifyDatabase(client)).toEqual([]);
});

test("every role logs in with its URL as itself", async () => {
	const results = await checkConnections(parseServerEnv(process.env), process.env);
	expect(results.map((r) => [r.slot.role, r.problems])).toEqual(
		ROLES.map((role) => [role, []]),
	);
});

test("a role URL with a wrong password reports a failed login and no password", async () => {
	const env = parseServerEnv(process.env);
	const url = new URL(env.DATABASE_URL_RUNTIME);
	url.password = "wrong-password-for-this-test";
	const results = await checkConnections(
		{ ...env, DATABASE_URL_RUNTIME: url.toString() },
		{ ...process.env, DB_PASSWORD_RUNTIME: undefined },
	);
	const runtime = results.find((r) => r.slot.role === "daybook_runtime")!;
	expect(runtime.problems).toHaveLength(1);
	expect(runtime.problems[0]).toMatch(/^login failed: /);
	expect(runtime.problems[0]).not.toContain("wrong-password-for-this-test");
});
