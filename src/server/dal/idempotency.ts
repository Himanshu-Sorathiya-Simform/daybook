import "server-only";
import { randomUUIDv7 } from "node:crypto";
import { sql } from "drizzle-orm";
import { ApiError } from "../api/errors";
import { idempotencyRecords } from "../db/schema";
import type { Tx } from "./with-user";

/** A stored answer: its status and its body text (`null` for a 204). */
export type StoredAnswer = { status: number; body: string | null };

/** The stored answer for `key`, read inside the request's transaction, where RLS limits it to
 * the user (BR-P2-18). The same hash returns it; another hash is 422 `idempotency_key_reused`;
 * no record is `null`. Only committed records are visible, and every committed record holds
 * its answer, since the answer is stored before the commit. */
export async function findAnswer(
	tx: Tx,
	key: string,
	hash: string,
): Promise<StoredAnswer | null> {
	const result = await tx.execute<{
		request_hash: string;
		status_code: number | null;
		body: string | null;
	}>(
		sql`SELECT request_hash, status_code, response_body::text AS body
			FROM app.idempotency_records WHERE key = ${key}`,
	);
	const record = result.rows[0];
	if (!record) return null;
	if (record.request_hash !== hash) throw new ApiError("idempotency_key_reused");
	if (record.status_code === null) throw new ApiError("internal");
	return { status: record.status_code, body: record.body };
}

/** Claims `key` for this request (BR-P2-18, step 14): inserts the record and returns its id,
 * or returns `null` when the key exists. A second request with the same key waits here on the
 * unique index until the first commits or rolls back (BR-P2-19). */
export async function claimKey(
	tx: Tx,
	{
		userId,
		key,
		hash,
		now,
	}: { userId: string; key: string; hash: string; now: Date },
): Promise<string | null> {
	const [row] = await tx
		.insert(idempotencyRecords)
		.values({
			id: randomUUIDv7(),
			userId,
			key,
			requestHash: hash,
			createdAt: now,
			updatedAt: now,
		})
		.onConflictDoNothing({
			target: [idempotencyRecords.userId, idempotencyRecords.key],
		})
		.returning({ id: idempotencyRecords.id });
	return row?.id ?? null;
}

/** Stores the handler's answer in the record, in the handler's transaction, so the effect
 * and the record commit together (BR-P2-18). Returns the body as Postgres stores it, which is
 * what this response sends too, so every replay is byte for byte the same (root API-11). */
export async function storeAnswer(
	tx: Tx,
	id: string,
	{ status, body }: StoredAnswer,
	now: Date,
): Promise<string | null> {
	const result = await tx.execute<{ body: string | null }>(
		sql`UPDATE app.idempotency_records
			SET status_code = ${status}, response_body = ${body}::jsonb, updated_at = ${now.toISOString()}
			WHERE id = ${id}
			RETURNING response_body::text AS body`,
	);
	return result.rows[0]!.body;
}
