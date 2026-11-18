import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

import { GOLDEN_NOW } from "../../../../../seed/golden";
import { loadGolden, type LoadedGolden } from "../../../../../seed/load-golden";
import { ApiError } from "../../../api/errors";
import { runtimePool } from "../../../db/pools";
import { createUser } from "../../../db/__tests__/private-rows";
import { parseOwnerEnv } from "../../../env";
import { sql } from "drizzle-orm";
import { bootCatchUp } from "../../subscriptions/catch-up";
import { getSubscriptionItem } from "../../subscriptions/read";
import { goldenUser, holdingLock } from "../../subscriptions/__tests__/helpers";
import { withUser } from "../../with-user";
import { getTransaction } from "../get";
import { deleteTransaction } from "../remove";
import {
	addExpense,
	afterFirstStatement,
	afterStatement,
	asUser,
	goldenContext,
	uuidV7At,
} from "./helpers";

/** `deleteTransaction` (F03 section 11, BR-F03-05, BR-F03-18; D-487) through the runtime role
 * and RLS. Every case rolls back unless it says otherwise. */

let owner: Client;
let golden: LoadedGolden;
let other: LoadedGolden;

beforeAll(async () => {
	owner = new Client({
		connectionString: parseOwnerEnv(process.env).DATABASE_URL_OWNER,
	});
	await owner.connect();
	golden = await loadGolden(owner, await createUser(owner, "delete"));
	other = await loadGolden(owner, await createUser(owner, "delete-other"));
});

const users: string[] = [];

afterAll(async () => {
	await owner?.query(`DELETE FROM auth."user" WHERE id = ANY($1)`, [
		[golden?.userId, other?.userId, ...users].filter(Boolean),
	]);
	await owner?.end();
	await runtimePool().end();
});

/** The ApiError a delete throws, as code, fields and details. */
async function refusal(promise: Promise<unknown>) {
	try {
		await promise;
	} catch (error) {
		if (!(error instanceof ApiError)) throw error;
		return { code: error.code, fields: error.fields, details: error.details };
	}
	throw new Error("The delete was not refused.");
}

/** `"done"` when the delete answered (204), else the ApiError it threw. */
async function settled(promise: Promise<unknown>) {
	try {
		await promise;
		return "done";
	} catch (error) {
		if (!(error instanceof ApiError)) throw error;
		return { code: error.code, fields: error.fields, details: error.details };
	}
}

/** Deletes `id` at `If-Match` `version` as the golden user, then reads it back. */
function deleteAndRead(id: string, version = 1) {
	const ctx = goldenContext(golden.userId);
	return asUser(golden.userId, async (tx) => {
		await deleteTransaction(tx, ctx, id, version);
		return getTransaction(tx, id);
	});
}

describe("a delete", () => {
	// golden #24: Swiggy, 640.00 on 19 October.
	test("removes the row after locking the profile", async () => {
		const { result, statements } = await deleteAndRead(golden.id(24));
		expect(result).toBeNull();
		// The profile lock, the row's read and the delete; then the test's read. A row with no link
		// takes no Subscription lock.
		expect(statements).toBe(4);
	});

	// BR-F03-18: demo rows are deleted like other rows.
	test("removes a demo row", async () => {
		const ctx = goldenContext(golden.userId);
		const { result } = await asUser(golden.userId, async (tx) => {
			const id = await addExpense(tx, golden.userId, {
				payee: "Demo Cafe",
				amountMinor: 30000,
				occurredOn: "2026-11-02",
				demo: true,
			});
			await deleteTransaction(tx, ctx, id, 1);
			return getTransaction(tx, id);
		});
		expect(result).toBeNull();
	});
});

describe("versions and missing rows (BR-P2-21, BR-F03-25)", () => {
	test("a stale version gets 409 with the current row and currency, and deletes nothing", async () => {
		const ctx = goldenContext(golden.userId);
		const { result, statements } = await asUser(golden.userId, async (tx) => {
			const current = await getTransaction(tx, golden.id(24));
			const answer = await refusal(
				deleteTransaction(tx, ctx, golden.id(24), 2),
			);
			return {
				current,
				answer,
				after: await getTransaction(tx, golden.id(24)),
			};
		});
		expect(result.answer).toEqual({
			code: "version_conflict",
			fields: {},
			details: { current: { ...result.current, currency: "INR" } },
		});
		expect(result.after).toEqual(result.current);
		// The test's read; the lock, the row's read, the delete that matched nothing and the
		// re-read; the test's read.
		expect(statements).toBe(6);
	});

	// D-493
	test("a 409 carries the currency it locked, even when the request read another", async () => {
		const ctx = goldenContext(golden.userId, { currency: "USD" });
		const { result } = await asUser(golden.userId, (tx) =>
			refusal(deleteTransaction(tx, ctx, golden.id(24), 2)),
		);
		expect(result).toMatchObject({
			code: "version_conflict",
			details: { current: { id: golden.id(24), currency: "INR" } },
		});
	});

	test("another user's row and an unknown id get 404, and leave the other user's row", async () => {
		const ctx = goldenContext(golden.userId);
		for (const id of [other.id(24), uuidV7At(GOLDEN_NOW)]) {
			const { result } = await asUser(golden.userId, (tx) =>
				refusal(deleteTransaction(tx, ctx, id, 1)),
			);
			expect(result).toMatchObject({ code: "not_found" });
		}
		const { rows } = await owner.query(
			"SELECT count(*)::int AS n FROM app.transactions WHERE id = $1",
			[other.id(24)],
		);
		expect(rows[0]).toEqual({ n: 1 });
	});

	test("an id that is not a UUID gets 404 before any statement", async () => {
		const ctx = goldenContext(golden.userId);
		const { result, statements } = await asUser(golden.userId, (tx) =>
			refusal(deleteTransaction(tx, ctx, "24", 1)),
		);
		expect(result).toMatchObject({ code: "not_found" });
		expect(statements).toBe(0);
	});

	/** A committed row of the golden user's, changed by `between` once the delete has locked the
	 * profile. These rows stay until the user is deleted. */
	async function race(between: (id: string) => Promise<unknown>) {
		const id = uuidV7At(GOLDEN_NOW);
		await owner.query(
			`INSERT INTO app.transactions (id, user_id, created_at, updated_at, type, amount_minor,
			   occurred_at, occurred_on, category, payee, source, version)
			 VALUES ($1, $2, $3, $3, 'expense', 30000, $3, '2026-11-02', 'food', 'Chai Point', 'manual', 1)`,
			[id, golden.userId, GOLDEN_NOW],
		);
		const ctx = goldenContext(golden.userId);
		const { result } = await asUser(golden.userId, (tx) =>
			refusal(
				deleteTransaction(
					afterFirstStatement(tx, () => between(id)),
					ctx,
					id,
					1,
				),
			),
		);
		return { id, refusal: result };
	}

	test("a row changed after the lock gets 409 with the other device's row", async () => {
		const { id, refusal: answer } = await race((id) =>
			owner.query(
				`UPDATE app.transactions SET payee = 'Theirs', version = 2 WHERE id = $1`,
				[id],
			),
		);
		expect(answer).toMatchObject({
			code: "version_conflict",
			details: {
				current: { id, payee: "Theirs", version: 2, currency: "INR" },
			},
		});
	});

	test("a row deleted after the lock gets 404", async () => {
		const { refusal: answer } = await race((id) =>
			owner.query(`DELETE FROM app.transactions WHERE id = $1`, [id]),
		);
		expect(answer).toMatchObject({ code: "not_found" });
	});
});

// golden #16 (Netflix, due 5 Oct), #7 (Cult Gym, due 10 Sep) and #12 (Sunrise Apartments, due 1
// Oct); Cult Gym already holds the tombstone of 10 Oct.
describe("a linked charge (BR-F03-17, BR-F05-07; D-607)", () => {
	const ctx = () => goldenContext(golden.userId);
	const netflix = () => golden.subscription("netflix");

	/** Deletes `id` at `version` as the golden user, then reads the Subscription and the charge. */
	function removeCharge(
		n: number,
		subscription: Parameters<typeof golden.subscription>[0],
	) {
		return asUser(golden.userId, async (tx) => {
			const before = await getSubscriptionItem(
				tx,
				ctx(),
				golden.subscription(subscription),
			);
			await deleteTransaction(tx, ctx(), golden.id(n), 1);
			return {
				before,
				after: await getSubscriptionItem(
					tx,
					ctx(),
					golden.subscription(subscription),
				),
				charge: await getTransaction(tx, golden.id(n)),
			};
		});
	}

	test("locks the Subscription, deletes the charge and writes its due date as a tombstone", async () => {
		const { result, statements } = await asUser(golden.userId, async (tx) => {
			await deleteTransaction(tx, ctx(), golden.id(16), 1);
			return {
				charge: await getTransaction(tx, golden.id(16)),
				item: await getSubscriptionItem(tx, ctx(), netflix()),
			};
		});
		expect(result.charge).toBeNull();
		expect(result.item?.skips).toEqual(["2026-10-05"]);
		// The delete's six: the profile lock, the row's read, the Subscription lock, the delete, the
		// tombstone and the version; then the test's two reads.
		expect(statements).toBe(6 + 2);
	});

	test("raises the Subscription's version and updatedAt, not lastChangeOn (D-607)", async () => {
		const { result } = await removeCharge(16, "netflix");
		const before = result.before!;
		const after = result.after!;
		expect(after.version).toBe(before.version + 1);
		expect(after.updatedAt).toBe(new Date(GOLDEN_NOW).toISOString());
		expect(after.lastChangeOn).toBe(before.lastChangeOn);
	});

	test("adds to the tombstones a Subscription already has", async () => {
		const { result } = await removeCharge(7, "cultGym");
		expect(result.before?.skips).toEqual(["2026-10-10"]);
		expect(result.after?.skips).toEqual(["2026-09-10", "2026-10-10"]);
	});

	test("deletes an edited charge too, and tombstones it", async () => {
		const { result } = await asUser(golden.userId, async (tx) => {
			await tx.execute(
				sql`UPDATE app.transactions SET edited = true, version = 2 WHERE id = ${golden.id(16)}::uuid`,
			);
			await deleteTransaction(tx, ctx(), golden.id(16), 2);
			return {
				charge: await getTransaction(tx, golden.id(16)),
				item: await getSubscriptionItem(tx, ctx(), netflix()),
			};
		});
		expect(result.charge).toBeNull();
		expect(result.item?.skips).toEqual(["2026-10-05"]);
	});

	test("leaves the Subscription's other charges and amounts alone", async () => {
		const { result } = await removeCharge(16, "netflix");
		expect(result.after).toMatchObject({
			amountMinor: result.before!.amountMinor,
			chargeCount: result.before!.chargeCount - 1,
			paidMinor: result.before!.paidMinor - 64900,
		});
	});

	// AC-F05-14, BR-F05-07: catch-up never recreates the charge.
	test("catch-up on the same day creates nothing, and the charge stays gone", async () => {
		const { result } = await asUser(golden.userId, async (tx) => {
			await deleteTransaction(tx, ctx(), golden.id(16), 1);
			const boot = await bootCatchUp(tx, ctx());
			return { boot, charge: await getTransaction(tx, golden.id(16)) };
		});
		expect(result.boot.chargesCreated).toBe(0);
		expect(result.charge).toBeNull();
	});

	test("a charge whose Subscription is gone is deleted with no lock and no tombstone", async () => {
		const { result, statements } = await asUser(golden.userId, async (tx) => {
			await tx.execute(
				sql`UPDATE app.transactions SET subscription_id = NULL WHERE id = ${golden.id(16)}::uuid`,
			);
			await deleteTransaction(tx, ctx(), golden.id(16), 1);
			return {
				charge: await getTransaction(tx, golden.id(16)),
				item: await getSubscriptionItem(tx, ctx(), netflix()),
			};
		});
		expect(result.charge).toBeNull();
		expect(result.item?.skips).toEqual([]);
		expect(result.item?.version).toBe(1);
		// The test's update; the delete's profile lock, read and delete; the test's two reads.
		expect(statements).toBe(1 + 3 + 2);
	});

	test("the body's hint is ignored while the charge exists: its own due date is the tombstone", async () => {
		const { result } = await asUser(golden.userId, async (tx) => {
			await deleteTransaction(tx, ctx(), golden.id(16), 1, {
				subscriptionId: golden.subscription("cultGym"),
				dueOn: "2026-12-10",
			});
			return {
				netflix: await getSubscriptionItem(tx, ctx(), netflix()),
				cultGym: await getSubscriptionItem(
					tx,
					ctx(),
					golden.subscription("cultGym"),
				),
			};
		});
		expect(result.netflix?.skips).toEqual(["2026-10-05"]);
		expect(result.cultGym?.skips).toEqual(["2026-10-10"]);
	});

	test("another user's Subscription is not locked, read or written through a charge id", async () => {
		const { result } = await asUser(golden.userId, async (tx) =>
			refusal(deleteTransaction(tx, ctx(), other.id(16), 1)),
		);
		expect(result).toMatchObject({ code: "not_found" });
		const { rows } = await owner.query(
			"SELECT count(*)::int AS n FROM app.subscription_skips WHERE subscription_id = $1",
			[other.subscription("netflix")],
		);
		expect(rows[0]).toEqual({ n: 0 });
	});
});

// F03 section 11: the hint of a delete whose charge is already gone (BR-F03-17, D-239, D-608).
describe("a delete whose charge is gone, with a hint", () => {
	const ctx = () => goldenContext(golden.userId);
	const ghost = () => uuidV7At(GOLDEN_NOW);

	/** Runs the delete of an id the user has no row for, with `hint`; then reads the Subscription. */
	function hinted(
		hint: { subscriptionId: string; dueOn: string },
		subscription: Parameters<typeof golden.subscription>[0] = "netflix",
		setup: (
			tx: Parameters<Parameters<typeof asUser>[1]>[0],
		) => Promise<void> = async () => {},
	) {
		return asUser(golden.userId, async (tx) => {
			await setup(tx);
			const before = await getSubscriptionItem(
				tx,
				ctx(),
				golden.subscription(subscription),
			);
			const outcome = await settled(
				deleteTransaction(tx, ctx(), ghost(), 1, hint),
			);
			return {
				before,
				outcome,
				after: await getSubscriptionItem(
					tx,
					ctx(),
					golden.subscription(subscription),
				),
			};
		});
	}

	test("writes the tombstone when the Subscription exists and the date has no charge: done", async () => {
		const { result } = await asUser(golden.userId, async (tx) => {
			await tx.execute(
				sql`DELETE FROM app.transactions WHERE id = ${golden.id(16)}::uuid`,
			);
			const before = await getSubscriptionItem(
				tx,
				ctx(),
				golden.subscription("netflix"),
			);
			await deleteTransaction(tx, ctx(), golden.id(16), 1, {
				subscriptionId: golden.subscription("netflix"),
				dueOn: "2026-10-05",
			});
			return {
				before,
				after: await getSubscriptionItem(
					tx,
					ctx(),
					golden.subscription("netflix"),
				),
			};
		});
		expect(result.after?.skips).toEqual(["2026-10-05"]);
		expect(result.after?.version).toBe(result.before!.version + 1);
		expect(result.after?.lastChangeOn).toBe(result.before!.lastChangeOn);
	});

	test("a future due date is tombstoned too: a skip made on another device stays", async () => {
		const { result } = await asUser(golden.userId, async (tx) => {
			await deleteTransaction(tx, ctx(), ghost(), 1, {
				subscriptionId: golden.subscription("netflix"),
				dueOn: "2026-12-05",
			});
			return getSubscriptionItem(tx, ctx(), golden.subscription("netflix"));
		});
		expect(result?.skips).toEqual(["2026-12-05"]);
	});

	test("a date that already has its tombstone is done, and writes nothing", async () => {
		const { result } = await hinted(
			{ subscriptionId: golden.subscription("cultGym"), dueOn: "2026-10-10" },
			"cultGym",
		);
		expect(result.outcome).toBe("done");
		expect(result.after).toEqual(result.before);
	});

	// F05 BR-F05-11: a schedule change keeps tombstones on or before its change date.
	test("a tombstone that is off the schedule is done too, and writes nothing", async () => {
		const { result } = await hinted(
			{ subscriptionId: golden.subscription("netflix"), dueOn: "2026-10-06" },
			"netflix",
			async (tx) => {
				await tx.execute(
					sql`INSERT INTO app.subscription_skips (id, user_id, created_at, updated_at,
						subscription_id, due_on)
					VALUES (${uuidV7At(GOLDEN_NOW)}, ${golden.userId}, ${GOLDEN_NOW}, ${GOLDEN_NOW},
						${golden.subscription("netflix")}::uuid, '2026-10-06')`,
				);
			},
		);
		expect(result.outcome).toBe("done");
		expect(result.after).toEqual(result.before);
	});

	test("a date with a charge on it is 404: another charge holds it", async () => {
		const { result } = await hinted({
			subscriptionId: golden.subscription("netflix"),
			dueOn: "2026-10-05",
		});
		expect(result.outcome).toMatchObject({ code: "not_found" });
		expect(result.after).toEqual(result.before);
	});

	test("a date that is not a due date of the schedule is 404", async () => {
		for (const dueOn of ["2026-10-06", "2026-08-05", "2026-12-04"]) {
			const { result } = await hinted({
				subscriptionId: golden.subscription("netflix"),
				dueOn,
			});
			expect(result.outcome).toMatchObject({ code: "not_found" });
			expect(result.after).toEqual(result.before);
		}
	});

	test("a Subscription that does not exist is 404", async () => {
		const { result } = await asUser(golden.userId, (tx) =>
			refusal(
				deleteTransaction(tx, ctx(), ghost(), 1, {
					subscriptionId: ghost(),
					dueOn: "2026-10-05",
				}),
			),
		);
		expect(result).toMatchObject({ code: "not_found" });
	});

	test("another user's Subscription is 404, and gets no tombstone", async () => {
		const { result } = await asUser(golden.userId, (tx) =>
			refusal(
				deleteTransaction(tx, ctx(), ghost(), 1, {
					subscriptionId: other.subscription("netflix"),
					dueOn: "2026-12-05",
				}),
			),
		);
		expect(result).toMatchObject({ code: "not_found" });
		const { rows } = await owner.query(
			"SELECT count(*)::int AS n FROM app.subscription_skips WHERE subscription_id = $1",
			[other.subscription("netflix")],
		);
		expect(rows[0]).toEqual({ n: 0 });
	});

	test("without a hint, a missing row is 404 and no tombstone is written", async () => {
		const { result } = await asUser(golden.userId, async (tx) => ({
			outcome: await refusal(deleteTransaction(tx, ctx(), ghost(), 1)),
			item: await getSubscriptionItem(
				tx,
				ctx(),
				golden.subscription("netflix"),
			),
		}));
		expect(result.outcome).toMatchObject({ code: "not_found" });
		expect(result.item?.skips).toEqual([]);
	});

	test("the hint locks the Subscription after the profile: lock, read, lock, read, tombstone, version", async () => {
		const { statements } = await asUser(golden.userId, (tx) =>
			deleteTransaction(tx, ctx(), ghost(), 1, {
				subscriptionId: golden.subscription("netflix"),
				dueOn: "2026-12-05",
			}),
		);
		// Profile lock, the row's read, the Subscription's lock, its read, the tombstone, the version.
		expect(statements).toBe(6);
	});
});

// SRV-7, D-605: the Subscription is locked before the charge row.
describe("races and locks (BR-F03-17)", () => {
	const fresh = async (label: string) => {
		const user = await goldenUser(owner, label);
		users.push(user.userId);
		return user;
	};

	test("a Subscription deleted after the read is found at the lock: the charge goes, with no tombstone", async () => {
		const user = await fresh("remove-gone-sub");
		const ctx = goldenContext(user.userId);
		const id = user.subscription("netflix");
		await asUser(user.userId, async (tx) => {
			await deleteTransaction(
				afterStatement(tx, 2, () =>
					owner.query("DELETE FROM app.subscriptions WHERE id = $1", [id]),
				),
				ctx,
				user.id(16),
				1,
			);
			expect(await getTransaction(tx, user.id(16))).toBeNull();
		});
		// The tombstone has nowhere to go: the Subscription is gone and so are its skips.
		const { rows } = await owner.query(
			"SELECT count(*)::int AS n FROM app.subscription_skips WHERE user_id = $1 AND due_on = '2026-10-05'",
			[user.userId],
		);
		expect(rows[0]).toEqual({ n: 0 });
	});

	test("a Subscription and its charge both gone after the read: done", async () => {
		const user = await fresh("remove-gone-both");
		const ctx = goldenContext(user.userId);
		const id = user.subscription("netflix");
		const { result } = await asUser(user.userId, async (tx) => ({
			outcome: await settled(
				deleteTransaction(
					afterStatement(tx, 2, async () => {
						await owner.query(
							"DELETE FROM app.transactions WHERE id = $1",
							[user.id(16)],
						);
						await owner.query(
							"DELETE FROM app.subscriptions WHERE id = $1",
							[id],
						);
					}),
					ctx,
					user.id(16),
					1,
				),
			),
			row: await getTransaction(tx, user.id(16)),
		}));
		expect(result.outcome).toBe("done");
		expect(result.row).toBeNull();
		// Nothing is left to tombstone: the Subscription and its skips are gone with it.
		const { rows } = await owner.query(
			"SELECT count(*)::int AS n FROM app.subscription_skips WHERE user_id = $1 AND due_on = '2026-10-05'",
			[user.userId],
		);
		expect(rows[0]).toEqual({ n: 0 });
	});

	test("a charge deleted by another device after the read is 404, and writes no tombstone", async () => {
		const user = await fresh("remove-gone-charge");
		const ctx = goldenContext(user.userId);
		const { result } = await asUser(user.userId, async (tx) => ({
			outcome: await refusal(
				deleteTransaction(
					afterStatement(tx, 2, () =>
						owner.query("DELETE FROM app.transactions WHERE id = $1", [
							user.id(16),
						]),
					),
					ctx,
					user.id(16),
					1,
				),
			),
			item: await getSubscriptionItem(tx, ctx, user.subscription("netflix")),
		}));
		expect(result.outcome).toMatchObject({ code: "not_found" });
		expect(result.item?.skips).toEqual([]);
		expect(result.item?.version).toBe(1);
	});

	// AC-F05-14
	test("a charge repriced after the read is 409 with the new price, and Keep mine then deletes it and tombstones it", async () => {
		const user = await fresh("remove-stale");
		const ctx = goldenContext(user.userId);
		const id = user.subscription("netflix");
		const refused = await asUser(user.userId, async (tx) =>
			refusal(
				deleteTransaction(
					afterStatement(tx, 2, () =>
						owner.query(
							"UPDATE app.transactions SET amount_minor = 69900, version = 2 WHERE id = $1",
							[user.id(16)],
						),
					),
					ctx,
					user.id(16),
					1,
				),
			),
		);
		expect(refused.result).toMatchObject({
			code: "version_conflict",
			details: {
				current: { id: user.id(16), amountMinor: 69900, version: 2 },
			},
		});
		// Keep mine: the same delete at the version the 409 carried.
		await withUser({ user: ctx.user }, "write", (tx) =>
			deleteTransaction(tx, ctx, user.id(16), 2),
		);
		const { rows } = await owner.query(
			`SELECT (SELECT count(*)::int FROM app.transactions WHERE id = $1) AS charges,
			        (SELECT count(*)::int FROM app.subscription_skips
			         WHERE subscription_id = $2 AND due_on = '2026-10-05') AS skips`,
			[user.id(16), id],
		);
		expect(rows[0]).toEqual({ charges: 0, skips: 1 });
		const created = await withUser({ user: ctx.user }, "write", (tx) =>
			bootCatchUp(tx, ctx),
		);
		expect(created.chargesCreated).toBe(0);
		const again = await owner.query(
			"SELECT count(*)::int AS n FROM app.transactions WHERE subscription_id = $1 AND due_on = '2026-10-05'",
			[id],
		);
		expect(again.rows[0]).toEqual({ n: 0 });
	}, 60_000);

	test("a delete that waits for the Subscription's lock sees what the holder committed, then writes its tombstone on top", async () => {
		const user = await fresh("remove-lock-wait");
		const ctx = goldenContext(user.userId);
		const id = user.subscription("netflix");
		await holdingLock(
			owner,
			user.userId,
			id,
			async (holder) => {
				await holder.query(
					`INSERT INTO app.subscription_skips (id, user_id, created_at, updated_at,
						subscription_id, due_on)
					VALUES ($1, $2, $3, $3, $4, '2026-11-05')`,
					[uuidV7At(GOLDEN_NOW), user.userId, GOLDEN_NOW, id],
				);
				await holder.query(
					"UPDATE app.subscriptions SET version = version + 1 WHERE id = $1",
					[id],
				);
			},
			() =>
				withUser({ user: ctx.user }, "write", (tx) =>
					deleteTransaction(tx, ctx, user.id(16), 1),
				),
		);
		const { rows } = await owner.query(
			`SELECT (SELECT array_agg(due_on::text ORDER BY due_on) FROM app.subscription_skips
			         WHERE subscription_id = $1) AS skips,
			        (SELECT version FROM app.subscriptions WHERE id = $1) AS version`,
			[id],
		);
		expect(rows[0]).toEqual({ skips: ["2026-10-05", "2026-11-05"], version: 3 });
	}, 60_000);

	test("a delete that waits while the Subscription is repriced is 409 with the new price", async () => {
		const user = await fresh("remove-lock-reprice");
		const ctx = goldenContext(user.userId);
		const refused = await holdingLock(
			owner,
			user.userId,
			user.subscription("netflix"),
			async (holder) => {
				await holder.query(
					"UPDATE app.transactions SET amount_minor = 69900, version = version + 1 WHERE id = $1",
					[user.id(16)],
				);
			},
			() =>
				refusal(
					withUser({ user: ctx.user }, "write", (tx) =>
						deleteTransaction(tx, ctx, user.id(16), 1),
					),
				),
		);
		expect(refused).toMatchObject({
			code: "version_conflict",
			details: { current: { amountMinor: 69900, version: 2 } },
		});
		const { rows } = await owner.query(
			"SELECT count(*)::int AS n FROM app.subscription_skips WHERE user_id = $1 AND due_on = '2026-10-05'",
			[user.userId],
		);
		expect(rows[0]).toEqual({ n: 0 });
	}, 60_000);
});
