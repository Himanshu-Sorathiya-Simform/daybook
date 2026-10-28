import "server-only";
import { and, eq, sql } from "drizzle-orm";
import type { PgColumn, PgTable, PgUpdateSetSource } from "drizzle-orm/pg-core";
import { ApiError } from "../api/errors";
import type { Tx } from "./with-user";

/** A private table whose rows carry `version` (API-4, P2 section 3). */
export type VersionedTable = PgTable & {
	id: PgColumn;
	version: PgColumn;
	updatedAt: PgColumn;
};

type Target = { id: string; version: number };

/** Updates one row only if it still has `version` (BR-P2-21, D-438), raising `version` by one
 * and setting `updated_at` to `now`. It returns the updated row. When no row matches, the row
 * is re-read under RLS: it exists, so 409 `version_conflict` with it in `details.current`; or
 * it does not exist for this user, so 404 `not_found`. */
export async function versionedUpdate<T extends VersionedTable>(
	tx: Tx,
	table: T,
	{ id, version }: Target,
	set: PgUpdateSetSource<T>,
	now: Date,
): Promise<T["$inferSelect"]> {
	const values = { ...set, version: sql`${table.version} + 1`, updatedAt: now };
	const rows = (await tx
		.update(table as PgTable)
		.set(values as PgUpdateSetSource<PgTable>)
		.where(and(eq(table.id, id), eq(table.version, version)))
		.returning()) as T["$inferSelect"][];
	if (rows[0]) return rows[0];
	throw await mismatch(tx, table, id);
}

/** Deletes one row only if it still has `version` (BR-P2-21), with the same 409 and 404. */
export async function versionedDelete<T extends VersionedTable>(
	tx: Tx,
	table: T,
	{ id, version }: Target,
): Promise<void> {
	const rows = await tx
		.delete(table as PgTable)
		.where(and(eq(table.id, id), eq(table.version, version)))
		.returning({ id: table.id });
	if (rows.length === 0) throw await mismatch(tx, table, id);
}

async function mismatch(
	tx: Tx,
	table: VersionedTable,
	id: string,
): Promise<ApiError> {
	const [current] = await tx
		.select()
		.from(table as PgTable)
		.where(eq(table.id, id))
		.limit(1);
	return current ?
			new ApiError("version_conflict", { details: { current } })
		:	new ApiError("not_found");
}
