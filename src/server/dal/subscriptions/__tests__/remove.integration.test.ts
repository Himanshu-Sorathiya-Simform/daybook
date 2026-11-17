import { sql } from "drizzle-orm";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

import { GOLDEN_NOW } from "../../../../../seed/golden";
import { insertProfile, type LoadedGolden } from "../../../../../seed/load-golden";
import { createUser } from "../../../db/__tests__/private-rows";
import { runtimePool } from "../../../db/pools";
import { parseOwnerEnv } from "../../../env";
import { refusal } from "../../budgets/__tests__/helpers";
import type { ProfiledContext } from "../../context";
import {
	asUser,
	goldenContext,
	uuidV7At,
} from "../../transactions/__tests__/helpers";
import { type Tx, withUser } from "../../with-user";
import { changeSubscription } from "../change";
import { createSubscription } from "../create";
import { deleteSubscription } from "../remove";
import { getSubscriptionItem } from "../read";
import {
	addSubscription,
	charges,
	dueOns,
	goldenUser,
	holdingLock,
	laterCharge,
	on,
	skipsOf,
	tombstone,
	when,
} from "./helpers";

/** `DELETE /api/subscriptions/[id]` (F05 section 11, BR-F05-14, BR-F05-34, D-589, D-590)
 * through the runtime role and RLS. Every scenario runs in a rolled-back transaction as one
 * profile user, except the lock scenarios, which commit. Expected figures come from F05
 * sections 5 and 14 and the golden dataset. */

let owner: Client;
let golden: LoadedGolden;
let neighbour: LoadedGolden;
let custom: string;
const users: string[] = [];

beforeAll(async () => {
	owner = new Client({
		connectionString: parseOwnerEnv(process.env).DATABASE_URL_OWNER,
	});
	await owner.connect();
	golden = await goldenUser(owner, "sub-remove");
	neighbour = await goldenUser(owner, "sub-remove-neighbour");
	custom = await createUser(owner, "sub-remove-custom");
	await insertProfile(owner, custom);
	users.push(golden.userId, neighbour.userId, custom);
}, 60_000);

afterAll(async () => {
	await owner?.query(`DELETE FROM auth."user" WHERE id = ANY($1)`, [users]);
	await owner?.end();
	await runtimePool().end();
});

const netflix = () => golden.subscription("netflix");
const cultGym = () => golden.subscription("cultGym");

/** A delete as the client sends it, with `changedAt` at the golden clock unless the body says. */
const remove = (
	tx: Tx,
	ctx: ProfiledContext,
	id: string,
	version: number,
	body: Record<string, unknown> = {},
) => deleteSubscription(tx, ctx, id, version, { changedAt: GOLDEN_NOW, ...body });

/** Every charge of the user that source `subscription` made, with its link. */
const allCharges = async (tx: Tx) =>
	(
		await tx.execute<{
			dueOn: string;
			subscriptionId: string | null;
			source: string;
			edited: boolean;
			payee: string;
		}>(
			sql`SELECT due_on::text AS "dueOn", subscription_id AS "subscriptionId", source, edited,
				payee
			FROM app.transactions WHERE source = 'subscription' ORDER BY due_on, payee`,
		)
	).rows;

/** The Out for charges in October 2026 (golden check E), in the minor unit. */
const octoberCharges = async (tx: Tx) =>
	Number(
		(
			await tx.execute<{ total: string }>(
				sql`SELECT coalesce(sum(amount_minor), 0)::text AS total FROM app.transactions
				WHERE source = 'subscription' AND occurred_on BETWEEN '2026-10-01' AND '2026-10-31'`,
			)
		).rows[0]?.total,
	);

describe("the checks before a delete (section 11 order)", () => {
	test("an id that is not a UUID is 404 before any statement", async () => {
		const { result, statements } = await asUser(golden.userId, (tx) =>
			refusal(remove(tx, goldenContext(golden.userId), "nope", 1)),
		);
		expect(result.code).toBe("not_found");
		expect(statements).toBe(0);
	});

	test("a body that breaks the schema is 422 before any statement", async () => {
		const bodies: Record<string, unknown>[] = [
			{},
			{ changedAt: "yesterday" },
			{ changedAt: GOLDEN_NOW, undo: "delete" },
			{ changedAt: GOLDEN_NOW, undo: true },
			{ changedAt: GOLDEN_NOW, force: true },
		];
		for (const body of bodies) {
			const { result, statements } = await asUser(golden.userId, (tx) =>
				refusal(
					deleteSubscription(
						tx,
						goldenContext(golden.userId),
						netflix(),
						1,
						body,
					),
				),
			);
			expect(result.code).toBe("validation_failed");
			expect(statements).toBe(0);
		}
	});

	test("a changedAt 91 days old, or more than 5 minutes ahead, is 422 on changedAt", async () => {
		const ctx = goldenContext(golden.userId);
		const old = new Date(ctx.now.getTime() - 91 * 86_400_000).toISOString();
		const ahead = new Date(ctx.now.getTime() + 5 * 60_000 + 1000).toISOString();
		const { result } = await asUser(golden.userId, async (tx) => ({
			old: await refusal(remove(tx, ctx, netflix(), 1, { changedAt: old })),
			ahead: await refusal(
				remove(tx, ctx, netflix(), 1, { changedAt: ahead }),
			),
			item: await getSubscriptionItem(tx, ctx, netflix()),
		}));
		expect(result.old.fields).toHaveProperty("changedAt");
		expect(result.ahead.fields).toHaveProperty("changedAt");
		expect(result.item).not.toBeNull();
	});

	test("a Subscription that does not exist is 404, and so is another user's", async () => {
		const { result } = await asUser(golden.userId, async (tx) => ({
			none: await refusal(
				remove(tx, goldenContext(golden.userId), uuidV7At(GOLDEN_NOW), 1),
			),
			theirs: await refusal(
				remove(
					tx,
					goldenContext(golden.userId),
					neighbour.subscription("netflix"),
					1,
				),
			),
		}));
		expect(result.none.code).toBe("not_found");
		expect(result.theirs.code).toBe("not_found");
	});

	test("a stale version is 409 with the Subscription and currency in details.current, and nothing is deleted", async () => {
		const ctx = goldenContext(golden.userId);
		const { result } = await asUser(golden.userId, async (tx) => ({
			refused: await refusal(remove(tx, ctx, netflix(), 5)),
			item: await getSubscriptionItem(tx, ctx, netflix()),
			rows: await dueOns(tx, netflix()),
		}));
		expect(result.refused.code).toBe("version_conflict");
		expect(result.refused.details).toMatchObject({
			current: { id: netflix(), version: 1, currency: "INR", chargeCount: 2 },
		});
		expect(result.item).not.toBeNull();
		expect(result.rows).toEqual(["2026-09-05", "2026-10-05"]);
	});
});

describe("a delete (BR-F05-14)", () => {
	// AC-F05-08.
	test("deleting Netflix keeps #5 and #16 as expenses with no link, source subscription, and check E still totals 20,148.00", async () => {
		const ctx = goldenContext(golden.userId);
		const { result } = await asUser(golden.userId, async (tx) => {
			const before = await octoberCharges(tx);
			const answer = await remove(tx, ctx, netflix(), 1);
			return {
				before,
				answer,
				after: await octoberCharges(tx),
				kept: await allCharges(tx),
				item: await getSubscriptionItem(tx, ctx, netflix()),
			};
		});
		expect(result.before).toBe(2014800);
		expect(result.after).toBe(2014800);
		expect(result.answer).toEqual({
			changeDate: "2026-11-02",
			chargesCreated: 0,
			chargesKept: 2,
			chargesDeleted: 0,
			months: [],
		});
		expect(result.item).toBeNull();
		const netflixRows = result.kept.filter((row) => row.payee === "Netflix");
		expect(netflixRows).toEqual([
			{
				dueOn: "2026-09-05",
				subscriptionId: null,
				source: "subscription",
				edited: false,
				payee: "Netflix",
			},
			{
				dueOn: "2026-10-05",
				subscriptionId: null,
				source: "subscription",
				edited: false,
				payee: "Netflix",
			},
		]);
	});

	test("the other Subscriptions and their charges are untouched", async () => {
		const ctx = goldenContext(golden.userId);
		const { result } = await asUser(golden.userId, async (tx) => {
			await remove(tx, ctx, netflix(), 1);
			return {
				gym: await charges(tx, cultGym()),
				skips: await skipsOf(tx, cultGym()),
				items: await getSubscriptionItem(tx, ctx, cultGym()),
			};
		});
		expect(result.gym).toHaveLength(1);
		expect(result.skips).toEqual(["2026-10-10"]);
		expect(result.items?.chargeCount).toBe(1);
	});

	test("its tombstones go with it", async () => {
		const ctx = goldenContext(golden.userId);
		const { result } = await asUser(golden.userId, async (tx) => {
			await remove(tx, ctx, cultGym(), 1);
			return (
				await tx.execute<{ n: string }>(
					sql`SELECT count(*)::text AS n FROM app.subscription_skips`,
				)
			).rows[0]?.n;
		});
		expect(result).toBe("0");
	});

	test("the Subscription is gone: a second delete is 404", async () => {
		const ctx = goldenContext(golden.userId);
		const { result } = await asUser(golden.userId, async (tx) => {
			await remove(tx, ctx, netflix(), 1);
			return refusal(remove(tx, ctx, netflix(), 1));
		});
		expect(result.code).toBe("not_found");
	});

	test("a Subscription with no charges deletes with nothing kept", async () => {
		const upcoming = await addSubscription(owner, custom, {
			startDate: "2026-12-05",
			chargesFrom: "2026-12-05",
			lastChangeOn: "2026-11-02",
		});
		const { result } = await asUser(custom, (tx) =>
			remove(tx, goldenContext(custom), upcoming.id, 1),
		);
		expect(result).toMatchObject({
			chargesKept: 0,
			chargesDeleted: 0,
			chargesCreated: 0,
		});
	});

	test("a delete at a later version works: the version only has to match", async () => {
		const ctx = goldenContext(golden.userId);
		const { result } = await asUser(golden.userId, async (tx) => {
			const changed = await changeSubscription(tx, ctx, netflix(), 1, {
				changedAt: GOLDEN_NOW,
				note: "x",
			});
			return remove(tx, ctx, netflix(), changed.version);
		});
		expect(result.chargesKept).toBe(2);
	});

	// AC-F05-08: a C before an existing unedited charge's due date deletes it.
	test("an unedited charge due after C is deleted, and an edited one stays, unlinked", async () => {
		const ctx = goldenContext(golden.userId);
		const { result } = await asUser(golden.userId, async (tx) => {
			await laterCharge(tx, golden.userId, netflix(), "2026-11-05");
			await laterCharge(tx, golden.userId, netflix(), "2026-12-05", {
				edited: true,
			});
			const answer = await remove(tx, ctx, netflix(), 1);
			return { answer, kept: await allCharges(tx) };
		});
		expect(result.answer).toMatchObject({
			chargesDeleted: 1,
			chargesKept: 3,
			months: ["2026-11"],
		});
		const netflixRows = result.kept.filter((row) => row.payee === "Netflix");
		expect(
			netflixRows.map((row) => [row.dueOn, row.subscriptionId, row.edited]),
		).toEqual([
			["2026-09-05", null, false],
			["2026-10-05", null, false],
			["2026-12-05", null, true],
		]);
	});

	test("a charge due on C itself is kept: the change date belongs to the Subscription's last charges", async () => {
		const ctx = on(golden.userId, "2026-11-05");
		const { result } = await asUser(golden.userId, async (tx) => {
			await laterCharge(tx, golden.userId, netflix(), "2026-11-05");
			return remove(tx, ctx, netflix(), 1, { changedAt: when("2026-11-05") });
		});
		expect(result).toMatchObject({ chargesDeleted: 0, chargesKept: 3 });
	});

	test("charges that a late delete would have been made after are deleted: C is the change date, not today", async () => {
		const ctx = on(golden.userId, "2026-11-20");
		const { result } = await asUser(golden.userId, async (tx) => {
			await laterCharge(tx, golden.userId, netflix(), "2026-11-05");
			return remove(tx, ctx, netflix(), 1, { changedAt: when("2026-11-02") });
		});
		expect(result).toMatchObject({
			changeDate: "2026-11-02",
			chargesDeleted: 1,
			chargesKept: 2,
		});
	});

	test("it closes the old period first: the charges missing through C are created, then kept as expenses", async () => {
		const missing = await goldenUser(owner, "sub-remove-step2", {
			beforeCatchUp: true,
		});
		users.push(missing.userId);
		const ctx = goldenContext(missing.userId);
		const { result } = await asUser(missing.userId, async (tx) => {
			const answer = await remove(tx, ctx, missing.subscription("sunrise"), 1);
			return { answer, kept: await allCharges(tx) };
		});
		expect(result.answer).toMatchObject({
			chargesCreated: 1,
			chargesKept: 3,
			chargesDeleted: 0,
			months: ["2026-11"],
		});
		const rows = result.kept.filter((row) => row.payee === "Sunrise Apartments");
		expect(rows.map((row) => [row.dueOn, row.subscriptionId])).toEqual([
			["2026-09-01", null],
			["2026-10-01", null],
			["2026-11-01", null],
		]);
	});

	test("closing the old period leaves a tombstoned date uncharged", async () => {
		const missing = await goldenUser(owner, "sub-remove-step2-skip", {
			beforeCatchUp: true,
		});
		users.push(missing.userId);
		const ctx = goldenContext(missing.userId);
		const { result } = await asUser(missing.userId, async (tx) => {
			await tombstone(
				tx,
				missing.userId,
				missing.subscription("sunrise"),
				"2026-11-01",
			);
			return remove(tx, ctx, missing.subscription("sunrise"), 1);
		});
		expect(result).toMatchObject({ chargesCreated: 0, chargesKept: 2 });
	});

	test("a delete creates no charge for a date after C", async () => {
		const missing = await goldenUser(owner, "sub-remove-step2-through", {
			beforeCatchUp: true,
		});
		users.push(missing.userId);
		const ctx = on(missing.userId, "2026-11-20");
		const { result } = await asUser(missing.userId, async (tx) => {
			const answer = await remove(
				tx,
				ctx,
				missing.subscription("sunrise"),
				1,
				{
					changedAt: when("2026-10-20"),
				},
			);
			return answer;
		});
		// C is the later of 20 October and lastChangeOn (1 September): 1 November is after C.
		expect(result).toMatchObject({
			changeDate: "2026-10-20",
			chargesCreated: 0,
			chargesKept: 2,
		});
	});

	test("the answer carries the months of the charges it created and deleted, once each, in order", async () => {
		const ctx = on(golden.userId, "2026-12-20");
		const { result } = await asUser(golden.userId, async (tx) => {
			await laterCharge(tx, golden.userId, netflix(), "2027-01-05");
			await laterCharge(tx, golden.userId, netflix(), "2026-12-05");
			await laterCharge(tx, golden.userId, netflix(), "2026-12-06");
			return remove(tx, ctx, netflix(), 1, { changedAt: when("2026-11-02") });
		});
		expect(result.months).toEqual(["2026-12", "2027-01"]);
	});

	test("a profile of another zone gets its own C: 00:30 in India is already the next day", async () => {
		const ctx = on(golden.userId, "2026-11-03");
		const { result } = await asUser(golden.userId, (tx) =>
			remove(tx, ctx, netflix(), 1, { changedAt: "2026-11-02T19:00:00.000Z" }),
		);
		expect(result.changeDate).toBe("2026-11-03");
	});
});

describe("the undo of an Add (BR-F05-34, D-589)", () => {
	const createBody = (id: string) => ({
		id,
		name: "Netflix",
		amountMinor: 64900,
		currency: "INR",
		cadence: { unit: "month", every: 1 },
		startDate: "2025-09-05",
		category: "entertainment",
		note: null,
		backfill: true,
		createdAt: GOLDEN_NOW,
	});

	// AC-F05-23, section 5.
	test("removes the Subscription and its 14 charges; an edited one stays, unlinked", async () => {
		const ctx = goldenContext(custom);
		const id = uuidV7At(GOLDEN_NOW);
		const { result } = await asUser(custom, async (tx) => {
			const created = await createSubscription(tx, ctx, createBody(id));
			await tx.execute(
				sql`UPDATE app.transactions SET edited = true
				WHERE subscription_id = ${id}::uuid AND due_on = '2026-03-05'`,
			);
			const answer = await remove(tx, ctx, id, 1, { undo: "create" });
			return {
				created,
				answer,
				kept: await allCharges(tx),
				item: await getSubscriptionItem(tx, ctx, id),
			};
		});
		expect(result.created.subscription.chargesCreated).toBe(14);
		expect(result.answer).toMatchObject({
			chargesCreated: 0,
			chargesDeleted: 13,
			chargesKept: 1,
		});
		expect(result.answer.months).toHaveLength(13);
		expect(result.item).toBeNull();
		expect(result.kept).toEqual([
			{
				dueOn: "2026-03-05",
				subscriptionId: null,
				source: "subscription",
				edited: true,
				payee: "Netflix",
			},
		]);
	});

	// AC-F05-23: at version 2 it returns 409.
	test("at version 2 it is 409, with the Subscription as it is, and deletes nothing", async () => {
		const ctx = goldenContext(custom);
		const id = uuidV7At(GOLDEN_NOW);
		const { result } = await asUser(custom, async (tx) => {
			await createSubscription(tx, ctx, createBody(id));
			const changed = await changeSubscription(tx, ctx, id, 1, {
				changedAt: GOLDEN_NOW,
				note: "x",
			});
			const refused = await refusal(
				remove(tx, ctx, id, changed.version, { undo: "create" }),
			);
			return { refused, version: changed.version, rows: await dueOns(tx, id) };
		});
		expect(result.version).toBe(2);
		expect(result.refused.code).toBe("version_conflict");
		expect(result.refused.details).toMatchObject({
			current: { id, version: 2, currency: "INR", chargeCount: 14 },
		});
		expect(result.rows).toHaveLength(14);
	});

	test("the plain delete is what Delete anyway sends: at that version it works and the charges stay", async () => {
		const ctx = goldenContext(custom);
		const id = uuidV7At(GOLDEN_NOW);
		const { result } = await asUser(custom, async (tx) => {
			await createSubscription(tx, ctx, createBody(id));
			const changed = await changeSubscription(tx, ctx, id, 1, {
				changedAt: GOLDEN_NOW,
				note: "x",
			});
			return remove(tx, ctx, id, changed.version);
		});
		expect(result).toMatchObject({ chargesKept: 14, chargesDeleted: 0 });
	});

	test("a stale If-Match is 409 even at version 1, and version 1 with If-Match 2 is 409", async () => {
		const ctx = goldenContext(golden.userId);
		const { result } = await asUser(golden.userId, async (tx) => ({
			stale: await refusal(remove(tx, ctx, netflix(), 2, { undo: "create" })),
			item: await getSubscriptionItem(tx, ctx, netflix()),
		}));
		expect(result.stale.code).toBe("version_conflict");
		expect(result.item?.version).toBe(1);
	});

	test("it deletes every unedited charge whatever its date, later ones too", async () => {
		const ctx = on(golden.userId, "2026-11-20");
		const { result } = await asUser(golden.userId, async (tx) => {
			await laterCharge(tx, golden.userId, netflix(), "2026-11-05");
			await laterCharge(tx, golden.userId, netflix(), "2026-12-05", {
				edited: true,
			});
			const answer = await remove(tx, ctx, netflix(), 1, { undo: "create" });
			return { answer, kept: await allCharges(tx) };
		});
		expect(result.answer).toMatchObject({
			chargesDeleted: 3,
			chargesKept: 1,
			chargesCreated: 0,
			months: ["2026-09", "2026-10", "2026-11"],
		});
		expect(result.kept.filter((row) => row.payee === "Netflix")).toEqual([
			{
				dueOn: "2026-12-05",
				subscriptionId: null,
				source: "subscription",
				edited: true,
				payee: "Netflix",
			},
		]);
	});

	test("it makes no charge: the missing 1 November charge is not created", async () => {
		const missing = await goldenUser(owner, "sub-remove-undo-step2", {
			beforeCatchUp: true,
		});
		users.push(missing.userId);
		const ctx = goldenContext(missing.userId);
		const { result } = await asUser(missing.userId, async (tx) => {
			const answer = await remove(
				tx,
				ctx,
				missing.subscription("sunrise"),
				1,
				{ undo: "create" },
			);
			return { answer, kept: await allCharges(tx) };
		});
		expect(result.answer).toMatchObject({
			chargesCreated: 0,
			chargesDeleted: 2,
			chargesKept: 0,
		});
		expect(
			result.kept.filter((row) => row.payee === "Sunrise Apartments"),
		).toEqual([]);
	});

	test("it removes the tombstones too", async () => {
		const ctx = goldenContext(golden.userId);
		const { result } = await asUser(golden.userId, async (tx) => {
			await remove(tx, ctx, cultGym(), 1, { undo: "create" });
			return (
				await tx.execute<{ n: string }>(
					sql`SELECT count(*)::text AS n FROM app.subscription_skips`,
				)
			).rows[0]?.n;
		});
		expect(result).toBe("0");
	});

	test("it leaves other Subscriptions alone", async () => {
		const ctx = goldenContext(golden.userId);
		const { result } = await asUser(golden.userId, async (tx) => {
			await remove(tx, ctx, netflix(), 1, { undo: "create" });
			return {
				gym: await dueOns(tx, cultGym()),
				sunrise: await dueOns(tx, golden.subscription("sunrise")),
			};
		});
		expect(result.gym).toEqual(["2026-09-10"]);
		expect(result.sunrise).toHaveLength(3);
	});
});

describe("locks (SRV-7, BR-F05-08 step 1)", () => {
	test("waits for a held lock, then closes the old period with the tombstone the holder committed", async () => {
		const missing = await goldenUser(owner, "sub-remove-lock-skip", {
			beforeCatchUp: true,
		});
		users.push(missing.userId);
		const ctx = goldenContext(missing.userId);
		const id = missing.subscription("sunrise");
		const result = await holdingLock(
			owner,
			missing.userId,
			id,
			async (holder) => {
				await holder.query(
					`INSERT INTO app.subscription_skips (id, user_id, created_at, updated_at,
						subscription_id, due_on)
					VALUES ($1, $2, $3, $3, $4, '2026-11-01')`,
					[uuidV7At(GOLDEN_NOW), missing.userId, GOLDEN_NOW, id],
				);
			},
			() =>
				withUser({ user: ctx.user }, "write", (tx) =>
					remove(tx, ctx, id, 1),
				),
		);
		// A read that locks as it goes would miss the tombstone and charge 1 November.
		expect(result).toMatchObject({ chargesCreated: 0, chargesKept: 2 });
	}, 60_000);

	test("waits for a held lock, then is 409 when the holder changed the Subscription", async () => {
		const user = await goldenUser(owner, "sub-remove-lock-version");
		users.push(user.userId);
		const ctx = goldenContext(user.userId);
		const id = user.subscription("netflix");
		const refused = await holdingLock(
			owner,
			user.userId,
			id,
			async (holder) => {
				await holder.query(
					"UPDATE app.subscriptions SET version = version + 1 WHERE id = $1",
					[id],
				);
			},
			() =>
				refusal(
					withUser({ user: ctx.user }, "write", (tx) =>
						remove(tx, ctx, id, 1),
					),
				),
		);
		expect(refused.code).toBe("version_conflict");
		const { rows } = await owner.query(
			"SELECT 1 FROM app.subscriptions WHERE id = $1",
			[id],
		);
		expect(rows).toHaveLength(1);
	}, 60_000);

	test("two deletes at the same version: the first commits, the second is 404", async () => {
		const user = await goldenUser(owner, "sub-remove-race");
		users.push(user.userId);
		const ctx = goldenContext(user.userId);
		const id = user.subscription("netflix");
		const settled = await Promise.allSettled([
			withUser({ user: ctx.user }, "write", (tx) => remove(tx, ctx, id, 1)),
			withUser({ user: ctx.user }, "write", (tx) => remove(tx, ctx, id, 1)),
		]);
		expect(settled.filter((s) => s.status === "fulfilled")).toHaveLength(1);
		const failed = settled.filter(
			(s) => s.status === "rejected",
		) as PromiseRejectedResult[];
		expect(failed).toHaveLength(1);
		expect(failed[0]?.reason).toMatchObject({ code: "not_found" });
		const { rows } = await owner.query(
			"SELECT subscription_id FROM app.transactions WHERE user_id = $1 AND payee = 'Netflix'",
			[user.userId],
		);
		expect(rows).toEqual([{ subscription_id: null }, { subscription_id: null }]);
	}, 60_000);
});
