// @vitest-environment node
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { envFileFromArgs, loadEnvFile } from "../env-file";

describe("envFileFromArgs", () => {
	test("defaults to .env when no --env is given", () => {
		expect(envFileFromArgs([])).toEqual({ path: ".env", explicit: false });
	});

	test("ignores other arguments", () => {
		expect(envFileFromArgs(["--verbose", "x"])).toEqual({
			path: ".env",
			explicit: false,
		});
	});

	test("reads --env followed by a file", () => {
		expect(envFileFromArgs(["--env", ".env.test"])).toEqual({
			path: ".env.test",
			explicit: true,
		});
	});

	test("reads --env=file", () => {
		expect(envFileFromArgs(["--env=.env.test"])).toEqual({
			path: ".env.test",
			explicit: true,
		});
	});

	test("finds --env after other arguments", () => {
		expect(envFileFromArgs(["--verbose", "--env", ".env.test"]).path).toBe(
			".env.test",
		);
	});

	test.each([
		["--env with nothing after it", ["--env"]],
		["--env followed by another flag", ["--env", "--verbose"]],
		["an empty --env=", ["--env="]],
	])("refuses %s", (_label, args) => {
		expect(() => envFileFromArgs(args)).toThrow("--env needs a file");
	});
});

describe("loadEnvFile", () => {
	let dir: string;
	let cwd: string;

	beforeEach(() => {
		dir = mkdtempSync(join(tmpdir(), "daybook-env-"));
		cwd = process.cwd();
		process.chdir(dir);
	});

	afterEach(() => {
		process.chdir(cwd);
		rmSync(dir, { recursive: true, force: true });
		vi.unstubAllEnvs();
	});

	test("loads .env by default and returns its path", () => {
		writeFileSync(join(dir, ".env"), "DAYBOOK_TEST_A=from-dot-env\n");
		vi.stubEnv("DAYBOOK_TEST_A", undefined);
		expect(loadEnvFile([])).toBe(".env");
		expect(process.env["DAYBOOK_TEST_A"]).toBe("from-dot-env");
	});

	test("loads the file named with --env instead of .env", () => {
		writeFileSync(join(dir, ".env"), "DAYBOOK_TEST_A=main\n");
		writeFileSync(join(dir, ".env.test"), "DAYBOOK_TEST_A=test-branch\n");
		vi.stubEnv("DAYBOOK_TEST_A", undefined);
		expect(loadEnvFile(["--env", ".env.test"])).toBe(".env.test");
		expect(process.env["DAYBOOK_TEST_A"]).toBe("test-branch");
	});

	test("returns null and loads nothing when .env is absent and none was named, as in CI", () => {
		expect(loadEnvFile([])).toBeNull();
	});

	test("throws when the named file is missing, instead of falling back to .env", () => {
		writeFileSync(join(dir, ".env"), "DAYBOOK_TEST_A=main\n");
		vi.stubEnv("DAYBOOK_TEST_A", undefined);
		expect(() => loadEnvFile(["--env", ".env.tset"])).toThrow(
			"The env file .env.tset does not exist",
		);
		expect(process.env["DAYBOOK_TEST_A"]).toBeUndefined();
	});

	test("keeps a variable already set in the environment over the file's value", () => {
		writeFileSync(join(dir, ".env"), "DAYBOOK_TEST_A=from-file\n");
		vi.stubEnv("DAYBOOK_TEST_A", "from-environment");
		loadEnvFile([]);
		expect(process.env["DAYBOOK_TEST_A"]).toBe("from-environment");
	});
});
