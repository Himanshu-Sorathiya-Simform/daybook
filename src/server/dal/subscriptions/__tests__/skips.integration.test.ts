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
import { catchUpAll, chargeContext } from "../catch-up";
import { changeSubscription } from "../change";
import { getSubscriptionItem, upcomingDue } from "../read";
import { skipCharge, unskipCharge } from "../skips";
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

/** `POST /api/subscriptions/[id]/skips` and `DELETE /api/subscriptions/[id]/skips/[dueOn]`
 * (F05 section 11, BR-F05-26, BR-F05-27, D-596) through the runtime role and RLS. Every scenario
 * runs in a rolled-back transaction as one profile user, except the lock scenarios, which
 * commit. Expected figures come from F05 sections 5 and 14 and the golden dataset. */

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
	golden = await goldenUser(owner, "sub-skips");
	neighbour = await goldenUser(owner, "sub-skips-neighbour");
	custom = await createUser(owner, "sub-skips-custom");
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
const sunrise = () => golden.subscription("sunrise");

const skip = (
	tx: Tx,
	ctx: ProfiledContext,
	id: string,
	version: number,
	body: Record<string, unknown>,
) => skipCharge(tx, ctx, id, version, { changedAt: GOLDEN_NOW, ...body });

const unskip = (
	tx: Tx,
	ctx: ProfiledContext,
	id: string,
	dueOn: string,
	version: number,
	body: Record<string, unknown> = {},
) => unskipCharge(tx, ctx, id, dueOn, version, { changedAt: GOLDEN_NOW, ...body });

describe("the checks before a skip (section 11 order)", () => {
	test("an id that is not a UUID is 404 before any statement", async () => {
		const { result, statements } = await asUser(golden.userId, (tx) =>
			refusal(
				skip(tx, goldenContext(golden.userId), "nope", 1, {
					dueOn: "2026-11-05",
				}),
			),
		);
		expect(result.code).toBe("not_found");
		expect(statements).toBe(0);
	});

	test("a body that breaks the schema is 422 before any statement", async () => {
		const bodies: Record<string, unknown>[] = [
			{},
			{ changedAt: GOLDEN_NOW },
			{ dueOn: "2026-11-05" },
			{ dueOn: "5 Nov", changedAt: GOLDEN_NOW },
			{ dueOn: "2026-02-30", changedAt: GOLDEN_NOW },
			{ dueOn: "2026-11-05", changedAt: "yesterday" },
			{ dueOn: "2026-11-05", changedAt: GOLDEN_NOW, version: 2 },
		];
		for (const body of bodies) {
			const { result, statements } = await asUser(golden.userId, (tx) =>
				refusal(
					skipCharge(tx, goldenContext(golden.userId), netflix(), 1, body),
				),
			);
			expect(result.code).toBe("validation_failed");
			expect(statements).toBe(0);
		}
	});

	test("a changedAt 91 days old, or more than 5 minutes ahead, is 422 on changedAt, and the edges are accepted", async () => {
		const ctx = goldenContext(golden.userId);
		const old = new Date(ctx.now.getTime() - 91 * 86_400_000).toISOString();
		const edgeOld = new Date(ctx.now.getTime() - 90 * 86_400_000).toISOString();
		const ahead = new Date(ctx.now.getTime() + 5 * 60_000 + 1000).toISOString();
		const edgeAhead = new Date(ctx.now.getTime() + 5 * 60_000).toISOString();
		const { result } = await asUser(golden.userId, async (tx) => ({
			old: await refusal(
				skip(tx, ctx, netflix(), 1, { dueOn: "2026-11-05", changedAt: old }),
			),
			ahead: await refusal(
				skip(tx, ctx, netflix(), 1, {
					dueOn: "2026-11-05",
					changedAt: ahead,
				}),
			),
			edgeOld: await skip(tx, ctx, netflix(), 1, {
				dueOn: "2026-11-05",
				changedAt: edgeOld,
			}),
			edgeAhead: await skip(tx, ctx, netflix(), 2, {
				dueOn: "2026-12-05",
				changedAt: edgeAhead,
			}),
		}));
		expect(result.old.fields).toHaveProperty("changedAt");
		expect(result.ahead.fields).toHaveProperty("changedAt");
		expect(result.edgeOld.skips).toEqual(["2026-11-05"]);
		expect(result.edgeAhead.skips).toEqual(["2026-11-05", "2026-12-05"]);
	});

	test("a Subscription that does not exist is 404, and so is another user's", async () => {
		const ctx = goldenContext(golden.userId);
		const { result } = await asUser(golden.userId, async (tx) => ({
			none: await refusal(
				skip(tx, ctx, uuidV7At(GOLDEN_NOW), 1, { dueOn: "2026-11-05" }),
			),
			theirs: await refusal(
				skip(tx, ctx, neighbour.subscription("netflix"), 1, {
					dueOn: "2026-11-05",
				}),
			),
		}));
		expect(result.none.code).toBe("not_found");
		expect(result.theirs.code).toBe("not_found");
	});

	test("a stale version is 409 with the Subscription and currency, before any rule", async () => {
		const ctx = goldenContext(golden.userId);
		const { result } = await asUser(golden.userId, async (tx) => ({
			stale: await refusal(
				skip(tx, ctx, netflix(), 4, { dueOn: "2026-11-06" }),
			),
			skipped: await skipsOf(tx, netflix()),
		}));
		expect(result.stale.code).toBe("version_conflict");
		expect(result.stale.details).toMatchObject({
			current: { id: netflix(), version: 1, currency: "INR" },
		});
		expect(result.skipped).toEqual([]);
	});
});

describe("a skip (BR-F05-26, AC-F05-18)", () => {
	// AC-F05-18, section 5.
	test("skipping Netflix's 5 November moves its next due to 5 December and the next 30 days to 19,500.00", async () => {
		const ctx = goldenContext(golden.userId);
		const { result } = await asUser(golden.userId, async (tx) => {
			const answer = await skip(tx, ctx, netflix(), 1, {
				dueOn: "2026-11-05",
			});
			return { answer, upcoming: await upcomingDue(tx, ctx, 30) };
		});
		expect(result.answer).toMatchObject({
			skips: ["2026-11-05"],
			nextDueOn: "2026-12-05",
			version: 2,
			lastChangeOn: "2026-09-05",
			updatedAt: "2026-11-02T06:30:00.000Z",
			chargeCount: 2,
		});
		expect(result.upcoming.totalMinor).toBe(1950000);
		expect(
			result.upcoming.entries.map((entry) => entry.subscriptionId),
		).not.toContain(netflix());
	});

	test("catch-up on 5 November creates nothing for it", async () => {
		const ctx = goldenContext(golden.userId);
		const { result } = await asUser(golden.userId, async (tx) => {
			await skip(tx, ctx, netflix(), 1, { dueOn: "2026-11-05" });
			await catchUpAll(tx, chargeContext(on(golden.userId, "2026-11-05")));
			return dueOns(tx, netflix());
		});
		expect(result).toEqual(["2026-09-05", "2026-10-05"]);
	});

	test("the skips stay in date order, and each raises the version once", async () => {
		const ctx = goldenContext(golden.userId);
		const { result } = await asUser(golden.userId, async (tx) => {
			const first = await skip(tx, ctx, netflix(), 1, { dueOn: "2026-12-05" });
			const second = await skip(tx, ctx, netflix(), first.version, {
				dueOn: "2026-11-05",
			});
			return second;
		});
		expect(result.skips).toEqual(["2026-11-05", "2026-12-05"]);
		expect(result.version).toBe(3);
		expect(result.nextDueOn).toBe("2027-01-05");
	});

	test("it makes no charge and does not catch the Subscription up", async () => {
		const missing = await goldenUser(owner, "sub-skips-no-catchup", {
			beforeCatchUp: true,
		});
		users.push(missing.userId);
		const ctx = goldenContext(missing.userId);
		const { result } = await asUser(missing.userId, async (tx) => {
			await skip(tx, ctx, missing.subscription("sunrise"), 1, {
				dueOn: "2026-12-01",
			});
			return dueOns(tx, missing.subscription("sunrise"));
		});
		expect(result).toEqual(["2026-09-01", "2026-10-01"]);
	});

	test("it leaves other Subscriptions and their tombstones alone", async () => {
		const ctx = goldenContext(golden.userId);
		const { result } = await asUser(golden.userId, async (tx) => {
			await skip(tx, ctx, netflix(), 1, { dueOn: "2026-11-05" });
			return {
				gym: await skipsOf(tx, cultGym()),
				item: await getSubscriptionItem(tx, ctx, cultGym()),
			};
		});
		expect(result.gym).toEqual(["2026-10-10"]);
		expect(result.item?.version).toBe(1);
	});

	test("a skipped date far ahead is accepted, like the next one", async () => {
		const ctx = goldenContext(golden.userId);
		const { result } = await asUser(golden.userId, (tx) =>
			skip(tx, ctx, netflix(), 1, { dueOn: "2027-11-05" }),
		);
		expect(result.skips).toEqual(["2027-11-05"]);
		expect(result.nextDueOn).toBe("2026-11-05");
	});

	test("a skip on a custom cadence's due date is accepted, and a day in between is not", async () => {
		const biweekly = await addSubscription(owner, custom, {
			startDate: "2026-10-01",
			cadence: { unit: "week", every: 2 },
			chargesFrom: "2026-10-01",
			lastChangeOn: "2026-10-01",
		});
		const ctx = goldenContext(custom);
		const { result } = await asUser(custom, async (tx) => ({
			between: await refusal(
				skip(tx, ctx, biweekly.id, 1, { dueOn: "2026-11-19" }),
			),
			due: await skip(tx, ctx, biweekly.id, 1, { dueOn: "2026-11-26" }),
		}));
		expect(result.between.fields).toEqual({
			dueOn: "Only an upcoming charge can be skipped.",
		});
		expect(result.due.skips).toEqual(["2026-11-26"]);
	});

	// AC-F05-18: 5 October, 2 November, and a date that is not due return 422.
	test("5 October (charged), a date on C, and a date that is not due are 422 on dueOn", async () => {
		const ctx = goldenContext(golden.userId);
		const { result } = await asUser(golden.userId, async (tx) => ({
			charged: await refusal(
				skip(tx, ctx, netflix(), 1, { dueOn: "2026-10-05" }),
			),
			notDue: await refusal(
				skip(tx, ctx, netflix(), 1, { dueOn: "2026-11-06" }),
			),
			onC: await refusal(skip(tx, ctx, sunrise(), 1, { dueOn: "2026-11-01" })),
			c: await refusal(
				skip(tx, ctx, golden.subscription("sunrise"), 1, {
					dueOn: "2026-11-02",
				}),
			),
		}));
		for (const refused of Object.values(result)) {
			expect(refused.code).toBe("validation_failed");
			expect(refused.fields).toEqual({
				dueOn: "Only an upcoming charge can be skipped.",
			});
		}
	});

	test("a date before chargesFrom or after the end date is not chargeable: 422", async () => {
		const ctx = goldenContext(golden.userId);
		const { result } = await asUser(golden.userId, async (tx) => {
			const ended = await changeSubscription(tx, ctx, netflix(), 1, {
				changedAt: GOLDEN_NOW,
				endDate: "2026-12-31",
			});
			return {
				afterEnd: await refusal(
					skip(tx, ctx, netflix(), ended.version, { dueOn: "2027-01-05" }),
				),
				onEnd: await skip(tx, ctx, netflix(), ended.version, {
					dueOn: "2026-12-05",
				}),
			};
		});
		expect(result.afterEnd.fields).toHaveProperty("dueOn");
		expect(result.onEnd.skips).toEqual(["2026-12-05"]);
	});

	test("a date before the start is 422", async () => {
		const ctx = goldenContext(golden.userId);
		const { result } = await asUser(golden.userId, async (tx) => {
			const moved = await changeSubscription(tx, ctx, netflix(), 1, {
				changedAt: GOLDEN_NOW,
				startDate: "2026-11-20",
			});
			return refusal(
				skip(tx, ctx, netflix(), moved.version, { dueOn: "2026-11-05" }),
			);
		});
		expect(result.fields).toHaveProperty("dueOn");
	});

	test("a date inside a pause is not chargeable, so it cannot be skipped", async () => {
		const ctx = goldenContext(golden.userId);
		const { result } = await asUser(golden.userId, async (tx) => {
			const paused = await changeSubscription(tx, ctx, netflix(), 1, {
				changedAt: GOLDEN_NOW,
				pause: { from: "2026-11-05", until: "2027-01-05" },
			});
			return {
				inside: await refusal(
					skip(tx, ctx, netflix(), paused.version, {
						dueOn: "2026-12-05",
					}),
				),
				after: await skip(tx, ctx, netflix(), paused.version, {
					dueOn: "2027-01-05",
				}),
			};
		});
		expect(result.inside.fields).toHaveProperty("dueOn");
		expect(result.after.skips).toEqual(["2027-01-05"]);
	});

	test("a refused skip changes nothing", async () => {
		const ctx = goldenContext(golden.userId);
		const { result } = await asUser(golden.userId, async (tx) => {
			await refusal(skip(tx, ctx, netflix(), 1, { dueOn: "2026-11-06" }));
			return {
				item: await getSubscriptionItem(tx, ctx, netflix()),
				skips: await skipsOf(tx, netflix()),
			};
		});
		expect(result.item).toMatchObject({
			version: 1,
			updatedAt: "2026-09-04T18:30:00.000Z",
		});
		expect(result.skips).toEqual([]);
	});

	test("a date that is already skipped answers the Subscription unchanged: same version, even for a past date", async () => {
		const ctx = goldenContext(golden.userId);
		const { result } = await asUser(golden.userId, async (tx) => ({
			gym: await skip(tx, ctx, cultGym(), 1, { dueOn: "2026-10-10" }),
			first: await skip(tx, ctx, netflix(), 1, { dueOn: "2026-11-05" }),
			again: await skip(tx, ctx, netflix(), 2, { dueOn: "2026-11-05" }),
		}));
		expect(result.gym).toMatchObject({ version: 1, skips: ["2026-10-10"] });
		expect(result.again).toEqual(result.first);
		expect(result.again.version).toBe(2);
	});

	test("a repeated skip with a stale version is still 409", async () => {
		const ctx = goldenContext(golden.userId);
		const { result } = await asUser(golden.userId, async (tx) => {
			await skip(tx, ctx, netflix(), 1, { dueOn: "2026-11-05" });
			return refusal(skip(tx, ctx, netflix(), 1, { dueOn: "2026-11-05" }));
		});
		expect(result.code).toBe("version_conflict");
	});

	// AC-F05-27: a late skip.
	test("a skip of 5 November with changedAt on 3 November, synced on the 6th after another device charged it, deletes that charge and writes the tombstone", async () => {
		const ctx = on(golden.userId, "2026-11-06");
		const { result } = await asUser(golden.userId, async (tx) => {
			await laterCharge(tx, golden.userId, netflix(), "2026-11-05");
			const answer = await skip(tx, ctx, netflix(), 1, {
				dueOn: "2026-11-05",
				changedAt: when("2026-11-03"),
			});
			await catchUpAll(tx, chargeContext(ctx));
			return { answer, dues: await dueOns(tx, netflix()) };
		});
		expect(result.answer.skips).toEqual(["2026-11-05"]);
		expect(result.answer.chargeCount).toBe(2);
		expect(result.dues).toEqual(["2026-09-05", "2026-10-05"]);
	});

	test("with that charge edited it is 422 and the charge stays", async () => {
		const ctx = on(golden.userId, "2026-11-06");
		const { result } = await asUser(golden.userId, async (tx) => {
			await laterCharge(tx, golden.userId, netflix(), "2026-11-05", {
				edited: true,
			});
			const refused = await refusal(
				skip(tx, ctx, netflix(), 1, {
					dueOn: "2026-11-05",
					changedAt: when("2026-11-03"),
				}),
			);
			return {
				refused,
				rows: await charges(tx, netflix()),
				skips: await skipsOf(tx, netflix()),
			};
		});
		expect(result.refused.fields).toEqual({
			dueOn: "This charge was edited, so it stays. Delete it in Transactions to skip it.",
		});
		expect(result.rows.map((row) => row.dueOn)).toContain("2026-11-05");
		expect(result.skips).toEqual([]);
	});

	test("a late skip made on the date itself is 422: C is that date, and it is not after C", async () => {
		const ctx = on(golden.userId, "2026-11-06");
		const { result } = await asUser(golden.userId, (tx) =>
			refusal(
				skip(tx, ctx, netflix(), 1, {
					dueOn: "2026-11-05",
					changedAt: when("2026-11-05"),
				}),
			),
		);
		expect(result.fields).toEqual({
			dueOn: "Only an upcoming charge can be skipped.",
		});
	});

	test("C never reaches back past lastChangeOn: a change made later moves it forward", async () => {
		const ctx = on(golden.userId, "2026-11-06");
		const { result } = await asUser(golden.userId, async (tx) => {
			const changed = await changeSubscription(tx, ctx, netflix(), 1, {
				changedAt: when("2026-11-05"),
				note: "x",
				name: "Netflix HD",
			});
			return refusal(
				skip(tx, ctx, netflix(), changed.version, {
					dueOn: "2026-11-05",
					changedAt: when("2026-11-03"),
				}),
			);
		});
		expect(result.fields).toHaveProperty("dueOn");
	});

	test("a skip leaves the other charges of the Subscription as they are", async () => {
		const ctx = goldenContext(golden.userId);
		const { result } = await asUser(golden.userId, async (tx) => {
			await skip(tx, ctx, netflix(), 1, { dueOn: "2026-11-05" });
			return charges(tx, netflix());
		});
		expect(result.map((row) => [row.dueOn, row.version])).toEqual([
			["2026-09-05", 1],
			["2026-10-05", 1],
		]);
	});
});

describe("bringing a skip back (BR-F05-27, AC-F05-18)", () => {
	test("an id or a date that is malformed is 404 before any statement", async () => {
		const ctx = goldenContext(golden.userId);
		const { result, statements } = await asUser(golden.userId, async (tx) => ({
			id: await refusal(unskip(tx, ctx, "nope", "2026-11-05", 1)),
			date: await refusal(unskip(tx, ctx, netflix(), "5-Nov", 1)),
			impossible: await refusal(unskip(tx, ctx, netflix(), "2026-02-30", 1)),
		}));
		expect(result.id.code).toBe("not_found");
		expect(result.date.code).toBe("not_found");
		expect(result.impossible.code).toBe("not_found");
		expect(statements).toBe(0);
	});

	test("a body that breaks the schema is 422 before any statement", async () => {
		const bodies: Record<string, unknown>[] = [
			{},
			{ changedAt: "x" },
			{ changedAt: GOLDEN_NOW, extra: 1 },
		];
		for (const body of bodies) {
			const { result, statements } = await asUser(golden.userId, (tx) =>
				refusal(
					unskipCharge(
						tx,
						goldenContext(golden.userId),
						netflix(),
						"2026-11-05",
						1,
						body,
					),
				),
			);
			expect(result.code).toBe("validation_failed");
			expect(statements).toBe(0);
		}
	});

	test("a changedAt out of its window is 422 on changedAt", async () => {
		const ctx = goldenContext(golden.userId);
		const old = new Date(ctx.now.getTime() - 91 * 86_400_000).toISOString();
		const { result } = await asUser(golden.userId, (tx) =>
			refusal(unskip(tx, ctx, netflix(), "2026-11-05", 1, { changedAt: old })),
		);
		expect(result.fields).toHaveProperty("changedAt");
	});

	test("a missing or another user's Subscription is 404, and a stale version is 409", async () => {
		const ctx = goldenContext(golden.userId);
		const { result } = await asUser(golden.userId, async (tx) => ({
			none: await refusal(
				unskip(tx, ctx, uuidV7At(GOLDEN_NOW), "2026-11-05", 1),
			),
			theirs: await refusal(
				unskip(tx, ctx, neighbour.subscription("netflix"), "2026-11-05", 1),
			),
			stale: await refusal(unskip(tx, ctx, netflix(), "2026-11-05", 3)),
		}));
		expect(result.none.code).toBe("not_found");
		expect(result.theirs.code).toBe("not_found");
		expect(result.stale.code).toBe("version_conflict");
		expect(result.stale.details).toMatchObject({
			current: { currency: "INR", version: 1 },
		});
	});

	test("a date with no tombstone answers the Subscription unchanged, whatever the date", async () => {
		const ctx = goldenContext(golden.userId);
		const { result } = await asUser(golden.userId, async (tx) => ({
			future: await unskip(tx, ctx, netflix(), "2026-11-05", 1),
			past: await unskip(tx, ctx, netflix(), "2026-10-05", 1),
			never: await unskip(tx, ctx, netflix(), "2031-01-01", 1),
		}));
		for (const answer of Object.values(result)) {
			expect(answer).toMatchObject({
				version: 1,
				skips: [],
				updatedAt: "2026-09-04T18:30:00.000Z",
			});
		}
	});

	// AC-F05-18: Undo skip on 3 November brings it back.
	test("Undo skip on 3 November brings 5 November back: next due is 5 November, version raised, lastChangeOn the same", async () => {
		const skipCtx = goldenContext(golden.userId);
		const undoCtx = on(golden.userId, "2026-11-03");
		const { result } = await asUser(golden.userId, async (tx) => {
			const skipped = await skip(tx, skipCtx, netflix(), 1, {
				dueOn: "2026-11-05",
			});
			return unskip(tx, undoCtx, netflix(), "2026-11-05", skipped.version, {
				changedAt: when("2026-11-03"),
			});
		});
		expect(result).toMatchObject({
			skips: [],
			nextDueOn: "2026-11-05",
			version: 3,
			lastChangeOn: "2026-09-05",
			chargeCount: 2,
		});
	});

	// AC-F05-18: Undo skip on 5 November returns 422.
	test("Undo skip on 5 November itself is 422 on dueOn, and the tombstone stays", async () => {
		const ctx = on(golden.userId, "2026-11-05");
		const { result } = await asUser(golden.userId, async (tx) => {
			await tombstone(tx, golden.userId, netflix(), "2026-11-05");
			const refused = await refusal(
				unskip(tx, ctx, netflix(), "2026-11-05", 1, {
					changedAt: when("2026-11-05"),
				}),
			);
			return { refused, skips: await skipsOf(tx, netflix()) };
		});
		expect(result.refused.fields).toEqual({
			dueOn: "This charge date has passed, so it can't be brought back.",
		});
		expect(result.skips).toEqual(["2026-11-05"]);
	});

	test("a skip whose date has passed stays for good: Cult Gym's 10 October tombstone", async () => {
		const ctx = goldenContext(golden.userId);
		const { result } = await asUser(golden.userId, async (tx) => ({
			refused: await refusal(unskip(tx, ctx, cultGym(), "2026-10-10", 1)),
			skips: await skipsOf(tx, cultGym()),
		}));
		expect(result.refused.fields).toHaveProperty("dueOn");
		expect(result.skips).toEqual(["2026-10-10"]);
	});

	// AC-F05-27: a late undo charges the date.
	test("Undo skip of 5 November with changedAt on 3 November, synced on the 6th, charges 5 November", async () => {
		const ctx = on(golden.userId, "2026-11-06");
		const { result } = await asUser(golden.userId, async (tx) => {
			await tombstone(tx, golden.userId, netflix(), "2026-11-05");
			const answer = await unskip(tx, ctx, netflix(), "2026-11-05", 1, {
				changedAt: when("2026-11-03"),
			});
			return { answer, rows: await charges(tx, netflix()) };
		});
		expect(result.answer).toMatchObject({
			skips: [],
			chargeCount: 3,
			version: 2,
		});
		expect(result.rows.find((row) => row.dueOn === "2026-11-05")).toMatchObject({
			amount: "64900",
			payee: "Netflix",
			edited: false,
			version: 1,
		});
	});

	test("the charge made by a late undo is at the current price and name", async () => {
		const ctx = on(golden.userId, "2026-11-06");
		const { result } = await asUser(golden.userId, async (tx) => {
			await tombstone(tx, golden.userId, netflix(), "2026-11-05");
			await tx.execute(
				// The Subscription was repriced meanwhile, as another device's change would have.
				(await import("drizzle-orm"))
					.sql`UPDATE app.subscriptions SET amount_minor = 79900,
					version = version + 1 WHERE id = ${netflix()}::uuid`,
			);
			await unskip(tx, ctx, netflix(), "2026-11-05", 2, {
				changedAt: when("2026-11-03"),
			});
			return charges(tx, netflix());
		});
		expect(result.find((row) => row.dueOn === "2026-11-05")?.amount).toBe(
			"79900",
		);
	});

	test("a tombstone after today is removed and no charge is made", async () => {
		const ctx = goldenContext(golden.userId);
		const { result } = await asUser(golden.userId, async (tx) => {
			const skipped = await skip(tx, ctx, netflix(), 1, {
				dueOn: "2026-12-05",
			});
			const answer = await unskip(
				tx,
				ctx,
				netflix(),
				"2026-12-05",
				skipped.version,
			);
			return { answer, rows: await dueOns(tx, netflix()) };
		});
		expect(result.answer.skips).toEqual([]);
		expect(result.rows).toEqual(["2026-09-05", "2026-10-05"]);
	});

	test("the other tombstones stay", async () => {
		const ctx = goldenContext(golden.userId);
		const { result } = await asUser(golden.userId, async (tx) => {
			await tombstone(tx, golden.userId, netflix(), "2026-12-05");
			await tombstone(tx, golden.userId, netflix(), "2027-01-05");
			return unskip(tx, ctx, netflix(), "2026-12-05", 1);
		});
		expect(result.skips).toEqual(["2027-01-05"]);
	});

	test("its catch-up also makes the charges missing through today", async () => {
		const missing = await goldenUser(owner, "sub-skips-unskip-catchup", {
			beforeCatchUp: true,
		});
		users.push(missing.userId);
		const ctx = goldenContext(missing.userId);
		const id = missing.subscription("sunrise");
		const { result } = await asUser(missing.userId, async (tx) => {
			await tombstone(tx, missing.userId, id, "2026-12-01");
			await unskip(tx, ctx, id, "2026-12-01", 1);
			return dueOns(tx, id);
		});
		// The run is today's catch-up for this Subscription, so 1 November is charged too.
		expect(result).toEqual(["2026-09-01", "2026-10-01", "2026-11-01"]);
	});

	test("a date inside a pause comes back as a date but stays uncharged", async () => {
		const ctx = on(golden.userId, "2026-12-10");
		const { result } = await asUser(golden.userId, async (tx) => {
			await tombstone(tx, golden.userId, netflix(), "2026-12-05");
			await tx.execute(
				sql`UPDATE app.subscriptions
				SET pause_from = '2026-11-05', pause_until = '2027-01-05' WHERE id = ${netflix()}::uuid`,
			);
			const answer = await unskip(tx, ctx, netflix(), "2026-12-05", 1, {
				changedAt: when("2026-11-03"),
			});
			return { answer, rows: await dueOns(tx, netflix()) };
		});
		expect(result.answer.skips).toEqual([]);
		expect(result.rows).toEqual(["2026-09-05", "2026-10-05"]);
	});
});

describe("locks (SRV-7, BR-F05-08 step 1)", () => {
	test("a skip that waits for a lock sees a tombstone the holder committed: the repeated skip is unchanged", async () => {
		const user = await goldenUser(owner, "sub-skips-lock-same");
		users.push(user.userId);
		const ctx = goldenContext(user.userId);
		const id = user.subscription("netflix");
		const result = await holdingLock(
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
			},
			() =>
				withUser({ user: ctx.user }, "write", (tx) =>
					skip(tx, ctx, id, 1, { dueOn: "2026-11-05" }),
				),
		);
		expect(result).toMatchObject({ skips: ["2026-11-05"], version: 1 });
	}, 60_000);

	test("a skip that waits for a lock is 409 when the holder changed the Subscription", async () => {
		const user = await goldenUser(owner, "sub-skips-lock-version");
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
						skip(tx, ctx, id, 1, { dueOn: "2026-11-05" }),
					),
				),
		);
		expect(refused.code).toBe("version_conflict");
		const { rows } = await owner.query(
			"SELECT 1 FROM app.subscription_skips WHERE subscription_id = $1",
			[id],
		);
		expect(rows).toHaveLength(0);
	}, 60_000);

	test("two skips of the same date at the same version: one commits, the other is 409, and one tombstone is written", async () => {
		const user = await goldenUser(owner, "sub-skips-race");
		users.push(user.userId);
		const ctx = goldenContext(user.userId);
		const id = user.subscription("netflix");
		const settled = await Promise.allSettled([
			withUser({ user: ctx.user }, "write", (tx) =>
				skip(tx, ctx, id, 1, { dueOn: "2026-11-05" }),
			),
			withUser({ user: ctx.user }, "write", (tx) =>
				skip(tx, ctx, id, 1, { dueOn: "2026-11-05" }),
			),
		]);
		expect(settled.filter((s) => s.status === "fulfilled")).toHaveLength(1);
		const failed = settled.filter(
			(s) => s.status === "rejected",
		) as PromiseRejectedResult[];
		expect(failed[0]?.reason).toMatchObject({ code: "version_conflict" });
		const { rows } = await owner.query(
			"SELECT 1 FROM app.subscription_skips WHERE subscription_id = $1",
			[id],
		);
		expect(rows).toHaveLength(1);
	}, 60_000);
});
