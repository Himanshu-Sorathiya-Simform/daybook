// @vitest-environment node
import { is } from "drizzle-orm";
import { getTableConfig, PgTable } from "drizzle-orm/pg-core";
import { describe, expect, test } from "vitest";
import * as schema from "../schema";
import { isPrivateClass, TABLE_CLASSES, type TableClass } from "../table-classes";

const appTables = Object.values(schema as Record<string, unknown>)
	.flatMap((value) => (is(value, PgTable) ? [getTableConfig(value)] : []))
	.filter((config) => config.schema === "app");

describe("TABLE_CLASSES", () => {
	test("classifies every table in schema app, and nothing else", () => {
		expect(Object.keys(TABLE_CLASSES).sort()).toEqual(
			appTables.map((config) => config.name).sort(),
		);
	});

	test.each(appTables.map((config) => [config.name, config] as const))(
		"%s has user_id exactly when its class is private",
		(name, config) => {
			const userId = config.columns.find(
				(column) => column.name === "user_id",
			);
			const tableClass: TableClass =
				TABLE_CLASSES[name as keyof typeof TABLE_CLASSES];
			if (isPrivateClass(tableClass)) {
				expect(userId?.getSQLType()).toBe("uuid");
				expect(userId?.notNull).toBe(true);
			} else {
				expect(userId).toBeUndefined();
			}
		},
	);
});

describe("isPrivateClass", () => {
	test.each([
		["private", true],
		["private_system_written", true],
		["reference", false],
		["system", false],
	] as const)("%s is private: %s", (tableClass, expected) => {
		expect(isPrivateClass(tableClass)).toBe(expected);
	});
});
