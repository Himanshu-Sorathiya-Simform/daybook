import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

import { describe, expect, test } from "vitest";

import { checkWrite, findSecret } from "../guard-files.mjs";

const hookPath = resolve(process.cwd(), ".claude/hooks/guard-files.mjs");

// Built from pieces so this file never contains a secret-shaped string itself.
const stripeKey = ["sk", "live", "Ab3dE6gH9jK2mN5pQ8sT1vW4"].join("_");
const restrictedKey = ["rk", "test", "Ab3dE6gH9jK2mN5pQ8sT1vW4"].join("_");
const webhookSecret = ["whsec", "Q8sT1vW4Ab3dE6gH9jK2mN5p"].join("_");
const githubToken = `ghp_${"Ab3dE6gH9jK2mN5pQ8sT1vW4xY7zC0dF3gH6"}`;
const awsKey = `AKIA${"Z3Y2X1W0V9U8T7S6"}`;
const slackToken = `xoxb-${"1234567890-AbCdEfGhIj"}`;
const privateKey = `-----BEGIN ${"RSA PRIVATE KEY"}-----`;
const databaseUrl = `postgresql://owner:${"npg_Ab3dE6gH9jK2"}@ep-cool.neon.tech/db`;

describe("findSecret", () => {
	test.each([
		[stripeKey, "Stripe secret key"],
		[restrictedKey, "Stripe secret key"],
		[webhookSecret, "Stripe webhook secret"],
		[githubToken, "GitHub token"],
		[awsKey, "AWS access key"],
		[slackToken, "Slack token"],
		[privateKey, "private key"],
		[databaseUrl, "database URL"],
		[`STRIPE_SECRET_KEY=${stripeKey}`, "Stripe secret key"],
	])("finds %#", (text, kind) => {
		expect(findSecret(text)).toContain(kind);
	});

	test.each([
		"sk_test_xxxxxxxxxxxxxxxx",
		"whsec_xxxxxxxxxxxxxxxx",
		"pk_test_Ab3dE6gH9jK2mN5pQ8sT1vW4",
		"postgres://user:password@host/db",
		"postgres://postgres:postgres@localhost:5432/daybook",
		"postgresql://runtime:pw@localhost/test",
		"postgresql://u:${DB_PASSWORD}@host/db",
		"postgresql://u:<password>@host/db",
		"STRIPE_SECRET_KEY=",
		"const key = process.env.STRIPE_SECRET_KEY;",
		"Use a restricted key such as rk_ in test mode.",
		"A normal sentence about money and dates.",
	])("lets %j pass", (text) => {
		expect(findSecret(text)).toBeNull();
	});
});

describe("checkWrite", () => {
	const untracked = () => false;
	const tracked = () => true;

	test("blocks a secret in written content", () => {
		const reason = checkWrite({
			toolName: "Write",
			toolInput: {
				file_path: "/repo/a.ts",
				content: `const k = "${stripeKey}";`,
			},
			isTracked: untracked,
		});

		expect(reason).toContain("Stripe secret key");
		expect(reason).not.toContain(stripeKey);
	});

	test("blocks a secret in an edit's new text", () => {
		const reason = checkWrite({
			toolName: "Edit",
			toolInput: {
				file_path: "/repo/a.ts",
				old_string: "x",
				new_string: githubToken,
			},
			isTracked: untracked,
		});

		expect(reason).toContain("GitHub token");
	});

	test("ignores a secret that is only being removed", () => {
		const reason = checkWrite({
			toolName: "Edit",
			toolInput: {
				file_path: "/repo/a.ts",
				old_string: stripeKey,
				new_string: "",
			},
			isTracked: untracked,
		});

		expect(reason).toBeNull();
	});

	test("blocks changes to a tracked migration", () => {
		const reason = checkWrite({
			toolName: "Edit",
			toolInput: {
				file_path: "/repo/drizzle/0001_init.sql",
				old_string: "a",
				new_string: "b",
			},
			isTracked: tracked,
		});

		expect(reason).toContain("committed migration");
	});

	test("allows a new, untracked migration", () => {
		const reason = checkWrite({
			toolName: "Write",
			toolInput: {
				file_path: "/repo/drizzle/0002_next.sql",
				content: "select 1;",
			},
			isTracked: untracked,
		});

		expect(reason).toBeNull();
	});

	test("allows editing other tracked files", () => {
		const reason = checkWrite({
			toolName: "Edit",
			toolInput: {
				file_path: "/repo/src/a.ts",
				old_string: "a",
				new_string: "b",
			},
			isTracked: tracked,
		});

		expect(reason).toBeNull();
	});
});

describe("hook process", () => {
	const run = (toolName, toolInput) =>
		spawnSync(process.execPath, [hookPath], {
			input: JSON.stringify({ tool_name: toolName, tool_input: toolInput }),
			encoding: "utf8",
		});

	test("exits 0 for a harmless write", () => {
		const result = run("Write", { file_path: "/tmp/a.md", content: "hello" });

		expect(result.status).toBe(0);
	});

	test("exits 2 and explains a secret", () => {
		const result = run("Write", { file_path: "/tmp/a.md", content: stripeKey });

		expect(result.status).toBe(2);
		expect(result.stderr).toContain("Stripe secret key");
	});

	test("exits 2 when the input cannot be read", () => {
		const result = spawnSync(process.execPath, [hookPath], {
			input: "not json",
			encoding: "utf8",
		});

		expect(result.status).toBe(2);
	});
});
