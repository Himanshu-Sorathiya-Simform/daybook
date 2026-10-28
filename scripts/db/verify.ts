/**
 * `pnpm db:verify [--env <file>]` checks that the database's security matches P2 (BR-P2-37).
 * It runs after every migration (`db:migrate` calls it) and before every database test run,
 * and exits non-zero on any problem:
 *
 * - every private table has RLS enabled and forced, and exactly the `owner_isolation` and
 *   `system_access` policies, word for word (BR-P2-04);
 * - every view in `app` has `security_invoker`, and no materialized view reads a private
 *   table (BR-P2-05);
 * - the grants on tables, schemas and other objects equal P2, section 3 (BR-P2-02);
 * - the three roles are plain login roles that own nothing and belong to no role (BR-P2-03);
 * - schema `app` has no `SECURITY DEFINER` function (BR-P2-07).
 *
 * It works in two halves: `collectFacts` reads the catalog in one round trip, and
 * `checkFacts` compares the facts with P2 without touching the database. Which grants and
 * policies a table needs comes from its class in `TABLE_CLASSES`.
 */
import { pathToFileURL } from "node:url";
import { Client, type ClientBase, type QueryResult } from "pg";
import {
	isPrivateClass,
	TABLE_CLASSES,
	type TableClass,
} from "../../src/server/db/table-classes";
import { parseOwnerEnv } from "../../src/server/env";
import { ROLES } from "./bootstrap";
import { loadEnvFile } from "./env-file";

type Role = (typeof ROLES)[number];
type Grants = Partial<Record<Role, readonly string[]>>;

const CRUD = ["DELETE", "INSERT", "SELECT", "UPDATE"] as const;
const READ = ["SELECT"] as const;

/** P2, section 3: what each role may do on a table of each class. */
const TABLE_GRANTS: Record<TableClass, Grants> = {
	private: { daybook_runtime: CRUD, daybook_system: CRUD },
	private_system_written: { daybook_runtime: READ, daybook_system: CRUD },
	reference: { daybook_runtime: READ, daybook_system: CRUD },
	system: { daybook_system: CRUD },
};

/** Every table in schema `auth` is Better Auth's, reached by the auth role alone (D-19). */
const AUTH_TABLE_GRANTS: Grants = { daybook_auth: CRUD };

/** Who may enter which schema; no Daybook role has a grant on any other schema. */
const SCHEMA_GRANTS: Record<string, Grants> = {
	auth: { daybook_auth: ["USAGE"] },
	app: { daybook_runtime: ["USAGE"], daybook_system: ["USAGE"] },
};

/** Grants on sequences and other non-table objects. F12 adds `app.billing_sync_seq`. */
const OTHER_GRANTS: Record<string, Grants> = {};

/** The schemas where PUBLIC (every role) must have no grant at all. */
const OUR_SCHEMAS = ["app", "auth", "drizzle"];

/** The two policies, exactly as Postgres prints them back (BR-P2-04). */
const USER_CONTEXT =
	"(user_id = (NULLIF(current_setting('app.user_id'::text, true), ''::text))::uuid)";
const EXPECTED_POLICIES = [
	{
		policyname: "owner_isolation",
		permissive: "PERMISSIVE",
		roles: ["daybook_runtime"],
		cmd: "ALL",
		qual: USER_CONTEXT,
		with_check: USER_CONTEXT,
	},
	{
		policyname: "system_access",
		permissive: "PERMISSIVE",
		roles: ["daybook_system"],
		cmd: "ALL",
		qual: "true",
		with_check: "true",
	},
];

const KIND_NAMES: Record<string, string> = {
	r: "table",
	p: "table",
	v: "view",
	m: "materialized view",
	S: "sequence",
	f: "foreign table",
};

// --- Collecting --------------------------------------------------------------------------

export type Facts = {
	roles: {
		rolname: string;
		rolsuper: boolean;
		rolcreaterole: boolean;
		rolcreatedb: boolean;
		rolbypassrls: boolean;
		rolreplication: boolean;
		rolcanlogin: boolean;
	}[];
	memberships: { member: string; role: string }[];
	owned: { owner: string; what: string }[];
	appTables: { name: string; rls: boolean; forced: boolean; hasUserId: boolean }[];
	policies: {
		tablename: string;
		policyname: string;
		permissive: string;
		roles: string[];
		cmd: string;
		qual: string | null;
		with_check: string | null;
	}[];
	relations: { schema: string; name: string; kind: string }[];
	relationGrants: {
		schema: string;
		name: string;
		grantee: string;
		privileges: string[];
	}[];
	columnGrants: { what: string; grantee: string }[];
	schemaGrants: { schema: string; grantee: string; privileges: string[] }[];
	views: { name: string; options: string[] | null }[];
	matviewReads: { view: string; source: string }[];
	definerFunctions: { name: string }[];
};

/** A text array literal from Daybook's own constants (role and schema names), never input. */
const textArray = (values: readonly string[]) => {
	const literals = values.map((v) => "'" + v.replaceAll("'", "''") + "'");
	return `ARRAY[${literals.join(", ")}]::text[]`;
};

const DAYBOOK_ROLES = textArray(ROLES);
const PUBLIC_CHECKED = textArray(OUR_SCHEMAS);

/** One catalog query per fact, sent together so the whole check is one round trip. */
const QUERIES: { [K in keyof Facts]: string } = {
	roles: `SELECT rolname, rolsuper, rolcreaterole, rolcreatedb, rolbypassrls, rolreplication,
	               rolcanlogin
	          FROM pg_roles WHERE rolname = ANY(${DAYBOOK_ROLES})`,
	memberships: `SELECT m.rolname AS member, r.rolname AS role
	                FROM pg_auth_members am
	                JOIN pg_roles r ON r.oid = am.roleid
	                JOIN pg_roles m ON m.oid = am.member
	               WHERE m.rolname = ANY(${DAYBOOK_ROLES})
	               ORDER BY 1, 2`,
	owned: `SELECT pg_get_userbyid(c.relowner) AS owner,
	               format('relation %I.%I', n.nspname, c.relname) AS what
	          FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
	         WHERE pg_get_userbyid(c.relowner) = ANY(${DAYBOOK_ROLES})
	        UNION ALL
	        SELECT pg_get_userbyid(nspowner), format('schema %I', nspname)
	          FROM pg_namespace WHERE pg_get_userbyid(nspowner) = ANY(${DAYBOOK_ROLES})
	        UNION ALL
	        SELECT pg_get_userbyid(p.proowner), format('function %I.%I', n.nspname, p.proname)
	          FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
	         WHERE pg_get_userbyid(p.proowner) = ANY(${DAYBOOK_ROLES})
	        UNION ALL
	        SELECT pg_get_userbyid(datdba), format('database %I', datname)
	          FROM pg_database WHERE pg_get_userbyid(datdba) = ANY(${DAYBOOK_ROLES})
	         ORDER BY 1, 2`,
	appTables: `SELECT c.relname AS name, c.relrowsecurity AS rls, c.relforcerowsecurity AS forced,
	                   EXISTS (SELECT 1 FROM pg_attribute a
	                            WHERE a.attrelid = c.oid AND a.attname = 'user_id'
	                              AND NOT a.attisdropped AND a.attnotnull
	                              AND a.atttypid = 'uuid'::regtype) AS "hasUserId"
	              FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
	             WHERE n.nspname = 'app' AND c.relkind IN ('r', 'p')
	             ORDER BY c.relname`,
	policies: `SELECT tablename, policyname, permissive, roles::text[] AS roles, cmd, qual,
	                  with_check
	             FROM pg_policies WHERE schemaname = 'app' ORDER BY tablename, policyname`,
	relations: `SELECT n.nspname AS schema, c.relname AS name, c.relkind AS kind
	              FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
	             WHERE n.nspname IN ('app', 'auth') AND c.relkind IN ('r', 'p', 'v', 'm', 'S', 'f')
	             ORDER BY 1, 2`,
	// Every privilege a Daybook role holds directly on any relation, and every privilege PUBLIC
	// holds in our schemas. PUBLIC's rights on Postgres's own catalogs are not Daybook's.
	relationGrants: `SELECT n.nspname AS schema, c.relname AS name,
	                        coalesce(r.rolname, 'PUBLIC') AS grantee,
	                        array_agg(a.privilege_type ORDER BY a.privilege_type) AS privileges
	                   FROM pg_class c
	                   JOIN pg_namespace n ON n.oid = c.relnamespace
	                   CROSS JOIN LATERAL aclexplode(c.relacl) a
	                   LEFT JOIN pg_roles r ON r.oid = a.grantee
	                  WHERE r.rolname = ANY(${DAYBOOK_ROLES})
	                     OR (a.grantee = 0 AND n.nspname = ANY(${PUBLIC_CHECKED}))
	                  GROUP BY 1, 2, 3
	                  ORDER BY 1, 2, 3`,
	columnGrants: `SELECT format('%I.%I.%I', n.nspname, c.relname, at.attname) AS what,
	                      coalesce(r.rolname, 'PUBLIC') AS grantee
	                 FROM pg_attribute at
	                 JOIN pg_class c ON c.oid = at.attrelid
	                 JOIN pg_namespace n ON n.oid = c.relnamespace
	                 CROSS JOIN LATERAL aclexplode(at.attacl) a
	                 LEFT JOIN pg_roles r ON r.oid = a.grantee
	                WHERE r.rolname = ANY(${DAYBOOK_ROLES})
	                   OR (a.grantee = 0 AND n.nspname = ANY(${PUBLIC_CHECKED}))
	                ORDER BY 1, 2`,
	schemaGrants: `SELECT n.nspname AS schema, coalesce(r.rolname, 'PUBLIC') AS grantee,
	                      array_agg(a.privilege_type ORDER BY a.privilege_type) AS privileges
	                 FROM pg_namespace n
	                 CROSS JOIN LATERAL aclexplode(n.nspacl) a
	                 LEFT JOIN pg_roles r ON r.oid = a.grantee
	                WHERE r.rolname = ANY(${DAYBOOK_ROLES})
	                   OR (a.grantee = 0 AND n.nspname = ANY(${PUBLIC_CHECKED}))
	                GROUP BY 1, 2
	                ORDER BY 1, 2`,
	views: `SELECT c.relname AS name, c.reloptions AS options
	          FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
	         WHERE n.nspname = 'app' AND c.relkind = 'v'
	         ORDER BY 1`,
	matviewReads: `SELECT DISTINCT v.relname AS view, t.relname AS source
	                 FROM pg_class v
	                 JOIN pg_namespace vn ON vn.oid = v.relnamespace
	                 JOIN pg_rewrite rw ON rw.ev_class = v.oid
	                 JOIN pg_depend d ON d.objid = rw.oid AND d.classid = 'pg_rewrite'::regclass
	                 JOIN pg_class t ON t.oid = d.refobjid AND t.oid <> v.oid
	                 JOIN pg_namespace tn ON tn.oid = t.relnamespace
	                WHERE vn.nspname = 'app' AND v.relkind = 'm' AND tn.nspname = 'app'
	                ORDER BY 1, 2`,
	definerFunctions: `SELECT p.proname AS name
	                     FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
	                    WHERE n.nspname = 'app' AND p.prosecdef
	                    ORDER BY 1`,
};

/** Reads every fact in one round trip: the statements go together, and Postgres answers
 * each in order. They carry no parameters, which is what lets them share one message. */
export async function collectFacts(client: ClientBase): Promise<Facts> {
	const names = Object.keys(QUERIES) as (keyof Facts)[];
	const results = (await client.query(
		names.map((name) => QUERIES[name]).join(";\n"),
	)) as unknown as QueryResult[];
	return Object.fromEntries(
		names.map((name, i) => [name, results[i]!.rows]),
	) as Facts;
}

// --- Checking ----------------------------------------------------------------------------

/** Compares a grantee's actual privileges on one object with the expected ones. */
function compare(
	label: string,
	grantee: string,
	actual: readonly string[],
	expected: readonly string[],
): string[] {
	const extra = actual.filter((p) => !expected.includes(p));
	const missing = expected.filter((p) => !actual.includes(p));
	return [
		...(extra.length ?
			[`${label}: ${grantee} has ${extra.join(", ")}, which it must not`]
		:	[]),
		...(missing.length ?
			[`${label}: ${grantee} lacks ${missing.join(", ")}`]
		:	[]),
	];
}

function checkRoles(facts: Facts): string[] {
	const problems: string[] = [];
	for (const role of ROLES) {
		const row = facts.roles.find((r) => r.rolname === role);
		if (!row) {
			problems.push(`role ${role} does not exist; run pnpm db:bootstrap`);
			continue;
		}
		const powers: [string, boolean][] = [
			["superuser", row.rolsuper],
			["CREATEROLE", row.rolcreaterole],
			["CREATEDB", row.rolcreatedb],
			["BYPASSRLS", row.rolbypassrls],
			["REPLICATION", row.rolreplication],
		];
		for (const [power, has] of powers) {
			if (has) problems.push(`role ${role} has ${power}`);
		}
		if (!row.rolcanlogin) problems.push(`role ${role} cannot log in`);
	}
	for (const { member, role } of facts.memberships) {
		problems.push(
			`role ${member} is a member of ${role}, so it can use that role's rights`,
		);
	}
	for (const { owner, what } of facts.owned) {
		problems.push(`role ${owner} owns ${what}`);
	}
	return problems;
}

type AppTable = Facts["appTables"][number];
type PolicyFact = Facts["policies"][number];

/** A table that is not private holds no user's data, so it has no RLS and no policy. */
function checkOpenTable(
	label: string,
	tableClass: TableClass,
	table: AppTable,
	own: PolicyFact[],
): string[] {
	const problems: string[] = [];
	if (table.rls)
		problems.push(`${label} is ${tableClass} data but has RLS enabled`);
	for (const p of own) {
		problems.push(
			`${label} is ${tableClass} data but has policy ${p.policyname}`,
		);
	}
	return problems;
}

/** The two policies a private table has, word for word, and no others (BR-P2-04). */
function checkPolicies(label: string, own: PolicyFact[]): string[] {
	const problems: string[] = [];
	for (const expected of EXPECTED_POLICIES) {
		const actual = own.find((p) => p.policyname === expected.policyname);
		if (!actual) {
			problems.push(`${label} is missing policy ${expected.policyname}`);
			continue;
		}
		const differs: string[] = (
			["permissive", "cmd", "qual", "with_check"] as const
		).filter((field) => actual[field] !== expected[field]);
		if (actual.roles.join(",") !== expected.roles.join(","))
			differs.unshift("roles");
		if (differs.length > 0) {
			problems.push(
				`${label} policy ${expected.policyname} differs from P2 in: ${differs.join(", ")}`,
			);
		}
	}
	for (const p of own) {
		if (!EXPECTED_POLICIES.some((e) => e.policyname === p.policyname)) {
			problems.push(`${label} has an extra policy ${p.policyname}`);
		}
	}
	return problems;
}

function checkPrivateTable(
	label: string,
	table: AppTable,
	own: PolicyFact[],
): string[] {
	const problems: string[] = [];
	if (!table.hasUserId)
		problems.push(`${label} has no NOT NULL uuid column user_id`);
	if (!table.rls) problems.push(`${label} does not have RLS enabled`);
	if (!table.forced) problems.push(`${label} does not force RLS`);
	return [...problems, ...checkPolicies(label, own)];
}

function checkTablesAndPolicies(facts: Facts): string[] {
	const problems: string[] = [];
	const classes: Record<string, TableClass> = TABLE_CLASSES;
	for (const table of facts.appTables) {
		const tableClass = classes[table.name];
		const label = `app.${table.name}`;
		const own = facts.policies.filter((p) => p.tablename === table.name);
		if (!tableClass) {
			problems.push(
				`${label} is not in TABLE_CLASSES, so its access cannot be checked`,
			);
		} else if (isPrivateClass(tableClass)) {
			problems.push(...checkPrivateTable(label, table, own));
		} else {
			problems.push(...checkOpenTable(label, tableClass, table, own));
		}
	}
	for (const name of Object.keys(classes)) {
		if (!facts.appTables.some((t) => t.name === name)) {
			problems.push(
				`app.${name} is in TABLE_CLASSES but does not exist; run pnpm db:migrate`,
			);
		}
	}
	return problems;
}

function expectedRelationGrants(relation: Facts["relations"][number]): Grants {
	const declared = OTHER_GRANTS[`${relation.schema}.${relation.name}`];
	if (declared) return declared;
	if (relation.kind !== "r" && relation.kind !== "p") return {};
	if (relation.schema === "auth") return AUTH_TABLE_GRANTS;
	const tableClass = (TABLE_CLASSES as Record<string, TableClass>)[relation.name];
	return tableClass ? TABLE_GRANTS[tableClass] : {};
}

function checkGrants(facts: Facts): string[] {
	const problems: string[] = [];

	// Objects in app and auth: each Daybook role's grants must equal the expected ones exactly.
	for (const relation of facts.relations) {
		const label = `${relation.schema}.${relation.name} (${KIND_NAMES[relation.kind] ?? relation.kind})`;
		const expected = expectedRelationGrants(relation);
		for (const role of ROLES) {
			const actual =
				facts.relationGrants.find(
					(g) =>
						g.schema === relation.schema
						&& g.name === relation.name
						&& g.grantee === role,
				)?.privileges ?? [];
			problems.push(...compare(label, role, actual, expected[role] ?? []));
		}
	}
	// Anything else: a Daybook role outside app and auth, or PUBLIC in our schemas.
	for (const grant of facts.relationGrants) {
		const checkedAbove =
			(grant.schema === "app" || grant.schema === "auth")
			&& grant.grantee !== "PUBLIC";
		if (checkedAbove) continue;
		problems.push(
			`${grant.schema}.${grant.name}: ${grant.grantee} has ${grant.privileges.join(", ")}, which it must not`,
		);
	}
	// Column grants would widen a table grant by the back door.
	for (const { what, grantee } of facts.columnGrants) {
		problems.push(
			`column ${what}: ${grantee} has a column grant, which it must not`,
		);
	}
	// Schemas: exactly USAGE where P2 says, nothing anywhere else, nothing for PUBLIC in ours.
	const schemas = new Set([
		...Object.keys(SCHEMA_GRANTS),
		...facts.schemaGrants.map((g) => g.schema),
	]);
	for (const schema of schemas) {
		const expected = SCHEMA_GRANTS[schema] ?? {};
		for (const grantee of [...ROLES, "PUBLIC"]) {
			const actual =
				facts.schemaGrants.find(
					(g) => g.schema === schema && g.grantee === grantee,
				)?.privileges ?? [];
			problems.push(
				...compare(
					`schema ${schema}`,
					grantee,
					actual,
					expected[grantee as Role] ?? [],
				),
			);
		}
	}
	return problems;
}

function checkViewsAndFunctions(facts: Facts): string[] {
	const problems: string[] = [];
	for (const view of facts.views) {
		const invoker = (view.options ?? []).some((o) =>
			/^security_invoker=(true|on|yes|1)$/i.test(o),
		);
		if (!invoker) {
			problems.push(
				`view app.${view.name} lacks security_invoker = true, so it bypasses RLS`,
			);
		}
	}
	const classes: Record<string, TableClass> = TABLE_CLASSES;
	for (const { view, source } of facts.matviewReads) {
		const sourceClass = classes[source];
		if (sourceClass && isPrivateClass(sourceClass)) {
			problems.push(
				`materialized view app.${view} reads private table app.${source}, and ignores RLS`,
			);
		}
	}
	for (const { name } of facts.definerFunctions) {
		problems.push(
			`function app.${name} is SECURITY DEFINER, which bypasses RLS (SEC-5)`,
		);
	}
	return problems;
}

/** Compares the facts with P2; an empty list means the database matches. */
export function checkFacts(facts: Facts): string[] {
	return [
		...checkRoles(facts),
		...checkTablesAndPolicies(facts),
		...checkGrants(facts),
		...checkViewsAndFunctions(facts),
	];
}

/** Returns every problem found; an empty list means the database matches P2. */
export async function verifyDatabase(client: ClientBase): Promise<string[]> {
	return checkFacts(await collectFacts(client));
}

/** Prints the result and returns whether the database passed. */
export function report(problems: readonly string[]): boolean {
	if (problems.length === 0) {
		console.log(
			"Verified: roles, RLS, policies, grants, views and functions match P2.",
		);
		return true;
	}
	console.error(
		`Verification failed with ${problems.length} problem${problems.length === 1 ? "" : "s"}:`,
	);
	for (const problem of problems) console.error(`  - ${problem}`);
	return false;
}

async function main(): Promise<void> {
	const file = loadEnvFile(process.argv.slice(2));
	const env = parseOwnerEnv(process.env);
	const target = new URL(env.DATABASE_URL_OWNER);
	console.log(
		`Verifying ${target.hostname}/${target.pathname.slice(1)}`
			+ (file ? ` (variables from ${file})` : ""),
	);
	const client = new Client({
		connectionString: env.DATABASE_URL_OWNER,
		connectionTimeoutMillis: 10_000,
	});
	await client.connect();
	try {
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
