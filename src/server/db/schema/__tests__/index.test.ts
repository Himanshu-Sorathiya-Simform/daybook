// @vitest-environment node
import { is } from "drizzle-orm";
import { PgTable } from "drizzle-orm/pg-core";
import { expect, test } from "vitest";
import * as schema from "..";

test("ALL_TABLES lists every table the schema exports, once", () => {
	const exported = Object.values(schema as Record<string, unknown>).filter(
		(value) => is(value, PgTable),
	);
	expect(new Set(schema.ALL_TABLES)).toEqual(new Set(exported));
	expect(schema.ALL_TABLES).toHaveLength(exported.length);
});
