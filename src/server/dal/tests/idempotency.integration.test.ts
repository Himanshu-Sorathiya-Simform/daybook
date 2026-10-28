import { randomUUIDv7 } from "node:crypto";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { ApiError } from "../../api/errors";
import { createUser, GOLDEN_NOW } from "../../db/tests/private-rows";
import { parseOwnerEnv } from "../../env";
import { claimKey, findAnswer, storeAnswer } from "../idempotency";
import { withUser } from "../with-user";

const NOW = new Date(GOLDEN_NOW);
const HASH = "a".repeat(64);
const OTHER = "b".repeat(64);

let owner: Client;
let userId: string;
let otherId: string;
const as = (id: string) => ({ user: { id, email: "x", name: "x" } });

beforeAll(async () => {
	owner = new Client({
		connectionString: parseOwnerEnv(process.env).DATABASE_URL_OWNER,
	});
	await owner.connect();
	userId = await createUser(owner, "idempotency");
	otherId = await createUser(owner, "idempotency");
});

afterAll(async () => {
	await owner.query(`DELETE FROM auth."user" WHERE id = ANY($1::uuid[])`, [
		[userId, otherId],
	]);
	await owner.end();
});

/** Claims `key` and stores an answer, committed. */
async function stored(
	key: string,
	body: string | null = '{"data":{"b":1,"a":2}}',
	status = 201,
) {
	return withUser(as(userId), "write", async (tx) => {
		const id = await claimKey(tx, { userId, key, hash: HASH, now: NOW });
		return storeAnswer(tx, id!, { status, body }, NOW);
	});
}

describe("findAnswer", () => {
	test("finds nothing for a new key", async () => {
		const answer = await withUser(as(userId), "write", (tx) =>
			findAnswer(tx, randomUUIDv7(), HASH),
		);
		expect(answer).toBeNull();
	});

	test("returns the stored status and body for the same hash", async () => {
		const key = randomUUIDv7();
		const body = await stored(key);
		const answer = await withUser(as(userId), "write", (tx) =>
			findAnswer(tx, key, HASH),
		);
		expect(answer).toEqual({ status: 201, body });
	});

	test("refuses another hash with idempotency_key_reused", async () => {
		const key = randomUUIDv7();
		await stored(key);
		const error = await withUser(as(userId), "write", (tx) =>
			findAnswer(tx, key, OTHER),
		).catch((e: unknown) => e);
		expect(error).toBeInstanceOf(ApiError);
		expect((error as ApiError).code).toBe("idempotency_key_reused");
	});

	test("never sees another user's record (RLS)", async () => {
		const key = randomUUIDv7();
		await stored(key);
		const answer = await withUser(as(otherId), "write", (tx) =>
			findAnswer(tx, key, HASH),
		);
		expect(answer).toBeNull();
	});

	test("returns a stored 204 with no body", async () => {
		const key = randomUUIDv7();
		await stored(key, null, 204);
		const answer = await withUser(as(userId), "write", (tx) =>
			findAnswer(tx, key, HASH),
		);
		expect(answer).toEqual({ status: 204, body: null });
	});
});

describe("claimKey", () => {
	test("returns the new record's id, then null for the same key", async () => {
		const key = randomUUIDv7();
		const first = await withUser(as(userId), "write", (tx) =>
			claimKey(tx, { userId, key, hash: HASH, now: NOW }),
		);
		const second = await withUser(as(userId), "write", (tx) =>
			claimKey(tx, { userId, key, hash: HASH, now: NOW }),
		);
		expect(first).toMatch(/^[0-9a-f-]{36}$/);
		expect(second).toBeNull();
	});

	test("records the request clock as created_at", async () => {
		const key = randomUUIDv7();
		await stored(key);
		const { rows } = await owner.query(
			"SELECT created_at, updated_at FROM app.idempotency_records WHERE key = $1",
			[key],
		);
		expect(rows[0]).toEqual({ created_at: NOW, updated_at: NOW });
	});

	// BR-P2-19
	test("a second claim waits for the first; if the first rolls back, the second wins", async () => {
		const key = randomUUIDv7();
		let releaseFirst!: () => void;
		const firstHolds = new Promise<void>((resolve) => {
			releaseFirst = resolve;
		});
		let claimed!: () => void;
		const firstClaimed = new Promise<void>((resolve) => {
			claimed = resolve;
		});
		const first = withUser(as(userId), "write", async (tx) => {
			await claimKey(tx, { userId, key, hash: HASH, now: NOW });
			claimed();
			await firstHolds;
			throw new Error("the first request fails");
		}).catch(() => "rolled back");
		await firstClaimed;
		let secondDone = false;
		const second = withUser(as(userId), "write", (tx) =>
			claimKey(tx, { userId, key, hash: HASH, now: NOW }),
		).then((id) => {
			secondDone = true;
			return id;
		});
		// The second insert is blocked on the unique index while the first is open.
		await new Promise((resolve) => setTimeout(resolve, 1500));
		expect(secondDone).toBe(false);
		releaseFirst();
		expect(await first).toBe("rolled back");
		expect(await second).toMatch(/^[0-9a-f-]{36}$/);
	});

	// BR-P2-19
	test("if the first commits, the waiting second gets null and finds its answer", async () => {
		const key = randomUUIDv7();
		let releaseFirst!: () => void;
		const firstHolds = new Promise<void>((resolve) => {
			releaseFirst = resolve;
		});
		let claimed!: () => void;
		const firstClaimed = new Promise<void>((resolve) => {
			claimed = resolve;
		});
		const first = withUser(as(userId), "write", async (tx) => {
			const id = await claimKey(tx, { userId, key, hash: HASH, now: NOW });
			claimed();
			await firstHolds;
			await storeAnswer(tx, id!, { status: 201, body: '{"data":1}' }, NOW);
		});
		await firstClaimed;
		const second = withUser(as(userId), "write", async (tx) => {
			const id = await claimKey(tx, { userId, key, hash: HASH, now: NOW });
			return { id, answer: await findAnswer(tx, key, HASH) };
		});
		releaseFirst();
		await first;
		expect(await second).toEqual({
			id: null,
			answer: { status: 201, body: '{"data": 1}' },
		});
	});
});

describe("storeAnswer", () => {
	test("returns the body as Postgres stores it, the text every replay sends", async () => {
		const body = await stored(randomUUIDv7(), '{"data":{"b":1,"a":2}}');
		// jsonb's own text form: keys in its order, one space after each colon and comma.
		expect(body).toBe('{"data": {"a": 2, "b": 1}}');
		expect(JSON.parse(body!)).toEqual({ data: { a: 2, b: 1 } });
	});

	test("stores no body for a 204", async () => {
		expect(await stored(randomUUIDv7(), null, 204)).toBeNull();
	});
});
