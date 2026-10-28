// @vitest-environment node
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import {
	CATEGORY_LABELS,
	EXPENSE_CATEGORIES,
	INCOME_CATEGORIES,
} from "@/lib/categories";
import { CURRENCY_EXPONENTS } from "@/lib/currency";

const MIGRATIONS = "drizzle";

const migrationFiles = readdirSync(MIGRATIONS)
	.filter((name) => name.endsWith(".sql"))
	.sort();
const allSql = migrationFiles
	.map((name) => readFileSync(join(MIGRATIONS, name), "utf8"))
	.join("\n");

/** The value tuples of `INSERT INTO "app"."<table>" (...) VALUES (...), (...);`. */
function insertedRows(table: string): string[][] {
	const statement = new RegExp(
		String.raw`INSERT INTO "app"\."${table}" \([^)]*\) VALUES([\s\S]*?);`,
	).exec(allSql);
	if (!statement) return [];
	return [...statement[1]!.matchAll(/\(([^)]*)\)/g)].map((row) =>
		row[1]!.split(",").map((value) => value.trim().replace(/^'|'$/g, "")),
	);
}

describe("reference rows", () => {
	// MON-2
	test("currencies equal src/lib/currency.ts, code and exponent", () => {
		expect(insertedRows("currencies")).toEqual(
			Object.entries(CURRENCY_EXPONENTS).map(([code, exponent]) => [
				code,
				String(exponent),
			]),
		);
	});

	// CAT-1 to CAT-3
	test("categories equal src/lib/categories.ts: key, kind, label and order", () => {
		const expected = [
			...EXPENSE_CATEGORIES.map((key) => [key, "expense"] as const),
			...INCOME_CATEGORIES.map((key) => [key, "income"] as const),
		].map(([key, kind], index) => [
			key,
			kind,
			CATEGORY_LABELS[key],
			String(index + 1),
		]);
		expect(insertedRows("categories")).toEqual(expected);
	});
});

describe("the database clock (BR-P2-43)", () => {
	// `performance.now()` is exempt: a monotonic timer for durations (Server-Timing), never a
	// date or an instant. `Date.now()` and SQL's `now()` are still caught.
	const CLOCK =
		/\b((?<!performance\.)now\s*\(|current_date\b|current_timestamp\b|localtimestamp\b|transaction_timestamp\s*\(|statement_timestamp\s*\(|clock_timestamp\s*\(|defaultNow\s*\()/i;

	function sourceFiles(dir: string): string[] {
		return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
			const path = join(dir, entry.name);
			if (entry.isDirectory())
				return entry.name === "tests" ? [] : sourceFiles(path);
			return /\.(ts|tsx)$/.test(entry.name) ? [path] : [];
		});
	}

	test("no migration uses the database's own clock", () => {
		const offenders = migrationFiles.filter((name) =>
			CLOCK.test(readFileSync(join(MIGRATIONS, name), "utf8")),
		);
		expect(offenders).toEqual([]);
	});

	test("no server module uses the database's own clock", () => {
		const offenders = sourceFiles("src/server").filter((path) =>
			CLOCK.test(readFileSync(path, "utf8")),
		);
		expect(offenders).toEqual([]);
	});

	test.each([
		"DEFAULT now()",
		"current_date",
		"CURRENT_TIMESTAMP",
		"localtimestamp",
		".defaultNow()",
		"clock_timestamp()",
		"Date.now()",
		"SELECT now ()",
	])("the scan catches %s", (text) => {
		expect(CLOCK.test(text)).toBe(true);
	});

	test.each([
		"nowhere",
		"known()",
		"current_dates_table",
		"acknowledgement",
		"performance.now()",
	])("the scan ignores %s", (text) => {
		expect(CLOCK.test(text)).toBe(false);
	});
});
