// @vitest-environment node
import { describe, expect, test } from "vitest";
import { parseServerEnv } from "../../../src/server/env";
import { staticProblems, type Slot } from "../check-connections";

// Placeholder values only; none of these is a real credential.
const neon = (user: string, password: string, host: string) =>
	`postgresql://${user}:${password}@${host}/neondb?sslmode=verify-full`;

const POOLED = "ep-test-1-pooler.c-14.us-east-1.aws.neon.tech";
const DIRECT = "ep-test-1.c-14.us-east-1.aws.neon.tech";

const source = {
	APP_ORIGIN: "http://localhost:3000",
	BETTER_AUTH_SECRET: "x".repeat(32),
	DATABASE_URL_AUTH: neon("daybook_auth", "pa", POOLED),
	DATABASE_URL_RUNTIME: neon("daybook_runtime", "pr", POOLED),
	DATABASE_URL_SYSTEM: neon("daybook_system", "ps", POOLED),
	DATABASE_URL_OWNER: neon("neondb_owner", "po", DIRECT),
	DB_PASSWORD_AUTH: "pa",
	DB_PASSWORD_RUNTIME: "pr",
	DB_PASSWORD_SYSTEM: "ps",
};

const runtime: Slot = {
	url: "DATABASE_URL_RUNTIME",
	password: "DB_PASSWORD_RUNTIME",
	role: "daybook_runtime",
};

const problemsFor = (overrides: Record<string, string | undefined>) => {
	const merged = { ...source, ...overrides };
	return staticProblems(runtime, parseServerEnv(merged), merged);
};

describe("staticProblems", () => {
	test("finds nothing when the password matches and the host is the branch's pooler", () => {
		expect(problemsFor({})).toEqual([]);
	});

	test("reports a URL whose password differs from its DB_PASSWORD_ variable", () => {
		expect(problemsFor({ DB_PASSWORD_RUNTIME: "other" })).toEqual([
			"its password differs from DB_PASSWORD_RUNTIME",
		]);
	});

	test("compares the decoded password, so a percent-encoded URL still matches", () => {
		expect(
			problemsFor({
				DATABASE_URL_RUNTIME: neon("daybook_runtime", "a%2Fb", POOLED),
				DB_PASSWORD_RUNTIME: "a/b",
			}),
		).toEqual([]);
	});

	test("reports the direct endpoint used instead of the pooled one", () => {
		expect(
			problemsFor({
				DATABASE_URL_RUNTIME: neon("daybook_runtime", "pr", DIRECT),
			}),
		).toEqual([
			"its host is not the pooled endpoint of DATABASE_URL_OWNER's branch",
		]);
	});

	test("reports another branch's pooler, such as main's URL left in .env.test", () => {
		expect(
			problemsFor({
				DATABASE_URL_RUNTIME: neon(
					"daybook_runtime",
					"pr",
					"ep-main-9-pooler.c-14.us-east-1.aws.neon.tech",
				),
			}),
		).toEqual([
			"its host is not the pooled endpoint of DATABASE_URL_OWNER's branch",
		]);
	});

	test("reports both problems at once", () => {
		expect(
			problemsFor({
				DATABASE_URL_RUNTIME: neon("daybook_runtime", "wrong", DIRECT),
			}),
		).toHaveLength(2);
	});

	test("skips the password check when the passwords are not in the environment, as in a deployment", () => {
		expect(problemsFor({ DB_PASSWORD_RUNTIME: undefined })).toEqual([]);
	});

	test("skips the host check when the owner URL is not in the environment", () => {
		expect(
			problemsFor({
				DATABASE_URL_OWNER: undefined,
				DATABASE_URL_RUNTIME: neon("daybook_runtime", "pr", DIRECT),
			}),
		).toEqual([]);
	});

	test("skips the host check for a Postgres that is not Neon, such as CI's", () => {
		expect(
			problemsFor({
				DATABASE_URL_OWNER:
					"postgresql://postgres:po@localhost:5432/daybook",
				DATABASE_URL_RUNTIME:
					"postgresql://daybook_runtime:pr@localhost:5432/daybook",
			}),
		).toEqual([]);
	});

	test("skips the host check when the owner URL does not parse", () => {
		expect(problemsFor({ DATABASE_URL_OWNER: "not a url" })).toEqual([]);
	});
});
