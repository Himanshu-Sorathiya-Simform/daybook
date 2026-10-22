import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { describe, expect, test } from "vitest";

import { findProjectRoot, formatFile, shouldFormat } from "../format-file.mjs";

describe("shouldFormat", () => {
	test.each([
		"/repo/src/a.ts",
		"/repo/src/a.tsx",
		"/repo/scripts/a.mjs",
		"/repo/docs/a.md",
		"/repo/.claude/settings.json",
		"/repo/app/globals.css",
		"/repo/.github/workflows/ci.yml",
	])("formats %s", (file) => {
		expect(shouldFormat(file)).toBe(true);
	});

	test.each([
		"relative/a.ts",
		"/repo/node_modules/x/index.js",
		"/repo/.next/server/a.js",
		"/repo/public/logo.png",
		"/repo/README",
	])("skips %s", (file) => {
		expect(shouldFormat(file)).toBe(false);
	});
});

describe("findProjectRoot", () => {
	test("finds the folder holding package.json", () => {
		const file = resolve(process.cwd(), ".claude/settings.json");

		expect(findProjectRoot(file)).toBe(process.cwd());
	});

	test("returns null when no package.json is above the file", () => {
		const folder = mkdtempSync(join(tmpdir(), "format-hook-"));

		try {
			expect(findProjectRoot(join(folder, "a.ts"))).toBeNull();
		} finally {
			rmSync(folder, { recursive: true });
		}
	});
});

describe("formatFile", () => {
	test("skips a file that is not formattable", () => {
		expect(formatFile("/repo/public/logo.png")).toEqual({ status: "skipped" });
	});

	test("skips a file that does not exist", () => {
		expect(formatFile("/nonexistent/a.ts")).toEqual({ status: "skipped" });
	});

	test("skips a file outside any project with Prettier", () => {
		const folder = mkdtempSync(join(tmpdir(), "format-hook-"));
		const file = join(folder, "a.ts");

		try {
			writeFileSync(file, "const   a=1");

			expect(formatFile(file)).toEqual({ status: "skipped" });
		} finally {
			rmSync(folder, { recursive: true });
		}
	});
});
