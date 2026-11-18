import { sql } from "drizzle-orm";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

import { GOLDEN_NOW } from "../../../../../seed/golden";
import { type LoadedGolden } from "../../../../../seed/load-golden";
import { runtimePool } from "../../../db/pools";
import { parseOwnerEnv } from "../../../env";
import { asUser, goldenContext } from "../../transactions/__tests__/helpers";
import { lockAndRead, lockSubscriptionRow } from "../lock";
import { getSubscriptionItem } from "../read";
import { writeTombstone } from "../tombstone";
import { goldenUser, holdingLock } from "./helpers";
import { withUser } from "../../with-user";

/** `writeTombstone` (BR-F05-07, BR-F05-26; D-607) and the lock helpers a charge delete uses
 * (BR-F03-17, D-605) through the runtime role and RLS. Every case rolls back, except the lock
 * wait, which commits for a user of its own. */

let owner: Client;
let golden: LoadedGolden;
let other: LoadedGolden;
const users: string[] = [];

beforeAll(async () => {
	owner = new Client({
		connectionString: parseOwnerEnv(process.env).DATABASE_URL_OWNER,
	});
	await owner.connect();
	golden = await goldenUser(owner, "tombstone");
	other = await goldenUser(owner, "tombstone-other");
	users.push(golden.userId, other.userId);
});

afterAll(async () => {
	await owner?.query(`DELETE FROM auth."user" WHERE id = ANY($1)`, [users]);
	await owner?.end();
	await runtimePool().end();
});

const ctx = () => goldenContext(golden.userId);
const netflix = () => golden.subscription("netflix");

describe("writeTombstone", () => {
	test("writes the date, raises the version and updatedAt, and leaves lastChangeOn", async () => {
		const { result, statements } = await asUser(golden.userId, async (tx) => {
			const before = await getSubscriptionItem(tx, ctx(), netflix());
			const written = await writeTombstone(tx, ctx(), netflix(), "2026-11-05");
			return {
				before,
				written,
				after: await getSubscriptionItem(tx, ctx(), netflix()),
			};
		});
		expect(result.written).toBe(true);
		expect(result.after?.skips).toEqual(["2026-11-05"]);
		expect(result.after?.version).toBe(result.before!.version + 1);
		expect(result.after?.updatedAt).toBe(new Date(GOLDEN_NOW).toISOString());
		expect(result.after?.lastChangeOn).toBe(result.before!.lastChangeOn);
		// Two reads of the test and the helper's insert and update.
		expect(statements).toBe(4);
	});

	test("a date that already has its tombstone writes nothing and raises nothing", async () => {
		const { result, statements } = await asUser(golden.userId, async (tx) => {
			const before = await getSubscriptionItem(
				tx,
				ctx(),
				golden.subscription("cultGym"),
			);
			const written = await writeTombstone(
				tx,
				ctx(),
				golden.subscription("cultGym"),
				"2026-10-10",
			);
			return {
				before,
				written,
				after: await getSubscriptionItem(
					tx,
					ctx(),
					golden.subscription("cultGym"),
				),
			};
		});
		expect(result.written).toBe(false);
		expect(result.after).toEqual(result.before);
		// Two reads of the test and the helper's insert, which matched nothing.
		expect(statements).toBe(3);
	});

	test("keeps the tombstones in date order, and each carries the user", async () => {
		const { result } = await asUser(golden.userId, async (tx) => {
			await writeTombstone(tx, ctx(), netflix(), "2026-12-05");
			await writeTombstone(tx, ctx(), netflix(), "2026-11-05");
			const { rows } = await tx.execute<{ user: string }>(
				sql`SELECT user_id AS "user" FROM app.subscription_skips
				WHERE subscription_id = ${netflix()}::uuid`,
			);
			return {
				item: await getSubscriptionItem(tx, ctx(), netflix()),
				users: new Set(rows.map((row) => row.user)),
			};
		});
		expect(result.item?.skips).toEqual(["2026-11-05", "2026-12-05"]);
		expect(result.item?.version).toBe(3);
		expect([...result.users]).toEqual([golden.userId]);
	});

	test("never writes under another user's Subscription: the key finds no parent", async () => {
		await expect(
			asUser(golden.userId, (tx) =>
				writeTombstone(
					tx,
					ctx(),
					other.subscription("netflix"),
					"2026-11-05",
				),
			),
		).rejects.toThrow();
		const { rows } = await owner.query(
			"SELECT count(*)::int AS n FROM app.subscription_skips WHERE subscription_id = $1 AND due_on = '2026-11-05'",
			[other.subscription("netflix")],
		);
		expect(rows[0]).toEqual({ n: 0 });
	});
});

describe("lockSubscriptionRow", () => {
	test("is true for the user's Subscription, in one statement", async () => {
		const { result, statements } = await asUser(golden.userId, (tx) =>
			lockSubscriptionRow(tx, netflix()),
		);
		expect(result).toBe(true);
		expect(statements).toBe(1);
	});

	test("is false for an unknown id and for another user's Subscription", async () => {
		const { result } = await asUser(golden.userId, async (tx) => [
			await lockSubscriptionRow(tx, "0199a000-0000-7000-8002-0000000000ff"),
			await lockSubscriptionRow(tx, other.subscription("netflix")),
		]);
		expect(result).toEqual([false, false]);
	});
});

describe("lockAndRead", () => {
	test("answers the Subscription with its charges and tombstones, in two statements", async () => {
		const { result, statements } = await asUser(golden.userId, (tx) =>
			lockAndRead(tx, ctx(), golden.subscription("cultGym")),
		);
		expect(result?.item).toMatchObject({
			id: golden.subscription("cultGym"),
			skips: ["2026-10-10"],
			paidMinor: 150000,
		});
		expect(result?.dated.charged).toEqual(["2026-09-10"]);
		expect(result?.dated.skipped).toEqual(["2026-10-10"]);
		expect(statements).toBe(2);
	});

	test("answers null for an unknown id and for another user's Subscription, reading nothing", async () => {
		const { result, statements } = await asUser(golden.userId, async (tx) => [
			await lockAndRead(tx, ctx(), "0199a000-0000-7000-8002-0000000000ff"),
			await lockAndRead(tx, ctx(), other.subscription("netflix")),
		]);
		expect(result).toEqual([null, null]);
		// Each is only the lock.
		expect(statements).toBe(2);
	});

	// D-605: a read after the lock sees what the writer before it committed.
	test("a read that waits for the lock sees the tombstone the holder committed", async () => {
		const user = await goldenUser(owner, "tombstone-wait");
		users.push(user.userId);
		const wait = goldenContext(user.userId);
		const id = user.subscription("netflix");
		const found = await holdingLock(
			owner,
			user.userId,
			id,
			async (holder) => {
				await holder.query(
					`INSERT INTO app.subscription_skips (id, user_id, created_at, updated_at,
						subscription_id, due_on)
					VALUES (gen_random_uuid(), $1, $3, $3, $2, '2026-11-05')`,
					[user.userId, id, GOLDEN_NOW],
				);
			},
			() =>
				withUser({ user: wait.user }, "write", (tx) =>
					lockAndRead(tx, wait, id),
				),
		);
		expect(found?.dated.skipped).toEqual(["2026-11-05"]);
		expect(found?.item.skips).toEqual(["2026-11-05"]);
	}, 60_000);
});
