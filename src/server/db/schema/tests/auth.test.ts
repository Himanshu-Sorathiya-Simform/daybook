// @vitest-environment node
import { getAuthTables } from "better-auth/db";
import { getTableConfig, type PgTable } from "drizzle-orm/pg-core";
import { describe, expect, test } from "vitest";
import { account, session, user, verification } from "../auth";

// The options Daybook's Better Auth instance will use that change its tables (F01).
const betterAuthTables = getAuthTables({ emailAndPassword: { enabled: true } });

const ours: Record<string, PgTable> = { user, session, account, verification };

describe.each(Object.keys(betterAuthTables))("auth.%s", (model) => {
	const expected = betterAuthTables[model]!;
	const table = ours[model];
	const config = table ? getTableConfig(table) : undefined;
	const columnFor = (field: string) =>
		config?.columns.find((column) => column === (table as never)[field]);

	test("exists in schema auth under Better Auth's model name", () => {
		expect(config?.schema).toBe("auth");
		expect(config?.name).toBe(expected.modelName);
	});

	test("has exactly Better Auth's fields, plus the id", () => {
		const keys = Object.keys(table as object).filter((key) => columnFor(key));
		expect(keys.sort()).toEqual(["id", ...Object.keys(expected.fields)].sort());
	});

	test("has a uuid primary key", () => {
		const id = columnFor("id");
		expect(id?.primary).toBe(true);
		expect(id?.getSQLType()).toBe("uuid");
	});

	test.each(Object.entries(expected.fields))(
		"%s matches Better Auth's type, required and unique flags",
		(field, definition) => {
			const column = columnFor(field);
			expect(column, `column for ${field}`).toBeDefined();
			expect(column!.notNull).toBe(definition.required === true);
			expect(column!.isUnique).toBe(definition.unique === true);
			const sqlType = column!.getSQLType();
			const expectedType = {
				string: field === "userId" ? "uuid" : "text",
				boolean: "boolean",
				date: "timestamp with time zone",
			}[definition.type as string];
			expect(sqlType).toBe(expectedType);
		},
	);

	test("deletes its rows with their user, where Better Auth references the user", () => {
		const references = Object.entries(expected.fields).filter(
			([, d]) => d.references,
		);
		for (const [field, definition] of references) {
			const foreignKey = config!.foreignKeys.find((fk) =>
				fk.reference().columns.includes(columnFor(field)!),
			);
			expect(foreignKey?.onDelete).toBe(definition.references!.onDelete);
			expect(getTableConfig(foreignKey!.reference().foreignTable).name).toBe(
				definition.references!.model,
			);
		}
	});

	test("indexes every field Better Auth indexes", () => {
		const indexed = Object.entries(expected.fields)
			.filter(([, d]) => d.index)
			.map(([field]) => columnFor(field)!.name);
		const ourIndexed = config!.indexes.flatMap((i) =>
			i.config.columns.map((c) => (c as { name: string }).name),
		);
		expect(ourIndexed.sort()).toEqual(indexed.sort());
	});

	test("gives no column a time default, since Better Auth sets every time itself", () => {
		const timeDefaults = config!.columns.filter(
			(c) => c.getSQLType().startsWith("timestamp") && c.hasDefault,
		);
		expect(timeDefaults).toEqual([]);
	});
});

test("Daybook defines no auth table Better Auth does not know", () => {
	expect(Object.keys(ours).sort()).toEqual(Object.keys(betterAuthTables).sort());
});
