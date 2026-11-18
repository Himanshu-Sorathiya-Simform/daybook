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
				return entry.name === "__tests__" ? [] : sourceFiles(path);
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

describe("0008_subscriptions, the hand-written parts", () => {
	const sql = readFileSync(join(MIGRATIONS, "0008_subscriptions.sql"), "utf8");
	const statements = sql.split("--> statement-breakpoint");
	const statement = (text: string) =>
		statements.findIndex((candidate) => candidate.includes(text));

	// BR-P2-06, D-96: a bare SET NULL would also null user_id, which is NOT NULL.
	test("the charge link nulls only subscription_id when its Subscription is deleted", () => {
		const link = statements.find((candidate) =>
			candidate.includes('"transactions_subscription_fk"'),
		);
		expect(link).toContain('ON DELETE SET NULL ("subscription_id")');
		expect(sql).not.toMatch(/ON DELETE set null ON UPDATE/i);
	});

	// D-598: charges written before the migration get their day as due date, or the check
	// below would refuse the table on a database that holds golden or stress charges.
	test("charges written earlier get their due date before the checks that need it", () => {
		const backfill = statement(
			`SET "due_on" = "occurred_on" WHERE "source" = 'subscription'`,
		);
		expect(backfill).toBeGreaterThan(-1);
		expect(backfill).toBeLessThan(
			statement('ADD CONSTRAINT "transactions_charge_link"'),
		);
		expect(backfill).toBeLessThan(
			statement('ADD CONSTRAINT "transactions_due_on_is_occurred_on"'),
		);
		expect(backfill).toBeGreaterThan(statement('ADD COLUMN "due_on"'));
	});

	test.each(["subscriptions", "subscription_skips"])(
		"%s has RLS enabled and forced, the two policies and the two grants",
		(table) => {
			const own = statements.filter((candidate) =>
				candidate.includes(`"app"."${table}"`),
			);
			const text = own.join("\n");
			expect(text).toContain(
				`ALTER TABLE "app"."${table}" ENABLE ROW LEVEL SECURITY`,
			);
			expect(text).toContain(
				`ALTER TABLE "app"."${table}" FORCE ROW LEVEL SECURITY`,
			);
			expect(text).toContain(
				`CREATE POLICY owner_isolation ON "app"."${table}" FOR ALL TO daybook_runtime`,
			);
			expect(text).toContain(
				`CREATE POLICY system_access ON "app"."${table}" FOR ALL TO daybook_system`,
			);
			expect(text).toContain(
				`GRANT SELECT, INSERT, UPDATE, DELETE ON "app"."${table}" TO daybook_runtime`,
			);
			expect(text).toContain(
				`GRANT SELECT, INSERT, UPDATE, DELETE ON "app"."${table}" TO daybook_system`,
			);
			expect(text).not.toMatch(
				/GRANT ALL|TO PUBLIC|BYPASSRLS|SECURITY DEFINER/i,
			);
		},
	);

	test("every statement is split by a breakpoint, so none runs two statements at once", () => {
		for (const candidate of statements) {
			const code = candidate
				.split("\n")
				.filter((line) => !line.trim().startsWith("--"))
				.join("\n");
			expect(
				code.split(";").filter((part) => part.trim() !== ""),
			).toHaveLength(code.trim() === "" ? 0 : 1);
		}
	});
});
