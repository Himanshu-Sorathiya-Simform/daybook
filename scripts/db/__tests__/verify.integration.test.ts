import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { parseOwnerEnv } from "../../../src/server/env";
import { verifyDatabase } from "../verify";

// Each test breaks one thing inside a transaction, runs the checks in that same transaction,
// then rolls back, so the test database is never left changed (AC-P2-07).
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

async function problemsAfter(...statements: string[]): Promise<string[]> {
	await client.query("BEGIN");
	try {
		for (const statement of statements) await client.query(statement);
		return await verifyDatabase(client);
	} finally {
		await client.query("ROLLBACK");
	}
}

// AC-P2-07
test("passes on the migrated database", async () => {
	expect(await problemsAfter()).toEqual([]);
});

describe("row-level security on private tables (BR-P2-04)", () => {
	// AC-P2-07
	test("fails for a private table with RLS disabled", async () => {
		expect(
			await problemsAfter(
				"ALTER TABLE app.profile DISABLE ROW LEVEL SECURITY",
			),
		).toContain("app.profile does not have RLS enabled");
	});

	test("fails for a private table whose RLS is not forced", async () => {
		expect(
			await problemsAfter(
				"ALTER TABLE app.idempotency_records NO FORCE ROW LEVEL SECURITY",
			),
		).toContain("app.idempotency_records does not force RLS");
	});

	// AC-P2-07
	test("fails for a missing owner_isolation policy", async () => {
		expect(
			await problemsAfter("DROP POLICY owner_isolation ON app.profile"),
		).toContain("app.profile is missing policy owner_isolation");
	});

	// AC-P2-07
	test("fails for a missing system_access policy", async () => {
		expect(
			await problemsAfter(
				"DROP POLICY system_access ON app.idempotency_records",
			),
		).toContain("app.idempotency_records is missing policy system_access");
	});

	test("fails for an extra policy", async () => {
		expect(
			await problemsAfter(
				"CREATE POLICY peek ON app.profile FOR SELECT TO daybook_runtime USING (true)",
			),
		).toContain("app.profile has an extra policy peek");
	});

	test("fails when owner_isolation's condition is loosened", async () => {
		expect(
			await problemsAfter(
				"ALTER POLICY owner_isolation ON app.profile USING (true) WITH CHECK (true)",
			),
		).toContain(
			"app.profile policy owner_isolation differs from P2 in: qual, with_check",
		);
	});

	test("fails when owner_isolation also applies to another role", async () => {
		expect(
			await problemsAfter(
				"ALTER POLICY owner_isolation ON app.profile TO daybook_runtime, daybook_auth",
			),
		).toContain("app.profile policy owner_isolation differs from P2 in: roles");
	});

	test("fails when system_access covers only reads", async () => {
		expect(
			await problemsAfter(
				"DROP POLICY system_access ON app.profile",
				"CREATE POLICY system_access ON app.profile FOR SELECT TO daybook_system USING (true)",
			),
		).toContain(
			"app.profile policy system_access differs from P2 in: cmd, with_check",
		);
	});

	test("fails for a private table whose user_id may be null", async () => {
		expect(
			await problemsAfter(
				"ALTER TABLE app.idempotency_records ALTER COLUMN user_id DROP NOT NULL",
			),
		).toContain("app.idempotency_records has no NOT NULL uuid column user_id");
	});

	test("fails for reference data with RLS enabled", async () => {
		expect(
			await problemsAfter(
				"ALTER TABLE app.currencies ENABLE ROW LEVEL SECURITY",
			),
		).toContain("app.currencies is reference data but has RLS enabled");
	});
});

describe("table classes", () => {
	test("fails for a table missing from TABLE_CLASSES", async () => {
		expect(await problemsAfter("CREATE TABLE app.mystery (id int)")).toContain(
			"app.mystery is not in TABLE_CLASSES, so its access cannot be checked",
		);
	});

	test("fails for a classified table that does not exist", async () => {
		expect(
			await problemsAfter(
				"ALTER TABLE app.categories RENAME TO category_list",
			),
		).toContain(
			"app.categories is in TABLE_CLASSES but does not exist; run pnpm db:migrate",
		);
	});
});

describe("grants (BR-P2-02)", () => {
	// AC-P2-07
	test("fails for an extra privilege on a private table", async () => {
		expect(
			await problemsAfter("GRANT TRUNCATE ON app.profile TO daybook_runtime"),
		).toContain(
			"app.profile (table): daybook_runtime has TRUNCATE, which it must not",
		);
	});

	test("fails for a missing privilege on a private table", async () => {
		expect(
			await problemsAfter("REVOKE DELETE ON app.profile FROM daybook_runtime"),
		).toContain("app.profile (table): daybook_runtime lacks DELETE");
	});

	test("fails when the runtime role can write reference data (SEC-3)", async () => {
		expect(
			await problemsAfter("GRANT INSERT ON app.currencies TO daybook_runtime"),
		).toContain(
			"app.currencies (table): daybook_runtime has INSERT, which it must not",
		);
	});

	test("fails when the runtime role can read an auth table (D-19)", async () => {
		expect(
			await problemsAfter('GRANT SELECT ON auth."user" TO daybook_runtime'),
		).toContain(
			"auth.user (table): daybook_runtime has SELECT, which it must not",
		);
	});

	test("fails when the auth role can read finance data", async () => {
		expect(
			await problemsAfter("GRANT SELECT ON app.profile TO daybook_auth"),
		).toContain(
			"app.profile (table): daybook_auth has SELECT, which it must not",
		);
	});

	test("fails for a grant to PUBLIC in our schemas", async () => {
		expect(
			await problemsAfter("GRANT SELECT ON app.profile TO PUBLIC"),
		).toContain("app.profile: PUBLIC has SELECT, which it must not");
	});

	test("fails for a Daybook role's grant outside app and auth", async () => {
		expect(
			await problemsAfter(
				"GRANT SELECT ON drizzle.__drizzle_migrations TO daybook_runtime",
			),
		).toContain(
			"drizzle.__drizzle_migrations: daybook_runtime has SELECT, which it must not",
		);
	});

	test("fails for a grant on a table in the public schema", async () => {
		expect(
			await problemsAfter(
				"CREATE TABLE public.verify_probe (id int)",
				"GRANT SELECT ON public.verify_probe TO daybook_system",
			),
		).toContain(
			"public.verify_probe: daybook_system has SELECT, which it must not",
		);
	});

	test("fails for a column grant", async () => {
		expect(
			await problemsAfter(
				"GRANT SELECT (country) ON app.profile TO daybook_auth",
			),
		).toContain(
			"column app.profile.country: daybook_auth has a column grant, which it must not",
		);
	});

	test("fails for a grant on a sequence nobody declared", async () => {
		expect(
			await problemsAfter(
				"CREATE SEQUENCE app.verify_probe_seq",
				"GRANT USAGE ON SEQUENCE app.verify_probe_seq TO daybook_runtime",
			),
		).toContain(
			"app.verify_probe_seq (sequence): daybook_runtime has USAGE, which it must not",
		);
	});

	test("fails for CREATE on schema app", async () => {
		expect(
			await problemsAfter("GRANT CREATE ON SCHEMA app TO daybook_runtime"),
		).toContain("schema app: daybook_runtime has CREATE, which it must not");
	});

	test("fails for missing USAGE on schema app", async () => {
		expect(
			await problemsAfter("REVOKE USAGE ON SCHEMA app FROM daybook_system"),
		).toContain("schema app: daybook_system lacks USAGE");
	});

	test("fails when the runtime role can enter schema auth", async () => {
		expect(
			await problemsAfter("GRANT USAGE ON SCHEMA auth TO daybook_runtime"),
		).toContain("schema auth: daybook_runtime has USAGE, which it must not");
	});

	test("fails when PUBLIC can enter schema app", async () => {
		expect(await problemsAfter("GRANT USAGE ON SCHEMA app TO PUBLIC")).toContain(
			"schema app: PUBLIC has USAGE, which it must not",
		);
	});

	test("fails when a Daybook role can enter the drizzle schema", async () => {
		expect(
			await problemsAfter("GRANT USAGE ON SCHEMA drizzle TO daybook_runtime"),
		).toContain("schema drizzle: daybook_runtime has USAGE, which it must not");
	});
});

describe("roles (BR-P2-03)", () => {
	test.each([
		["CREATEDB", "daybook_runtime"],
		["CREATEROLE", "daybook_system"],
		["BYPASSRLS", "daybook_runtime"],
		["REPLICATION", "daybook_auth"],
	])("fails for a role with %s", async (power, role) => {
		expect(await problemsAfter(`ALTER ROLE ${role} ${power}`)).toContain(
			`role ${role} has ${power}`,
		);
	});

	test("fails for a role that cannot log in", async () => {
		expect(await problemsAfter("ALTER ROLE daybook_auth NOLOGIN")).toContain(
			"role daybook_auth cannot log in",
		);
	});

	test("fails for a missing role", async () => {
		expect(
			await problemsAfter(
				"ALTER ROLE daybook_auth RENAME TO daybook_auth_renamed",
			),
		).toContain("role daybook_auth does not exist; run pnpm db:bootstrap");
	});

	test("fails for a role that belongs to another role", async () => {
		expect(
			await problemsAfter("GRANT daybook_auth TO daybook_runtime"),
		).toContain(
			"role daybook_runtime is a member of daybook_auth, so it can use that role's rights",
		);
	});

	test("fails for a role that owns something", async () => {
		// Creating an object for another role needs the right to act as it; both roll back.
		expect(
			await problemsAfter(
				"GRANT daybook_system TO current_user WITH SET TRUE",
				"CREATE SCHEMA verify_probe AUTHORIZATION daybook_system",
			),
		).toContain("role daybook_system owns schema verify_probe");
	});
});

describe("views and functions (BR-P2-05, BR-P2-07)", () => {
	// AC-P2-07
	test("fails for a view without security_invoker", async () => {
		expect(
			await problemsAfter(
				"CREATE VIEW app.verify_probe AS SELECT id FROM app.profile",
			),
		).toContain(
			"view app.verify_probe lacks security_invoker = true, so it bypasses RLS",
		);
	});

	test("passes for a view with security_invoker", async () => {
		expect(
			await problemsAfter(
				"CREATE VIEW app.verify_probe WITH (security_invoker = true) AS SELECT id FROM app.profile",
			),
		).toEqual([]);
	});

	test("fails for a materialized view that reads a private table", async () => {
		expect(
			await problemsAfter(
				"CREATE MATERIALIZED VIEW app.verify_probe AS SELECT user_id FROM app.profile WITH NO DATA",
			),
		).toContain(
			"materialized view app.verify_probe reads private table app.profile, and ignores RLS",
		);
	});

	test("passes for a materialized view over reference data", async () => {
		expect(
			await problemsAfter(
				"CREATE MATERIALIZED VIEW app.verify_probe AS SELECT code FROM app.currencies WITH NO DATA",
			),
		).toEqual([]);
	});

	// AC-P2-07
	test("fails for a SECURITY DEFINER function in app", async () => {
		expect(
			await problemsAfter(
				"CREATE FUNCTION app.verify_probe() RETURNS int LANGUAGE sql SECURITY DEFINER AS 'SELECT 1'",
			),
		).toContain(
			"function app.verify_probe is SECURITY DEFINER, which bypasses RLS (SEC-5)",
		);
	});

	test("passes for a SECURITY INVOKER function in app", async () => {
		expect(
			await problemsAfter(
				"CREATE FUNCTION app.verify_probe() RETURNS int LANGUAGE sql AS 'SELECT 1'",
			),
		).toEqual([]);
	});
});
