import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { Client, DatabaseError } from "pg";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { toApiError } from "../../api/errors";
import { runtimePool } from "../../db/pools";
import { idempotencyRecords, profile } from "../../db/schema";
import {
	createUser,
	GOLDEN_NOW,
	insertRow,
	PRIVATE_ROWS,
} from "../../db/tests/private-rows";
import { parseOwnerEnv } from "../../env";
import { type Tx, withUser } from "../with-user";

let owner: Client;
let a: string;
let b: string;

const as = (id: string) => ({
	user: { id, email: `${id}@isolation.test`, name: "Test" },
});

/** The first column of the first row of a raw query inside the transaction. */
async function scalar(tx: Tx, query: ReturnType<typeof sql>): Promise<unknown> {
	const result = await tx.execute(query);
	return Object.values(result.rows[0] ?? {})[0];
}

/** What the transaction throws, or a failure if it succeeds. */
async function failure(promise: Promise<unknown>): Promise<unknown> {
	try {
		await promise;
	} catch (error) {
		return error;
	}
	throw new Error("Expected the transaction to fail");
}

const ownerCount = async (userId: string) =>
	(
		await owner.query<{ n: number }>(
			"SELECT count(*)::int AS n FROM app.idempotency_records WHERE user_id = $1",
			[userId],
		)
	).rows[0]!.n;

beforeAll(async () => {
	owner = new Client({
		connectionString: parseOwnerEnv(process.env).DATABASE_URL_OWNER,
	});
	await owner.connect();
	a = await createUser(owner, "with-user-a");
	b = await createUser(owner, "with-user-b");
	await insertRow(owner, "profile", PRIVATE_ROWS.profile(a));
	await insertRow(owner, "profile", PRIVATE_ROWS.profile(b));
});

afterAll(async () => {
	await owner?.query(`DELETE FROM auth."user" WHERE id = ANY($1)`, [[a, b]]);
	await owner?.end();
	await runtimePool().end();
	delete (globalThis as { __daybookPools?: unknown }).__daybookPools;
});

describe("the transaction it opens (BR-P2-08, BR-P2-09)", () => {
	test("a read is repeatable read and read only", async () => {
		const [isolation, readOnly] = await withUser(as(a), "read", async (tx) => [
			await scalar(tx, sql`SHOW transaction_isolation`),
			await scalar(tx, sql`SHOW transaction_read_only`),
		]);
		expect(isolation).toBe("repeatable read");
		expect(readOnly).toBe("on");
	});

	test("a write is read committed and may write", async () => {
		const [isolation, readOnly] = await withUser(as(a), "write", async (tx) => [
			await scalar(tx, sql`SHOW transaction_isolation`),
			await scalar(tx, sql`SHOW transaction_read_only`),
		]);
		expect(isolation).toBe("read committed");
		expect(readOnly).toBe("off");
	});

	test("a read refuses to write", async () => {
		const error = await failure(
			withUser(as(a), "read", (tx) =>
				tx.insert(idempotencyRecords).values({
					id: randomUUID(),
					userId: a,
					key: randomUUID(),
					requestHash: "b".repeat(64),
					createdAt: new Date(GOLDEN_NOW),
					updatedAt: new Date(GOLDEN_NOW),
				}),
			),
		);
		expect(
			(error as { cause?: DatabaseError }).cause?.code
				?? (error as DatabaseError).code,
		).toBe("25006");
	});

	test("sets the user context to the context's user", async () => {
		expect(
			await withUser(as(a), "read", (tx) =>
				scalar(tx, sql`SELECT current_setting('app.user_id', true)`),
			),
		).toBe(a);
	});

	test("limits each statement to 15 seconds", async () => {
		expect(
			await withUser(as(a), "read", (tx) =>
				scalar(tx, sql`SHOW statement_timeout`),
			),
		).toBe("15s");
	});

	test("runs as the runtime role", async () => {
		expect(
			await withUser(as(a), "read", (tx) =>
				scalar(tx, sql`SELECT current_user`),
			),
		).toBe("daybook_runtime");
	});

	test("shows the user only their own rows", async () => {
		const rows = await withUser(as(a), "read", (tx) =>
			tx.select({ userId: profile.userId }).from(profile),
		);
		expect(rows).toEqual([{ userId: a }]);
	});
});

describe("commit, rollback and release", () => {
	test("commits a write when fn succeeds", async () => {
		const before = await ownerCount(a);
		await withUser(as(a), "write", (tx) =>
			tx.insert(idempotencyRecords).values({
				id: randomUUID(),
				userId: a,
				key: randomUUID(),
				requestHash: "c".repeat(64),
				createdAt: new Date(GOLDEN_NOW),
				updatedAt: new Date(GOLDEN_NOW),
			}),
		);
		expect(await ownerCount(a)).toBe(before + 1);
	});

	test("rolls back everything and rethrows the same error when fn throws", async () => {
		const before = await ownerCount(a);
		const thrown = new Error("handler failed");
		const error = await failure(
			withUser(as(a), "write", async (tx) => {
				await tx.insert(idempotencyRecords).values({
					id: randomUUID(),
					userId: a,
					key: randomUUID(),
					requestHash: "d".repeat(64),
					createdAt: new Date(GOLDEN_NOW),
					updatedAt: new Date(GOLDEN_NOW),
				});
				throw thrown;
			}),
		);
		expect(error).toBe(thrown);
		expect(await ownerCount(a)).toBe(before);
	});

	test("returns what fn returns", async () => {
		expect(await withUser(as(a), "read", async () => ({ answer: 42 }))).toEqual({
			answer: 42,
		});
	});

	test("releases the connection after success and after failure", async () => {
		await withUser(as(a), "read", async () => null);
		await failure(withUser(as(a), "read", () => Promise.reject(new Error("x"))));
		const pool = runtimePool();
		expect(pool.totalCount - pool.idleCount).toBe(0);
		expect(pool.waitingCount).toBe(0);
	});

	test("runs more transactions than the pool has connections, one after another", async () => {
		for (let i = 0; i < 12; i++) await withUser(as(a), "read", async () => null);
		expect(runtimePool().totalCount).toBeLessThanOrEqual(10);
	});
});

describe("the context ends with the transaction", () => {
	// AC-P2-04
	test("after A's transaction fails, the next user's transaction sees only their own rows", async () => {
		await failure(
			withUser(as(a), "read", (tx) => tx.execute(sql`SELECT 1 / 0`)),
		);
		const rows = await withUser(as(b), "read", (tx) =>
			tx.select({ userId: profile.userId }).from(profile),
		);
		expect(rows).toEqual([{ userId: b }]);
	});

	// AC-P2-04
	test("a query on a released connection, outside withUser, sees no private rows", async () => {
		await withUser(as(a), "read", async () => null);
		const client = await runtimePool().connect();
		try {
			expect((await client.query("SELECT 1 FROM app.profile")).rowCount).toBe(
				0,
			);
		} finally {
			client.release();
		}
	});
});

describe("one snapshot per read (BR-P2-09)", () => {
	// AC-P2-13
	test("two queries in one read see the same rows while another transaction commits between them", async () => {
		const [first, second] = await withUser(as(a), "read", async (tx) => {
			const count = () =>
				scalar(tx, sql`SELECT count(*)::int FROM app.idempotency_records`);
			const firstCount = await count();
			await insertRow(
				owner,
				"idempotency_records",
				PRIVATE_ROWS.idempotency_records(a),
			);
			return [firstCount, await count()];
		});
		expect(second).toBe(first);
		const after = await withUser(as(a), "read", (tx) =>
			scalar(tx, sql`SELECT count(*)::int FROM app.idempotency_records`),
		);
		expect(after).toBe((first as number) + 1);
	});
});

describe("Postgres errors map to the API's codes (BR-P2-24)", () => {
	test("a statement past its time limit becomes timeout", async () => {
		const error = await failure(
			withUser(as(a), "read", async (tx) => {
				await tx.execute(sql`SET LOCAL statement_timeout = '50ms'`);
				await tx.execute(sql`SELECT pg_sleep(1)`);
			}),
		);
		expect(toApiError(error).code).toBe("timeout");
	});

	test("a second profile for one user becomes validation_failed on userId", async () => {
		const error = await failure(
			withUser(as(a), "write", (tx) =>
				tx.insert(profile).values({
					id: randomUUID(),
					userId: a,
					country: "IN",
					currency: "INR",
					timezone: "Asia/Kolkata",
					weekStart: "monday",
					lastCatchUpOn: "2026-11-01",
					createdAt: new Date(GOLDEN_NOW),
					updatedAt: new Date(GOLDEN_NOW),
				}),
			),
		);
		const apiError = toApiError(error);
		expect(apiError.code).toBe("validation_failed");
		expect(apiError.fields).toEqual({ userId: "This is already in use." });
	});

	test("a value a check refuses becomes validation_failed", async () => {
		const error = await failure(
			withUser(as(a), "write", (tx) =>
				tx
					.update(profile)
					.set({ weekStart: "friday" as "monday" })
					.where(sql`true`),
			),
		);
		expect(toApiError(error).code).toBe("validation_failed");
	});

	test("a currency that does not exist becomes parent_missing", async () => {
		const error = await failure(
			withUser(as(a), "write", (tx) =>
				tx
					.update(profile)
					.set({ currency: "XXX" })
					.where(sql`true`),
			),
		);
		expect(toApiError(error).code).toBe("parent_missing");
	});

	test("a row written for another user becomes not_found, flagged as a security event", async () => {
		const error = await failure(
			withUser(as(a), "write", (tx) =>
				tx.insert(idempotencyRecords).values({
					id: randomUUID(),
					userId: b,
					key: randomUUID(),
					requestHash: "e".repeat(64),
					createdAt: new Date(GOLDEN_NOW),
					updatedAt: new Date(GOLDEN_NOW),
				}),
			),
		);
		const apiError = toApiError(error);
		expect(apiError.code).toBe("not_found");
		expect(apiError.securityEvent).toBe(true);
	});

	test("a missing required value becomes validation_failed on its column", async () => {
		const error = await failure(
			withUser(as(a), "write", (tx) =>
				tx.execute(sql`UPDATE app.profile SET country = NULL`),
			),
		);
		expect(toApiError(error).fields).toEqual({ country: "Required" });
	});

	test("deleting a currency a profile uses becomes has_dependents", async () => {
		// Only the owner may delete reference data; the mapping is the same for any role.
		const error = await failure(
			(async () => {
				await owner.query("BEGIN");
				try {
					await owner.query(
						"DELETE FROM app.currencies WHERE code = 'INR'",
					);
				} finally {
					await owner.query("ROLLBACK");
				}
			})(),
		);
		expect(toApiError(error).code).toBe("has_dependents");
	});
});
