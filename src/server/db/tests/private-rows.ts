import { randomUUID } from "node:crypto";
import type { ClientBase } from "pg";
import { type AppTable, isPrivateClass, TABLE_CLASSES } from "../table-classes";

/** Every private table in `TABLE_CLASSES`, as a type. Adding a private table there breaks
 * the typecheck of `PRIVATE_ROWS` below until it has a row factory, so the isolation suite
 * always covers every private table. */
export type PrivateTable = {
	[K in AppTable]: (typeof TABLE_CLASSES)[K] extends (
		"private" | "private_system_written"
	) ?
		K
	:	never;
}[AppTable];

export const PRIVATE_TABLES = (Object.keys(TABLE_CLASSES) as AppTable[]).filter(
	(table): table is PrivateTable => isPrivateClass(TABLE_CLASSES[table]),
);

/** The golden clock (TST-3): 2026-11-02T12:00:00+05:30. */
export const GOLDEN_NOW = "2026-11-02T06:30:00.000Z";

type Row = Record<string, string | number | null>;

/** A valid row of each private table for one user. Ids are fresh, so rows never collide. */
export const PRIVATE_ROWS: { [K in PrivateTable]: (userId: string) => Row } = {
	profile: (userId) => ({
		id: randomUUID(),
		user_id: userId,
		created_at: GOLDEN_NOW,
		updated_at: GOLDEN_NOW,
		country: "IN",
		currency: "INR",
		timezone: "Asia/Kolkata",
		week_start: "monday",
		last_catch_up_on: "2026-11-01",
		version: 1,
	}),
	idempotency_records: (userId) => ({
		id: randomUUID(),
		user_id: userId,
		created_at: GOLDEN_NOW,
		updated_at: GOLDEN_NOW,
		key: randomUUID(),
		request_hash: "a".repeat(64),
	}),
};

/** Inserts one row into `app.<table>`. Table and column names come from this file only. */
export async function insertRow(client: ClientBase, table: PrivateTable, row: Row) {
	const columns = Object.keys(row);
	const placeholders = columns.map((_, i) => `$${i + 1}`);
	return client.query(
		`INSERT INTO app.${table} (${columns.join(", ")}) VALUES (${placeholders.join(", ")})`,
		Object.values(row),
	);
}

/** Creates a user in `auth.user` as the owner would, and returns its id. */
export async function createUser(owner: ClientBase, label: string): Promise<string> {
	const id = randomUUID();
	await owner.query(
		`INSERT INTO auth."user" (id, name, email, email_verified, created_at, updated_at)
		 VALUES ($1, $2, $3, false, $4, $4)`,
		[id, label, `${label}-${id}@isolation.test`, GOLDEN_NOW],
	);
	return id;
}
