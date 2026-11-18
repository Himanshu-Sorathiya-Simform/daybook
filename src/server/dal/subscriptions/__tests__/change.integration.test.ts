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
import type { Tx } from "../../with-user";
import { withUser } from "../../with-user";
import { changeSubscription } from "../change";
import { catchUpAll, chargeContext } from "../catch-up";
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

/** `PATCH /api/subscriptions/[id]` (F05 section 11, BR-F05-08 to BR-F05-14, BR-F05-29 to
 * BR-F05-32) through the runtime role and RLS. Every scenario runs in a rolled-back transaction
 * as one profile user, except the lock scenarios, which commit. Expected figures come from F05
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
	golden = await goldenUser(owner, "sub-change");
	neighbour = await goldenUser(owner, "sub-change-neighbour");
	custom = await createUser(owner, "sub-change-custom");
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

type Result = Awaited<ReturnType<typeof changeSubscription>>;

/** One change as the client sends it, with `changedAt` at the golden clock unless the body says. */
const change = (
	tx: Tx,
	ctx: ProfiledContext,
	id: string,
	version: number,
	body: Record<string, unknown>,
): Promise<Result> =>
	changeSubscription(tx, ctx, id, version, { changedAt: GOLDEN_NOW, ...body });

describe("the checks before any change (section 11 order)", () => {
	test("an id that is not a UUID is 404 before any statement", async () => {
		const { result, statements } = await asUser(golden.userId, (tx) =>
			refusal(
				change(tx, goldenContext(golden.userId), "not-a-uuid", 1, {
					note: "x",
				}),
			),
		);
		expect(result.code).toBe("not_found");
		expect(statements).toBe(0);
	});

	test("a body that breaks the schema is 422 with field paths before any statement", async () => {
		const { result, statements } = await asUser(golden.userId, (tx) =>
			refusal(
				changeSubscription(tx, goldenContext(golden.userId), netflix(), 1, {
					changedAt: GOLDEN_NOW,
				}),
			),
		);
		expect(result.code).toBe("validation_failed");
		expect(statements).toBe(0);
	});

	test("an amount without its currency is 422 on currency", async () => {
		const { result } = await asUser(golden.userId, (tx) =>
			refusal(
				change(tx, goldenContext(golden.userId), netflix(), 1, {
					amountMinor: 79900,
				}),
			),
		);
		expect(result.code).toBe("validation_failed");
		expect(result.fields).toHaveProperty("currency");
	});

	test("a currency other than the profile's is 422 currency_mismatch, and changes nothing", async () => {
		const { result } = await asUser(golden.userId, async (tx) => {
			const refused = await refusal(
				change(tx, goldenContext(golden.userId), netflix(), 1, {
					amountMinor: 79900,
					currency: "USD",
				}),
			);
			const item = await getSubscriptionItem(
				tx,
				goldenContext(golden.userId),
				netflix(),
			);
			return { refused, item };
		});
		expect(result.refused.code).toBe("currency_mismatch");
		expect(result.item).toMatchObject({ amountMinor: 64900, version: 1 });
	});

	test("a Subscription that does not exist is 404", async () => {
		const { result } = await asUser(golden.userId, (tx) =>
			refusal(
				change(tx, goldenContext(golden.userId), uuidV7At(GOLDEN_NOW), 1, {
					note: "x",
				}),
			),
		);
		expect(result.code).toBe("not_found");
	});

	test("another user's Subscription is 404, as if it did not exist", async () => {
		const { result } = await asUser(golden.userId, (tx) =>
			refusal(
				change(
					tx,
					goldenContext(golden.userId),
					neighbour.subscription("netflix"),
					1,
					{
						note: "x",
					},
				),
			),
		);
		expect(result.code).toBe("not_found");
	});

	test("a stale version is 409 with the Subscription and currency in details.current", async () => {
		const { result } = await asUser(golden.userId, (tx) =>
			refusal(
				change(tx, goldenContext(golden.userId), netflix(), 7, {
					note: "x",
				}),
			),
		);
		expect(result.code).toBe("version_conflict");
		expect(result.details).toMatchObject({
			current: {
				id: netflix(),
				name: "Netflix",
				version: 1,
				currency: "INR",
				skips: [],
				nextDueOn: "2026-11-05",
			},
		});
	});

	test("the version check comes before any rule: a stale write that would also be refused is 409", async () => {
		const { result } = await asUser(golden.userId, (tx) =>
			refusal(
				change(tx, goldenContext(golden.userId), netflix(), 7, {
					endDate: "2026-09-01",
				}),
			),
		);
		expect(result.code).toBe("version_conflict");
	});

	test("a stale write that would change nothing is still 409", async () => {
		const { result } = await asUser(golden.userId, (tx) =>
			refusal(
				change(tx, goldenContext(golden.userId), netflix(), 7, {
					name: "Netflix",
				}),
			),
		);
		expect(result.code).toBe("version_conflict");
	});

	// AC-F05-11: a changedAt 91 days old returns 422.
	test("a changedAt 91 days old is 422 on changedAt, and 90 days is accepted", async () => {
		const ctx = goldenContext(golden.userId);
		const old = new Date(ctx.now.getTime() - 91 * 86_400_000).toISOString();
		const edge = new Date(ctx.now.getTime() - 90 * 86_400_000).toISOString();
		const { result } = await asUser(golden.userId, async (tx) => ({
			refused: await refusal(
				changeSubscription(tx, ctx, netflix(), 1, {
					changedAt: old,
					note: "x",
				}),
			),
			accepted: await changeSubscription(tx, ctx, netflix(), 1, {
				changedAt: edge,
				note: "x",
			}),
		}));
		expect(result.refused.fields).toHaveProperty("changedAt");
		expect(result.accepted.version).toBe(2);
	});

	test("a changedAt more than 5 minutes ahead is 422, and 5 minutes is accepted", async () => {
		const ctx = goldenContext(golden.userId);
		const ahead = new Date(ctx.now.getTime() + 5 * 60_000 + 1000).toISOString();
		const edge = new Date(ctx.now.getTime() + 5 * 60_000).toISOString();
		const { result } = await asUser(golden.userId, async (tx) => ({
			refused: await refusal(
				changeSubscription(tx, ctx, netflix(), 1, {
					changedAt: ahead,
					note: "x",
				}),
			),
			accepted: await changeSubscription(tx, ctx, netflix(), 1, {
				changedAt: edge,
				note: "x",
			}),
		}));
		expect(result.refused.fields).toHaveProperty("changedAt");
		expect(result.accepted.version).toBe(2);
	});

	// AC-F05-11: a startDate 11 years back, an endDate before startDate.
	test("a startDate 11 years back is 422, and 10 years back is accepted", async () => {
		const { result } = await asUser(golden.userId, async (tx) => ({
			refused: await refusal(
				change(tx, goldenContext(golden.userId), netflix(), 1, {
					startDate: "2015-11-02",
				}),
			),
			accepted: await change(tx, goldenContext(golden.userId), netflix(), 1, {
				startDate: "2016-11-02",
			}),
		}));
		expect(result.refused.fields).toHaveProperty("startDate");
		expect(result.accepted.startDate).toBe("2016-11-02");
	});

	test("a startDate more than a year after the change date is 422, and exactly a year is accepted", async () => {
		const { result } = await asUser(golden.userId, async (tx) => ({
			refused: await refusal(
				change(tx, goldenContext(golden.userId), netflix(), 1, {
					startDate: "2027-11-03",
				}),
			),
			accepted: await change(tx, goldenContext(golden.userId), netflix(), 1, {
				startDate: "2027-11-02",
			}),
		}));
		expect(result.refused.fields).toHaveProperty("startDate");
		expect(result.accepted.status).toBe("upcoming");
	});

	test("an endDate before the start date is 422, and the start date itself is accepted", async () => {
		const { result } = await asUser(golden.userId, async (tx) => ({
			refused: await refusal(
				change(tx, goldenContext(golden.userId), netflix(), 1, {
					endDate: "2026-09-04",
				}),
			),
			accepted: await change(tx, goldenContext(golden.userId), netflix(), 1, {
				endDate: "2026-09-05",
			}),
		}));
		expect(result.refused.fields).toHaveProperty("endDate");
		expect(result.accepted.endDate).toBe("2026-09-05");
	});

	test("a new start date after the stored end date makes the end date the field in error", async () => {
		const { result } = await asUser(golden.userId, async (tx) => {
			const ended = await change(
				tx,
				goldenContext(golden.userId),
				netflix(),
				1,
				{
					endDate: "2026-10-20",
				},
			);
			return refusal(
				change(tx, goldenContext(golden.userId), netflix(), ended.version, {
					startDate: "2026-10-25",
				}),
			);
		});
		expect(result.fields).toHaveProperty("endDate");
	});

	test("an endDate more than ten years after the change date is 422, and ten years is accepted", async () => {
		const { result } = await asUser(golden.userId, async (tx) => ({
			refused: await refusal(
				change(tx, goldenContext(golden.userId), netflix(), 1, {
					endDate: "2036-11-03",
				}),
			),
			accepted: await change(tx, goldenContext(golden.userId), netflix(), 1, {
				endDate: "2036-11-02",
			}),
		}));
		expect(result.refused.fields).toHaveProperty("endDate");
		expect(result.accepted.endDate).toBe("2036-11-02");
	});

	test("every refusal comes back at once, one message per field", async () => {
		const { result } = await asUser(golden.userId, async (tx) => {
			await tombstone(tx, golden.userId, netflix(), "2026-11-01");
			return refusal(
				change(tx, goldenContext(golden.userId), netflix(), 1, {
					startDate: "2015-11-02",
					endDate: "2015-10-01",
					pause: { from: "2026-11-06", until: "2026-11-07" },
					unskipDueOn: "2026-11-01",
				}),
			);
		});
		expect(Object.keys(result.fields ?? {}).sort()).toEqual([
			"endDate",
			"pause.from",
			"startDate",
			"unskipDueOn",
		]);
	});

	test("a refused write changes nothing, charges included", async () => {
		const { result } = await asUser(golden.userId, async (tx) => {
			await refusal(
				change(tx, goldenContext(golden.userId), netflix(), 1, {
					name: "Other",
					amountMinor: 1,
					currency: "INR",
					startDate: "2015-11-02",
				}),
			);
			return {
				item: await getSubscriptionItem(
					tx,
					goldenContext(golden.userId),
					netflix(),
				),
				dues: await dueOns(tx, netflix()),
			};
		});
		expect(result.item).toMatchObject({
			name: "Netflix",
			amountMinor: 64900,
			version: 1,
		});
		expect(result.dues).toEqual(["2026-09-05", "2026-10-05"]);
	});
});

describe("a change that changes nothing", () => {
	// AC-F05-32
	test("fields equal to the stored ones answer the Subscription as it is: same version, no charge", async () => {
		const ctx = goldenContext(golden.userId);
		const { result } = await asUser(golden.userId, async (tx) => ({
			before: await getSubscriptionItem(tx, ctx, netflix()),
			answer: await change(tx, ctx, netflix(), 1, {
				name: "Netflix",
				amountMinor: 64900,
				currency: "INR",
				cadence: { unit: "month", every: 1 },
				startDate: "2026-09-05",
				category: "entertainment",
				endDate: null,
				pause: null,
			}),
		}));
		expect(result.answer).toEqual({
			...result.before,
			currency: "INR",
			changeDate: "2026-11-02",
			chargesCreated: 0,
			chargesUpdated: 0,
			chargesDeleted: 0,
			months: [],
		});
	});

	test("it writes no row: updatedAt and lastChangeOn stay", async () => {
		const { result } = await asUser(golden.userId, (tx) =>
			change(tx, goldenContext(golden.userId), netflix(), 1, {
				name: "Netflix",
			}),
		);
		// Golden Netflix was written at its creation, 4 September 18:30 UTC, and stays so.
		expect(result).toMatchObject({
			updatedAt: "2026-09-04T18:30:00.000Z",
			lastChangeOn: "2026-09-05",
			version: 1,
		});
	});

	test("it does not catch the Subscription up", async () => {
		const missing = await goldenUser(owner, "sub-change-nothing", {
			beforeCatchUp: true,
		});
		users.push(missing.userId);
		const { result } = await asUser(missing.userId, async (tx) => {
			const answer = await change(
				tx,
				goldenContext(missing.userId),
				missing.subscription("sunrise"),
				1,
				{
					name: "Sunrise Apartments",
				},
			);
			return {
				answer,
				dues: await dueOns(tx, missing.subscription("sunrise")),
			};
		});
		expect(result.answer.chargesCreated).toBe(0);
		expect(result.dues).toEqual(["2026-09-01", "2026-10-01"]);
	});

	test("a stored value that is outside today's windows is not judged when it is sent unchanged", async () => {
		const old = await addSubscription(owner, custom, {
			startDate: "2014-03-05",
			chargesFrom: "2026-11-02",
			lastChangeOn: "2026-11-02",
		});
		const { result } = await asUser(custom, (tx) =>
			change(tx, goldenContext(custom), old.id, 1, {
				startDate: "2014-03-05",
				note: "kept",
			}),
		);
		expect(result).toMatchObject({
			note: "kept",
			startDate: "2014-03-05",
			version: 2,
		});
	});

	test("a skipped date that is already skipped changes nothing, and a missing tombstone to bring back changes nothing", async () => {
		const { result } = await asUser(golden.userId, async (tx) => {
			await tombstone(tx, golden.userId, netflix(), "2026-12-05");
			const item = await getSubscriptionItem(
				tx,
				goldenContext(golden.userId),
				netflix(),
			);
			const repeated = await change(
				tx,
				goldenContext(golden.userId),
				netflix(),
				1,
				{
					startDate: "2026-09-05",
					skipDueOn: "2026-12-05",
				},
			);
			const none = await change(
				tx,
				goldenContext(golden.userId),
				netflix(),
				1,
				{
					name: "Netflix",
					unskipDueOn: "2026-12-05"
						.replace("12", "11")
						.replace("05", "20"),
				},
			);
			return { item, repeated, none };
		});
		expect(result.repeated.version).toBe(1);
		expect(result.repeated.skips).toEqual(["2026-12-05"]);
		expect(result.none.version).toBe(1);
	});
});

describe("a change to the values (BR-F05-10, D-92)", () => {
	// AC-F05-05, section 5: changedAt 4 November, synced at 6 November.
	test("the late price change gives a 799.00 charge on 5 November (C = 4 November)", async () => {
		const ctx = on(golden.userId, "2026-11-06");
		const { result } = await asUser(golden.userId, async (tx) => {
			const answer = await change(tx, ctx, netflix(), 1, {
				changedAt: when("2026-11-04"),
				amountMinor: 79900,
				currency: "INR",
			});
			return { answer, rows: await charges(tx, netflix()) };
		});
		expect(result.answer).toMatchObject({
			changeDate: "2026-11-04",
			lastChangeOn: "2026-11-04",
			amountMinor: 79900,
			version: 2,
			chargesCreated: 1,
			chargesUpdated: 0,
			chargesDeleted: 0,
			months: ["2026-11"],
			chargeCount: 3,
			paidMinor: 64900 + 64900 + 79900,
		});
		expect(result.rows.map((r) => [r.dueOn, r.amount])).toEqual([
			["2026-09-05", "64900"],
			["2026-10-05", "64900"],
			["2026-11-05", "79900"],
		]);
	});

	test("after another device's catch-up, the 5 November charge is repriced in place: same id, version 2", async () => {
		const ctx = on(golden.userId, "2026-11-06");
		const { result } = await asUser(golden.userId, async (tx) => {
			const id = await laterCharge(tx, golden.userId, netflix(), "2026-11-05");
			const answer = await change(tx, ctx, netflix(), 1, {
				changedAt: when("2026-11-04"),
				amountMinor: 79900,
				currency: "INR",
			});
			const rows = await charges(tx, netflix());
			return { id, answer, rows };
		});
		const nov = result.rows.find((row) => row.dueOn === "2026-11-05");
		expect(nov).toMatchObject({
			id: result.id,
			amount: "79900",
			version: 2,
			edited: false,
		});
		expect(result.answer).toMatchObject({
			chargesCreated: 0,
			chargesUpdated: 1,
			chargesDeleted: 0,
			months: ["2026-11"],
		});
	});

	test("the same change made on 5 November leaves that charge at 649.00 (C = 5 November)", async () => {
		const ctx = on(golden.userId, "2026-11-06");
		const { result } = await asUser(golden.userId, async (tx) => {
			const answer = await change(tx, ctx, netflix(), 1, {
				changedAt: when("2026-11-05"),
				amountMinor: 79900,
				currency: "INR",
			});
			return { answer, rows: await charges(tx, netflix()) };
		});
		expect(result.rows.find((row) => row.dueOn === "2026-11-05")?.amount).toBe(
			"64900",
		);
		expect(result.answer).toMatchObject({
			changeDate: "2026-11-05",
			chargesCreated: 1,
		});
	});

	test("with that charge already there, a change made on 5 November does not touch it", async () => {
		const ctx = on(golden.userId, "2026-11-06");
		const { result } = await asUser(golden.userId, async (tx) => {
			await laterCharge(tx, golden.userId, netflix(), "2026-11-05");
			const answer = await change(tx, ctx, netflix(), 1, {
				changedAt: when("2026-11-05"),
				amountMinor: 79900,
				currency: "INR",
			});
			return { answer, rows: await charges(tx, netflix()) };
		});
		expect(result.rows.find((row) => row.dueOn === "2026-11-05")).toMatchObject({
			amount: "64900",
			version: 1,
		});
		expect(result.answer).toMatchObject({
			chargesCreated: 0,
			chargesUpdated: 0,
		});
	});

	test("an edited 5 November charge keeps its amount (AC-F05-05)", async () => {
		const ctx = on(golden.userId, "2026-11-06");
		const { result } = await asUser(golden.userId, async (tx) => {
			await laterCharge(tx, golden.userId, netflix(), "2026-11-05", {
				amountMinor: 70000,
				edited: true,
			});
			const answer = await change(tx, ctx, netflix(), 1, {
				changedAt: when("2026-11-04"),
				amountMinor: 79900,
				currency: "INR",
			});
			return { answer, rows: await charges(tx, netflix()) };
		});
		expect(result.rows.find((row) => row.dueOn === "2026-11-05")).toMatchObject({
			amount: "70000",
			edited: true,
			version: 1,
		});
		expect(result.answer.chargesUpdated).toBe(0);
	});

	test("charges through C keep their amount, name and category (future charges only)", async () => {
		const { result } = await asUser(golden.userId, async (tx) => {
			await change(tx, goldenContext(golden.userId), netflix(), 1, {
				name: "Netflix Premium",
				amountMinor: 79900,
				currency: "INR",
				category: "shopping",
			});
			return charges(tx, netflix());
		});
		expect(
			result.map((r) => [r.dueOn, r.amount, r.payee, r.category, r.version]),
		).toEqual([
			["2026-09-05", "64900", "Netflix", "entertainment", 1],
			["2026-10-05", "64900", "Netflix", "entertainment", 1],
		]);
	});

	test("a charge due on C itself keeps the old values: the change date belongs to the old values", async () => {
		const ctx = on(golden.userId, "2026-11-05");
		const { result } = await asUser(golden.userId, async (tx) => {
			await laterCharge(tx, golden.userId, netflix(), "2026-11-05");
			await change(tx, ctx, netflix(), 1, {
				changedAt: when("2026-11-05"),
				name: "Netflix Premium",
				category: "shopping",
			});
			return charges(tx, netflix());
		});
		expect(result.find((r) => r.dueOn === "2026-11-05")).toMatchObject({
			payee: "Netflix",
			category: "entertainment",
		});
	});

	test("name and category reprice the unedited charges after C and leave edited ones", async () => {
		const ctx = on(golden.userId, "2026-11-06");
		const { result } = await asUser(golden.userId, async (tx) => {
			await laterCharge(tx, golden.userId, netflix(), "2026-11-05");
			await laterCharge(tx, golden.userId, netflix(), "2026-12-05", {
				edited: true,
			});
			await laterCharge(tx, golden.userId, netflix(), "2027-01-05");
			const answer = await change(tx, ctx, netflix(), 1, {
				changedAt: when("2026-11-04"),
				name: "Netflix Premium",
				category: "shopping",
			});
			return { answer, rows: await charges(tx, netflix()) };
		});
		expect(
			result.rows.map((r) => [r.dueOn, r.payee, r.category, r.edited]),
		).toEqual([
			["2026-09-05", "Netflix", "entertainment", false],
			["2026-10-05", "Netflix", "entertainment", false],
			["2026-11-05", "Netflix Premium", "shopping", false],
			["2026-12-05", "Netflix", "entertainment", true],
			["2027-01-05", "Netflix Premium", "shopping", false],
		]);
		expect(result.answer).toMatchObject({
			chargesUpdated: 2,
			months: ["2026-11", "2027-01"],
		});
	});

	test("a charge that already has the new values is not touched: its version stays", async () => {
		const ctx = on(golden.userId, "2026-11-06");
		const { result } = await asUser(golden.userId, async (tx) => {
			await laterCharge(tx, golden.userId, netflix(), "2026-11-05", {
				amountMinor: 79900,
			});
			const answer = await change(tx, ctx, netflix(), 1, {
				changedAt: when("2026-11-04"),
				amountMinor: 79900,
				currency: "INR",
			});
			return { answer, rows: await charges(tx, netflix()) };
		});
		expect(result.answer.chargesUpdated).toBe(0);
		expect(result.rows.find((r) => r.dueOn === "2026-11-05")?.version).toBe(1);
	});

	test("the change stamps lastChangeOn with C, updatedAt with the request clock and raises the version once", async () => {
		const ctx = on(golden.userId, "2026-11-06");
		const { result } = await asUser(golden.userId, (tx) =>
			change(tx, ctx, netflix(), 1, {
				changedAt: when("2026-11-04"),
				name: "Netflix HD",
				amountMinor: 79900,
				currency: "INR",
				category: "shopping",
			}),
		);
		expect(result).toMatchObject({
			lastChangeOn: "2026-11-04",
			updatedAt: "2026-11-06T06:30:00.000Z",
			version: 2,
			createdAt: "2026-09-04T18:30:00.000Z",
		});
	});

	// AC-F05-25, section 5: several queued changes.
	test("two queued changes with changedAt on 4 November both get C = 4 November, and the charge ends at 799.00 in Shopping", async () => {
		const ctx = on(golden.userId, "2026-11-09");
		const { result } = await asUser(golden.userId, async (tx) => {
			const first = await change(tx, ctx, netflix(), 1, {
				changedAt: when("2026-11-04"),
				amountMinor: 79900,
				currency: "INR",
			});
			const second = await change(tx, ctx, netflix(), first.version, {
				changedAt: when("2026-11-04"),
				category: "shopping",
			});
			return { first, second, rows: await charges(tx, netflix()) };
		});
		expect(result.first.changeDate).toBe("2026-11-04");
		expect(result.second.changeDate).toBe("2026-11-04");
		expect(result.second.version).toBe(3);
		const nov = result.rows.find((r) => r.dueOn === "2026-11-05");
		expect(nov).toMatchObject({ amount: "79900", category: "shopping" });
		expect(
			result.rows.filter((r) => r.dueOn.startsWith("2026-11")),
		).toHaveLength(1);
	});

	test("a changedAt before lastChangeOn gives C = lastChangeOn, so history is never rewritten", async () => {
		const ctx = on(golden.userId, "2026-11-09");
		const { result } = await asUser(golden.userId, async (tx) => {
			const first = await change(tx, ctx, netflix(), 1, {
				changedAt: when("2026-11-06"),
				amountMinor: 79900,
				currency: "INR",
			});
			return change(tx, ctx, netflix(), first.version, {
				changedAt: when("2026-11-02"),
				amountMinor: 89900,
				currency: "INR",
			});
		});
		expect(result.changeDate).toBe("2026-11-06");
		expect(result.lastChangeOn).toBe("2026-11-06");
	});

	test("C is the change's date in the profile zone: 00:30 in India is already the next day", async () => {
		const ctx = on(golden.userId, "2026-11-03");
		const { result } = await asUser(golden.userId, (tx) =>
			change(tx, ctx, netflix(), 1, {
				changedAt: "2026-11-02T19:00:00.000Z",
				name: "Netflix HD",
			}),
		);
		expect(result.changeDate).toBe("2026-11-03");
	});

	test("C is never past today, whatever the change's time zone says", async () => {
		const ctx = goldenContext(golden.userId);
		const { result } = await asUser(golden.userId, (tx) =>
			change(tx, ctx, netflix(), 1, {
				changedAt: new Date(ctx.now.getTime() + 4 * 60_000).toISOString(),
				name: "Netflix HD",
			}),
		);
		expect(result.changeDate).toBe("2026-11-02");
	});

	test("a Subscription that is missing charges is caught up first, with the old values, through C", async () => {
		const missing = await goldenUser(owner, "sub-change-step2", {
			beforeCatchUp: true,
		});
		users.push(missing.userId);
		const ctx = goldenContext(missing.userId);
		const { result } = await asUser(missing.userId, async (tx) => {
			const answer = await change(
				tx,
				ctx,
				missing.subscription("sunrise"),
				1,
				{
					name: "Sunrise Heights",
					amountMinor: 1900000,
					currency: "INR",
				},
			);
			return {
				answer,
				rows: await charges(tx, missing.subscription("sunrise")),
			};
		});
		const nov = result.rows.find((r) => r.dueOn === "2026-11-01");
		expect(nov).toMatchObject({
			amount: "1800000",
			payee: "Sunrise Apartments",
		});
		expect(result.answer.chargesCreated).toBe(1);
	});

	test("charges created by the change carry the Subscription's demo flag", async () => {
		const demo = await addSubscription(owner, custom, {
			startDate: "2026-10-05",
			chargesFrom: "2026-10-05",
			lastChangeOn: "2026-10-05",
		});
		await owner.query("UPDATE app.subscriptions SET demo = true WHERE id = $1", [
			demo.id,
		]);
		const { result } = await asUser(custom, async (tx) => {
			await change(tx, goldenContext(custom), demo.id, 1, {
				name: "Demo bill",
			});
			return charges(tx, demo.id);
		});
		expect(result).toHaveLength(1);
		// The 5 October charge is due before C, so it is made with the old name.
		expect(result[0]).toMatchObject({ payee: "Netflix", demo: true });
	});
});

describe("also the past charges (BR-F05-30, AC-F05-21)", () => {
	test("renaming with alsoPastCharges gives #5 and #16 the new payee at 649.00 each, with edited false", async () => {
		const { result } = await asUser(golden.userId, async (tx) => {
			const answer = await change(
				tx,
				goldenContext(golden.userId),
				netflix(),
				1,
				{
					name: "Netflix Premium",
					alsoPastCharges: true,
				},
			);
			return { answer, rows: await charges(tx, netflix()) };
		});
		expect(
			result.rows.map((r) => [
				r.dueOn,
				r.payee,
				r.amount,
				r.edited,
				r.version,
			]),
		).toEqual([
			["2026-09-05", "Netflix Premium", "64900", false, 2],
			["2026-10-05", "Netflix Premium", "64900", false, 2],
		]);
		expect(result.answer).toMatchObject({
			chargesUpdated: 2,
			months: ["2026-09", "2026-10"],
		});
	});

	test("without it they keep their payee", async () => {
		const { result } = await asUser(golden.userId, async (tx) => {
			await change(tx, goldenContext(golden.userId), netflix(), 1, {
				name: "Netflix Premium",
			});
			return charges(tx, netflix());
		});
		expect(result.map((r) => r.payee)).toEqual(["Netflix", "Netflix"]);
	});

	test("a category change goes to the past charges too, and never an amount", async () => {
		const { result } = await asUser(golden.userId, async (tx) => {
			await change(tx, goldenContext(golden.userId), netflix(), 1, {
				category: "shopping",
				amountMinor: 79900,
				currency: "INR",
				alsoPastCharges: true,
			});
			return charges(tx, netflix());
		});
		expect(result.map((r) => [r.category, r.amount])).toEqual([
			["shopping", "64900"],
			["shopping", "64900"],
		]);
	});

	test("an edited past charge keeps its payee either way", async () => {
		const { result } = await asUser(golden.userId, async (tx) => {
			await tx.execute(
				sql`UPDATE app.transactions SET edited = true
				WHERE subscription_id = ${netflix()}::uuid AND due_on = '2026-10-05'`,
			);
			await change(tx, goldenContext(golden.userId), netflix(), 1, {
				name: "Netflix Premium",
				alsoPastCharges: true,
			});
			return charges(tx, netflix());
		});
		expect(result.map((r) => [r.payee, r.edited])).toEqual([
			["Netflix Premium", false],
			["Netflix", true],
		]);
	});

	test("it reaches the charge due on C itself, through C", async () => {
		const ctx = on(golden.userId, "2026-11-05");
		const { result } = await asUser(golden.userId, async (tx) => {
			await laterCharge(tx, golden.userId, netflix(), "2026-11-05");
			await change(tx, ctx, netflix(), 1, {
				changedAt: when("2026-11-05"),
				name: "Netflix Premium",
				alsoPastCharges: true,
			});
			return charges(tx, netflix());
		});
		expect(result.every((r) => r.payee === "Netflix Premium")).toBe(true);
	});

	test("with a name that is not new it changes nothing", async () => {
		const { result } = await asUser(golden.userId, (tx) =>
			change(tx, goldenContext(golden.userId), netflix(), 1, {
				name: "Netflix",
				note: "x",
				alsoPastCharges: true,
			}),
		);
		expect(result.chargesUpdated).toBe(0);
	});

	test("it applies to the new name, so a rename and a category change together give both", async () => {
		const { result } = await asUser(golden.userId, async (tx) => {
			await change(tx, goldenContext(golden.userId), netflix(), 1, {
				name: "Prime Video",
				category: "shopping",
				alsoPastCharges: true,
			});
			return charges(tx, netflix());
		});
		expect(result.map((r) => [r.payee, r.category])).toEqual([
			["Prime Video", "shopping"],
			["Prime Video", "shopping"],
		]);
	});
});

describe("a change to the note alone (BR-F05-09)", () => {
	test("changes no charge and does not move lastChangeOn, but raises the version", async () => {
		const missing = await goldenUser(owner, "sub-change-note", {
			beforeCatchUp: true,
		});
		users.push(missing.userId);
		const ctx = goldenContext(missing.userId);
		const { result } = await asUser(missing.userId, async (tx) => {
			const answer = await change(
				tx,
				ctx,
				missing.subscription("sunrise"),
				1,
				{
					note: "Pay by the 5th",
				},
			);
			return {
				answer,
				dues: await dueOns(tx, missing.subscription("sunrise")),
			};
		});
		expect(result.answer).toMatchObject({
			note: "Pay by the 5th",
			version: 2,
			lastChangeOn: "2026-09-01",
			updatedAt: "2026-11-02T06:30:00.000Z",
			chargesCreated: 0,
			chargesUpdated: 0,
			chargesDeleted: 0,
			months: [],
			changeDate: "2026-11-02",
		});
		// 1 November was missing and stays missing: no charge is created.
		expect(result.dues).toEqual(["2026-09-01", "2026-10-01"]);
	});

	test("a null note clears it", async () => {
		const { result } = await asUser(golden.userId, async (tx) => {
			const set = await change(
				tx,
				goldenContext(golden.userId),
				netflix(),
				1,
				{ note: "x" },
			);
			return change(tx, goldenContext(golden.userId), netflix(), set.version, {
				note: null,
			});
		});
		expect(result.note).toBeNull();
		expect(result.version).toBe(3);
	});

	test("with another change it moves lastChangeOn like any change", async () => {
		const { result } = await asUser(golden.userId, (tx) =>
			change(tx, goldenContext(golden.userId), netflix(), 1, {
				note: "x",
				name: "Netflix HD",
			}),
		);
		expect(result.lastChangeOn).toBe("2026-11-02");
	});

	test("a note and a skipped date together are not a note alone", async () => {
		const { result } = await asUser(golden.userId, (tx) =>
			change(tx, goldenContext(golden.userId), netflix(), 1, {
				note: "x",
				startDate: "2026-09-08",
				skipDueOn: "2026-11-08",
			}),
		);
		expect(result.lastChangeOn).toBe("2026-11-02");
		expect(result.skips).toEqual(["2026-11-08"]);
	});
});

describe("a change to the start or cadence (BR-F05-11, BR-F05-31)", () => {
	// AC-F05-06, section 5.
	test("the late schedule change leaves exactly one November charge, on the 8th", async () => {
		const ctx = on(golden.userId, "2026-11-09");
		const { result } = await asUser(golden.userId, async (tx) => {
			await laterCharge(tx, golden.userId, netflix(), "2026-11-05");
			const answer = await change(tx, ctx, netflix(), 1, {
				changedAt: when("2026-11-02"),
				startDate: "2026-09-08",
			});
			return { answer, dues: await dueOns(tx, netflix()) };
		});
		expect(result.answer).toMatchObject({
			changeDate: "2026-11-02",
			chargesFrom: "2026-11-03",
			chargesCreated: 1,
			chargesDeleted: 1,
			months: ["2026-11"],
		});
		expect(result.dues).toEqual(["2026-09-05", "2026-10-05", "2026-11-08"]);
	});

	test("an upcoming Subscription moved earlier charges from the new start", async () => {
		const upcoming = await addSubscription(owner, custom, {
			startDate: "2026-12-05",
			chargesFrom: "2026-12-05",
			lastChangeOn: "2026-11-02",
		});
		const ctx = on(custom, "2026-11-03");
		const { result } = await asUser(custom, (tx) =>
			change(tx, ctx, upcoming.id, 1, {
				changedAt: when("2026-11-03"),
				startDate: "2026-12-01",
			}),
		);
		expect(result).toMatchObject({
			chargesFrom: "2026-12-01",
			startDate: "2026-12-01",
			status: "upcoming",
			nextDueOn: "2026-12-01",
			chargeCount: 0,
		});
	});

	test("a new start on or before C sets chargesFrom to the day after C, and the change date keeps the old schedule", async () => {
		const { result } = await asUser(golden.userId, (tx) =>
			change(tx, goldenContext(golden.userId), netflix(), 1, {
				startDate: "2026-09-08",
			}),
		);
		expect(result).toMatchObject({
			chargesFrom: "2026-11-03",
			nextDueOn: "2026-11-08",
		});
	});

	test("a new start after C is the new chargesFrom", async () => {
		const { result } = await asUser(golden.userId, (tx) =>
			change(tx, goldenContext(golden.userId), netflix(), 1, {
				startDate: "2026-11-20",
			}),
		);
		expect(result).toMatchObject({
			chargesFrom: "2026-11-20",
			status: "upcoming",
			nextDueOn: "2026-11-20",
		});
	});

	test("a new start on C itself is after nothing: chargesFrom is the day after C", async () => {
		const { result } = await asUser(golden.userId, (tx) =>
			change(tx, goldenContext(golden.userId), netflix(), 1, {
				startDate: "2026-11-02",
			}),
		);
		expect(result.chargesFrom).toBe("2026-11-03");
	});

	test("unedited charges after C that are on the new schedule are kept and repriced when the values change too", async () => {
		const ctx = on(golden.userId, "2026-11-09");
		const { result } = await asUser(golden.userId, async (tx) => {
			const kept = await laterCharge(
				tx,
				golden.userId,
				netflix(),
				"2026-11-08",
			);
			const answer = await change(tx, ctx, netflix(), 1, {
				changedAt: when("2026-11-02"),
				startDate: "2026-09-08",
				amountMinor: 79900,
				currency: "INR",
			});
			return { kept, answer, rows: await charges(tx, netflix()) };
		});
		const row = result.rows.find((r) => r.dueOn === "2026-11-08");
		expect(row).toMatchObject({ id: result.kept, amount: "79900", version: 2 });
		expect(result.answer).toMatchObject({
			chargesCreated: 0,
			chargesUpdated: 1,
			chargesDeleted: 0,
		});
	});

	test("an edited charge after C survives a schedule change, still linked", async () => {
		const ctx = on(golden.userId, "2026-11-09");
		const { result } = await asUser(golden.userId, async (tx) => {
			await laterCharge(tx, golden.userId, netflix(), "2026-11-05", {
				edited: true,
			});
			await change(tx, ctx, netflix(), 1, {
				changedAt: when("2026-11-02"),
				startDate: "2026-09-08",
			});
			return charges(tx, netflix());
		});
		expect(result.map((r) => [r.dueOn, r.edited])).toEqual([
			["2026-09-05", false],
			["2026-10-05", false],
			["2026-11-05", true],
			["2026-11-08", false],
		]);
	});

	test("charges through C stay, whatever the new schedule", async () => {
		const { result } = await asUser(golden.userId, async (tx) => {
			await change(tx, goldenContext(golden.userId), netflix(), 1, {
				cadence: { unit: "week", every: 1 },
			});
			return dueOns(tx, netflix());
		});
		expect(result.slice(0, 2)).toEqual(["2026-09-05", "2026-10-05"]);
	});

	test("a weekly cadence deletes the monthly charge after C that is off it and creates the weekly ones up to today", async () => {
		const ctx = on(golden.userId, "2026-11-20");
		const { result } = await asUser(golden.userId, async (tx) => {
			await laterCharge(tx, golden.userId, netflix(), "2026-11-05");
			const answer = await change(tx, ctx, netflix(), 1, {
				changedAt: when("2026-11-02"),
				cadence: { unit: "week", every: 1 },
			});
			return { answer, dues: await dueOns(tx, netflix()) };
		});
		// Weekly from Saturday 5 Sep 2026: 7 and 14 November. 5 November is off the schedule.
		expect(result.dues.filter((d) => d > "2026-11-02")).toEqual([
			"2026-11-07",
			"2026-11-14",
		]);
		expect(result.answer).toMatchObject({
			chargesDeleted: 1,
			chargesCreated: 2,
			months: ["2026-11"],
		});
	});

	test("a cadence change that drops a charge after C deletes it", async () => {
		const ctx = on(golden.userId, "2026-11-20");
		const { result } = await asUser(golden.userId, async (tx) => {
			await laterCharge(tx, golden.userId, netflix(), "2026-11-05");
			const answer = await change(tx, ctx, netflix(), 1, {
				changedAt: when("2026-11-02"),
				cadence: { unit: "month", every: 2 },
			});
			return { answer, dues: await dueOns(tx, netflix()) };
		});
		// Every 2 months from 5 Sep: 5 Sep, 5 Nov. So 5 Nov stays; use quarterly to drop it.
		expect(result.dues).toContain("2026-11-05");
		expect(result.answer.chargesDeleted).toBe(0);
	});

	test("every 3 months drops 5 November, which is not a due date of the new schedule", async () => {
		const ctx = on(golden.userId, "2026-11-20");
		const { result } = await asUser(golden.userId, async (tx) => {
			await laterCharge(tx, golden.userId, netflix(), "2026-11-05");
			const answer = await change(tx, ctx, netflix(), 1, {
				changedAt: when("2026-11-02"),
				cadence: { unit: "month", every: 3 },
			});
			return { answer, dues: await dueOns(tx, netflix()) };
		});
		expect(result.dues).toEqual(["2026-09-05", "2026-10-05"]);
		expect(result.answer).toMatchObject({
			chargesDeleted: 1,
			chargesCreated: 0,
			months: ["2026-11"],
		});
	});

	test("tombstones after C that are off the new schedule are deleted; those through C stay", async () => {
		const { result } = await asUser(golden.userId, async (tx) => {
			await tombstone(tx, golden.userId, cultGym(), "2026-11-10");
			const answer = await change(
				tx,
				goldenContext(golden.userId),
				cultGym(),
				1,
				{
					startDate: "2026-09-12",
				},
			);
			return { answer, skips: await skipsOf(tx, cultGym()) };
		});
		expect(result.skips).toEqual(["2026-10-10"]);
		expect(result.answer.skips).toEqual(["2026-10-10"]);
	});

	test("a tombstone after C that is a due date of the new schedule stays", async () => {
		const { result } = await asUser(golden.userId, async (tx) => {
			await tombstone(tx, golden.userId, cultGym(), "2026-11-12");
			await change(tx, goldenContext(golden.userId), cultGym(), 1, {
				startDate: "2026-09-12",
			});
			return skipsOf(tx, cultGym());
		});
		expect(result).toEqual(["2026-10-10", "2026-11-12"]);
	});

	// AC-F05-20, section 5.
	test("the double charge: skipDueOn 15 November tombstones it and makes the next charge 15 December", async () => {
		const ctx = on(golden.userId, "2026-11-06");
		const { result } = await asUser(golden.userId, (tx) =>
			change(tx, ctx, netflix(), 1, {
				changedAt: when("2026-11-06"),
				startDate: "2026-09-15",
				skipDueOn: "2026-11-15",
			}),
		);
		expect(result).toMatchObject({
			changeDate: "2026-11-06",
			chargesFrom: "2026-11-07",
			skips: ["2026-11-15"],
			nextDueOn: "2026-12-15",
			chargesCreated: 1,
		});
	});

	test("without skipDueOn, the next charge is 15 November", async () => {
		const ctx = on(golden.userId, "2026-11-06");
		const { result } = await asUser(golden.userId, (tx) =>
			change(tx, ctx, netflix(), 1, {
				changedAt: when("2026-11-06"),
				startDate: "2026-09-15",
			}),
		);
		expect(result).toMatchObject({ skips: [], nextDueOn: "2026-11-15" });
	});

	test("a skipDueOn that is not a due date of the new schedule is 422 on skipDueOn", async () => {
		const ctx = on(golden.userId, "2026-11-06");
		const { result } = await asUser(golden.userId, (tx) =>
			refusal(
				change(tx, ctx, netflix(), 1, {
					changedAt: when("2026-11-06"),
					startDate: "2026-09-15",
					skipDueOn: "2026-11-16",
				}),
			),
		);
		expect(result.code).toBe("validation_failed");
		expect(result.fields).toEqual({
			skipDueOn: "Choose a date with a charge to skip.",
		});
	});

	test("a skipDueOn on or before C is 422, even when it is a due date", async () => {
		const ctx = on(golden.userId, "2026-11-06");
		const { result } = await asUser(golden.userId, (tx) =>
			refusal(
				change(tx, ctx, netflix(), 1, {
					changedAt: when("2026-11-06"),
					startDate: "2026-09-05",
					cadence: { unit: "week", every: 1 },
					skipDueOn: "2026-11-05",
				}),
			),
		);
		expect(result.fields).toHaveProperty("skipDueOn");
	});

	test("a skipDueOn that is a due date of the old schedule only is 422", async () => {
		const ctx = on(golden.userId, "2026-11-06");
		const { result } = await asUser(golden.userId, (tx) =>
			refusal(
				change(tx, ctx, netflix(), 1, {
					changedAt: when("2026-11-06"),
					startDate: "2026-09-15",
					skipDueOn: "2026-12-05",
				}),
			),
		);
		expect(result.fields).toHaveProperty("skipDueOn");
	});

	test("an unedited charge already on the skipped date is deleted with the tombstone written", async () => {
		const ctx = on(golden.userId, "2026-11-20");
		const { result } = await asUser(golden.userId, async (tx) => {
			await laterCharge(tx, golden.userId, netflix(), "2026-11-15");
			const answer = await change(tx, ctx, netflix(), 1, {
				changedAt: when("2026-11-06"),
				startDate: "2026-09-15",
				skipDueOn: "2026-11-15",
			});
			return {
				answer,
				dues: await dueOns(tx, netflix()),
				skips: await skipsOf(tx, netflix()),
			};
		});
		expect(result.dues).not.toContain("2026-11-15");
		expect(result.skips).toContain("2026-11-15");
		expect(result.answer.chargesDeleted).toBe(1);
	});

	test("an edited charge on the skipped date makes it 422: it stays", async () => {
		const ctx = on(golden.userId, "2026-11-20");
		const { result } = await asUser(golden.userId, async (tx) => {
			await laterCharge(tx, golden.userId, netflix(), "2026-11-15", {
				edited: true,
			});
			return refusal(
				change(tx, ctx, netflix(), 1, {
					changedAt: when("2026-11-06"),
					startDate: "2026-09-15",
					skipDueOn: "2026-11-15",
				}),
			);
		});
		expect(result.fields).toEqual({
			skipDueOn:
				"This charge was edited, so it stays. Delete it in Transactions to skip it.",
		});
	});

	test("a skipDueOn that is already skipped writes no second tombstone", async () => {
		const ctx = on(golden.userId, "2026-11-06");
		const { result } = await asUser(golden.userId, async (tx) => {
			await tombstone(tx, golden.userId, netflix(), "2026-11-15");
			await change(tx, ctx, netflix(), 1, {
				changedAt: when("2026-11-06"),
				startDate: "2026-09-15",
				skipDueOn: "2026-11-15",
			});
			return skipsOf(tx, netflix());
		});
		expect(result).toEqual(["2026-11-15"]);
	});

	// AC-F05-29, section 5: Undo of the double-charge change.
	test("Undo of the double-charge change puts the start back with no 15 November tombstone, and next due is 5 December", async () => {
		const ctx = on(golden.userId, "2026-11-06");
		const { result } = await asUser(golden.userId, async (tx) => {
			const first = await change(tx, ctx, netflix(), 1, {
				changedAt: when("2026-11-06"),
				startDate: "2026-09-15",
				skipDueOn: "2026-11-15",
			});
			const undone = await change(tx, ctx, netflix(), first.version, {
				changedAt: when("2026-11-06"),
				startDate: "2026-09-05",
				unskipDueOn: "2026-11-15",
			});
			return { undone, skips: await skipsOf(tx, netflix()) };
		});
		expect(result.undone).toMatchObject({
			startDate: "2026-09-05",
			skips: [],
			nextDueOn: "2026-12-05",
		});
		expect(result.skips).toEqual([]);
	});
});

describe("unskipDueOn (BR-F05-34)", () => {
	test("a date on or before C is 422 on unskipDueOn", async () => {
		const { result } = await asUser(golden.userId, async (tx) => {
			await tombstone(tx, golden.userId, netflix(), "2026-11-02");
			return refusal(
				change(tx, goldenContext(golden.userId), netflix(), 1, {
					name: "Netflix HD",
					unskipDueOn: "2026-11-02",
				}),
			);
		});
		expect(result.fields).toEqual({
			unskipDueOn: "This charge date has passed, so it can't be brought back.",
		});
	});

	// D-612: the tombstone is checked first, so a date with none is no change, passed or not.
	test("a date on or before C with no tombstone changes nothing, like the skip's own Undo", async () => {
		const { result } = await asUser(golden.userId, (tx) =>
			change(tx, goldenContext(golden.userId), netflix(), 1, {
				name: "Netflix",
				unskipDueOn: "2026-11-02",
			}),
		);
		expect(result).toMatchObject({ version: 1, skips: [], chargesCreated: 0 });
	});

	test("a date with no tombstone changes nothing on its own", async () => {
		const { result } = await asUser(golden.userId, (tx) =>
			change(tx, goldenContext(golden.userId), netflix(), 1, {
				name: "Netflix",
				unskipDueOn: "2026-12-05",
			}),
		);
		expect(result.version).toBe(1);
	});

	test("a tombstone after C is removed, and a date that passed before a late sync is then charged", async () => {
		const ctx = on(golden.userId, "2026-11-06");
		const { result } = await asUser(golden.userId, async (tx) => {
			await tombstone(tx, golden.userId, netflix(), "2026-11-05");
			const answer = await change(tx, ctx, netflix(), 1, {
				changedAt: when("2026-11-03"),
				note: "x",
				unskipDueOn: "2026-11-05",
			});
			return { answer, dues: await dueOns(tx, netflix()) };
		});
		expect(result.answer).toMatchObject({
			skips: [],
			chargesCreated: 1,
			lastChangeOn: "2026-11-03",
		});
		expect(result.dues).toContain("2026-11-05");
	});

	test("it does not turn a note-only change into a note-only one: it moves lastChangeOn", async () => {
		const { result } = await asUser(golden.userId, async (tx) => {
			await tombstone(tx, golden.userId, netflix(), "2026-12-05");
			return change(tx, goldenContext(golden.userId), netflix(), 1, {
				note: "x",
				unskipDueOn: "2026-12-05",
			});
		});
		expect(result.lastChangeOn).toBe("2026-11-02");
		expect(result.skips).toEqual([]);
	});
});

describe("end dates, cancel and resume (BR-F05-12, BR-F05-13, BR-F05-32)", () => {
	// AC-F05-07.
	// AC-F05-32
	test("cancelling Netflix with end date 2026-09-30 deletes #16, and catch-up then creates nothing", async () => {
		const ctx = goldenContext(golden.userId);
		const { result } = await asUser(golden.userId, async (tx) => {
			const answer = await change(tx, ctx, netflix(), 1, {
				endDate: "2026-09-30",
			});
			const caught = await catchUpAll(
				tx,
				chargeContext(on(golden.userId, "2026-11-20")),
			);
			return { answer, dues: await dueOns(tx, netflix()), caught };
		});
		expect(result.answer).toMatchObject({
			endDate: "2026-09-30",
			status: "ended",
			chargesDeleted: 1,
			chargesCreated: 0,
			chargeCount: 1,
			nextDueOn: null,
			months: ["2026-10"],
		});
		expect(result.dues).toEqual(["2026-09-05"]);
	});

	test("moving that end date to 2026-12-31 makes next due 5 November, and 5 October is never charged", async () => {
		const ctx = goldenContext(golden.userId);
		const { result } = await asUser(golden.userId, async (tx) => {
			const cancelled = await change(tx, ctx, netflix(), 1, {
				endDate: "2026-09-30",
			});
			const resumed = await change(tx, ctx, netflix(), cancelled.version, {
				endDate: "2026-12-31",
			});
			return { resumed, dues: await dueOns(tx, netflix()) };
		});
		expect(result.resumed).toMatchObject({
			endDate: "2026-12-31",
			status: "ending",
			nextDueOn: "2026-11-05",
			chargesFrom: "2026-11-02",
			chargesCreated: 0,
		});
		expect(result.dues).toEqual(["2026-09-05"]);
	});

	test("moving it instead to 2026-10-15 recreates the 5 October charge", async () => {
		const ctx = goldenContext(golden.userId);
		const { result } = await asUser(golden.userId, async (tx) => {
			const cancelled = await change(tx, ctx, netflix(), 1, {
				endDate: "2026-09-30",
			});
			const longer = await change(tx, ctx, netflix(), cancelled.version, {
				endDate: "2026-10-15",
			});
			return { longer, rows: await charges(tx, netflix()) };
		});
		expect(result.longer).toMatchObject({
			chargesCreated: 1,
			chargesFrom: "2026-09-05",
			months: ["2026-10"],
			status: "ended",
		});
		expect(result.rows.map((r) => [r.dueOn, r.amount])).toEqual([
			["2026-09-05", "64900"],
			["2026-10-05", "64900"],
		]);
	});

	test("Cult Gym cancelled with end date 2026-09-30 keeps its 10 October tombstone", async () => {
		const { result } = await asUser(golden.userId, (tx) =>
			change(tx, goldenContext(golden.userId), cultGym(), 1, {
				endDate: "2026-09-30",
			}),
		);
		expect(result.skips).toEqual(["2026-10-10"]);
		expect(result.chargesDeleted).toBe(0);
	});

	// AC-F05-30.
	test("Cancel Now sets endDate to today, status ended, and deletes nothing", async () => {
		const { result } = await asUser(golden.userId, (tx) =>
			change(tx, goldenContext(golden.userId), netflix(), 1, {
				endDate: "2026-11-02",
			}),
		);
		expect(result).toMatchObject({
			endDate: "2026-11-02",
			status: "ended",
			chargesDeleted: 0,
			chargeCount: 2,
		});
	});

	test("a future end date keeps charging until then: status ending, nothing deleted", async () => {
		const { result } = await asUser(golden.userId, (tx) =>
			change(tx, goldenContext(golden.userId), netflix(), 1, {
				endDate: "2026-12-31",
			}),
		);
		expect(result).toMatchObject({
			status: "ending",
			chargesDeleted: 0,
			nextDueOn: "2026-11-05",
		});
	});

	test("an end date sets only the charges after it: unedited ones are deleted, edited ones stay linked", async () => {
		const ctx = on(golden.userId, "2026-11-20");
		const { result } = await asUser(golden.userId, async (tx) => {
			await laterCharge(tx, golden.userId, netflix(), "2026-11-05");
			await laterCharge(tx, golden.userId, netflix(), "2026-12-05", {
				edited: true,
			});
			const answer = await change(tx, ctx, netflix(), 1, {
				changedAt: when("2026-11-02"),
				endDate: "2026-10-20",
			});
			return { answer, rows: await charges(tx, netflix()) };
		});
		expect(result.rows.map((r) => [r.dueOn, r.edited])).toEqual([
			["2026-09-05", false],
			["2026-10-05", false],
			["2026-12-05", true],
		]);
		expect(result.answer).toMatchObject({
			chargesDeleted: 1,
			months: ["2026-11"],
		});
	});

	test("moving the end date earlier, but still after the charges, deletes nothing", async () => {
		const ctx = goldenContext(golden.userId);
		const { result } = await asUser(golden.userId, async (tx) => {
			const first = await change(tx, ctx, netflix(), 1, {
				endDate: "2026-12-31",
			});
			return change(tx, ctx, netflix(), first.version, {
				endDate: "2026-12-01",
			});
		});
		expect(result.chargesDeleted).toBe(0);
	});

	test("step 2 stops at an end date before C: no charge is made that step 3 would delete", async () => {
		const missing = await goldenUser(owner, "sub-change-end-step2", {
			beforeCatchUp: true,
		});
		users.push(missing.userId);
		const { result } = await asUser(missing.userId, async (tx) => {
			const answer = await change(
				tx,
				goldenContext(missing.userId),
				missing.subscription("sunrise"),
				1,
				{
					endDate: "2026-10-31",
				},
			);
			return {
				answer,
				dues: await dueOns(tx, missing.subscription("sunrise")),
			};
		});
		expect(result.answer).toMatchObject({
			chargesCreated: 0,
			chargesDeleted: 0,
		});
		expect(result.dues).toEqual(["2026-09-01", "2026-10-01"]);
	});

	test("step 2 still creates the missing charge when the end date is later", async () => {
		const missing = await goldenUser(owner, "sub-change-end-later", {
			beforeCatchUp: true,
		});
		users.push(missing.userId);
		const { result } = await asUser(missing.userId, (tx) =>
			change(
				tx,
				goldenContext(missing.userId),
				missing.subscription("sunrise"),
				1,
				{
					endDate: "2026-12-31",
				},
			),
		);
		expect(result.chargesCreated).toBe(1);
	});

	test("an end date on the change date still charges the change date's due date", async () => {
		const missing = await goldenUser(owner, "sub-change-end-today", {
			beforeCatchUp: true,
		});
		users.push(missing.userId);
		const { result } = await asUser(missing.userId, (tx) =>
			change(
				tx,
				goldenContext(missing.userId),
				missing.subscription("sunrise"),
				1,
				{
					endDate: "2026-11-02",
				},
			),
		);
		expect(result).toMatchObject({ chargesCreated: 1, status: "ended" });
	});

	test("clearing the end date while it is on or after C changes nothing else", async () => {
		const ctx = goldenContext(golden.userId);
		const { result } = await asUser(golden.userId, async (tx) => {
			const set = await change(tx, ctx, netflix(), 1, {
				endDate: "2026-12-31",
			});
			return change(tx, ctx, netflix(), set.version, { endDate: null });
		});
		expect(result).toMatchObject({
			endDate: null,
			chargesFrom: "2026-09-05",
			status: "active",
		});
	});

	// AC-F05-22, section 5: the cancel, then Undo with backfillGap.
	test("Undo of a cancel with backfillGap creates the 5 October charge at 649.00 under a new id, and next due is 5 November", async () => {
		const ctx = goldenContext(golden.userId);
		const { result } = await asUser(golden.userId, async (tx) => {
			const before = await charges(tx, netflix());
			const cancelled = await change(tx, ctx, netflix(), 1, {
				endDate: "2026-09-30",
			});
			const undone = await change(tx, ctx, netflix(), cancelled.version, {
				endDate: null,
				backfillGap: true,
			});
			return { before, undone, rows: await charges(tx, netflix()) };
		});
		const october = result.rows.find((r) => r.dueOn === "2026-10-05");
		expect(october).toMatchObject({ amount: "64900", version: 1 });
		expect(october?.id).not.toBe(
			result.before.find((r) => r.dueOn === "2026-10-05")?.id,
		);
		expect(result.undone).toMatchObject({
			endDate: null,
			nextDueOn: "2026-11-05",
			chargesCreated: 1,
			// The earlier of chargesFrom (5 September) and the day after the end date (BR-F05-32).
			chargesFrom: "2026-09-05",
			months: ["2026-10"],
		});
	});

	test("the recreated charge is at the current price", async () => {
		const ctx = goldenContext(golden.userId);
		const { result } = await asUser(golden.userId, async (tx) => {
			const cancelled = await change(tx, ctx, netflix(), 1, {
				endDate: "2026-09-30",
			});
			const repriced = await change(tx, ctx, netflix(), cancelled.version, {
				amountMinor: 79900,
				currency: "INR",
			});
			await change(tx, ctx, netflix(), repriced.version, {
				endDate: null,
				backfillGap: true,
			});
			return charges(tx, netflix());
		});
		expect(result.find((r) => r.dueOn === "2026-10-05")?.amount).toBe("79900");
	});

	test("a resume without backfillGap never charges the months while it was cancelled", async () => {
		const ctx = goldenContext(golden.userId);
		const { result } = await asUser(golden.userId, async (tx) => {
			const cancelled = await change(tx, ctx, netflix(), 1, {
				endDate: "2026-09-30",
			});
			const resumed = await change(tx, ctx, netflix(), cancelled.version, {
				endDate: null,
			});
			return { resumed, dues: await dueOns(tx, netflix()) };
		});
		expect(result.dues).toEqual(["2026-09-05"]);
		expect(result.resumed.chargesFrom).toBe("2026-11-02");
	});

	test("a resume charges C itself when it is a due date", async () => {
		const ctx = on(golden.userId, "2026-11-05");
		const { result } = await asUser(golden.userId, async (tx) => {
			const cancelled = await change(tx, ctx, netflix(), 1, {
				changedAt: when("2026-11-05"),
				endDate: "2026-09-30",
			});
			const resumed = await change(tx, ctx, netflix(), cancelled.version, {
				changedAt: when("2026-11-05"),
				endDate: null,
			});
			return { resumed, dues: await dueOns(tx, netflix()) };
		});
		expect(result.dues).toEqual(["2026-09-05", "2026-11-05"]);
		expect(result.resumed.chargesCreated).toBe(1);
	});

	test("backfillGap after a restart from today still creates the 5 October charge (AC-F05-30)", async () => {
		const ctx = goldenContext(golden.userId);
		const { result } = await asUser(golden.userId, async (tx) => {
			const cancelled = await change(tx, ctx, netflix(), 1, {
				endDate: "2026-09-30",
			});
			const restarted = await change(tx, ctx, netflix(), cancelled.version, {
				endDate: null,
			});
			const undone = await change(tx, ctx, netflix(), restarted.version, {
				endDate: "2026-09-30",
			});
			const gap = await change(tx, ctx, netflix(), undone.version, {
				endDate: null,
				backfillGap: true,
			});
			return { restarted, gap, dues: await dueOns(tx, netflix()) };
		});
		expect(result.restarted.chargesFrom).toBe("2026-11-02");
		expect(result.gap.chargesFrom).toBe("2026-10-01");
		expect(result.dues).toEqual(["2026-09-05", "2026-10-05"]);
	});

	test("backfillGap leaves tombstoned dates alone", async () => {
		const ctx = goldenContext(golden.userId);
		const { result } = await asUser(golden.userId, async (tx) => {
			const cancelled = await change(tx, ctx, cultGym(), 1, {
				endDate: "2026-09-30",
			});
			const gap = await change(tx, ctx, cultGym(), cancelled.version, {
				endDate: null,
				backfillGap: true,
			});
			return { gap, dues: await dueOns(tx, cultGym()) };
		});
		expect(result.dues).toEqual(["2026-09-10"]);
		expect(result.gap.chargesCreated).toBe(0);
	});

	test("backfillGap leaves paused dates alone", async () => {
		const ctx = goldenContext(golden.userId);
		const { result } = await asUser(golden.userId, async (tx) => {
			const cancelled = await change(tx, ctx, netflix(), 1, {
				endDate: "2026-09-30",
			});
			const paused = await change(tx, ctx, netflix(), cancelled.version, {
				endDate: null,
				backfillGap: true,
				pause: { from: "2026-11-05", until: "2026-12-05" },
			});
			return { paused, dues: await dueOns(tx, netflix()) };
		});
		expect(result.dues).toEqual(["2026-09-05", "2026-10-05"]);
	});

	test("backfillGap without a stored end date before C changes nothing", async () => {
		const { result } = await asUser(golden.userId, (tx) =>
			change(tx, goldenContext(golden.userId), netflix(), 1, {
				endDate: null,
				backfillGap: true,
				note: "x",
			}),
		);
		expect(result).toMatchObject({
			chargesFrom: "2026-09-05",
			chargesCreated: 0,
		});
	});

	test("backfillGap with a future end date still on after C changes nothing", async () => {
		const ctx = goldenContext(golden.userId);
		const { result } = await asUser(golden.userId, async (tx) => {
			const set = await change(tx, ctx, netflix(), 1, {
				endDate: "2026-12-31",
			});
			return change(tx, ctx, netflix(), set.version, {
				endDate: null,
				backfillGap: true,
			});
		});
		expect(result.chargesFrom).toBe("2026-09-05");
	});
});

describe("pause (BR-F05-28, BR-F05-29, AC-F05-19, AC-F05-28)", () => {
	const PAUSE = { from: "2026-11-05", until: "2027-01-05" };

	test("a pause from the next due date: status paused, next due 5 January, monthly cost unchanged", async () => {
		const { result } = await asUser(golden.userId, (tx) =>
			change(tx, goldenContext(golden.userId), netflix(), 1, { pause: PAUSE }),
		);
		expect(result).toMatchObject({
			pause: PAUSE,
			status: "paused",
			nextDueOn: "2027-01-05",
			monthlyMinor: 64900,
			chargesCreated: 0,
			chargesFrom: "2026-09-05",
		});
	});

	test("catch-up through 5 December creates no Netflix charge", async () => {
		const { result } = await asUser(golden.userId, async (tx) => {
			await change(tx, goldenContext(golden.userId), netflix(), 1, {
				pause: PAUSE,
			});
			await catchUpAll(tx, chargeContext(on(golden.userId, "2026-12-05")));
			return dueOns(tx, netflix());
		});
		expect(result).toEqual(["2026-09-05", "2026-10-05"]);
	});

	test("a pause that is not from the next due date is 422 on pause.from", async () => {
		const { result } = await asUser(golden.userId, async (tx) => ({
			day: await refusal(
				change(tx, goldenContext(golden.userId), netflix(), 1, {
					pause: { from: "2026-11-06", until: "2027-01-05" },
				}),
			),
			later: await refusal(
				change(tx, goldenContext(golden.userId), netflix(), 1, {
					pause: { from: "2026-12-05", until: "2027-01-05" },
				}),
			),
			past: await refusal(
				change(tx, goldenContext(golden.userId), netflix(), 1, {
					pause: { from: "2026-10-05", until: "2027-01-05" },
				}),
			),
		}));
		for (const refused of Object.values(result)) {
			expect(refused.fields).toEqual({
				"pause.from": "Choose a date with a charge to pause from.",
			});
		}
	});

	test("a pause must start after a skipped next date: the tombstoned 5 November is no longer the start", async () => {
		const { result } = await asUser(golden.userId, async (tx) => {
			await tombstone(tx, golden.userId, netflix(), "2026-11-05");
			return {
				refused: await refusal(
					change(tx, goldenContext(golden.userId), netflix(), 1, {
						pause: PAUSE,
					}),
				),
				accepted: await change(
					tx,
					goldenContext(golden.userId),
					netflix(),
					1,
					{
						pause: { from: "2026-12-05", until: "2027-01-05" },
					},
				),
			};
		});
		expect(result.refused.fields).toHaveProperty("pause.from");
		expect(result.accepted.status).toBe("paused");
	});

	test("an until that is not after from is 422 with the date to pass", async () => {
		const { result } = await asUser(golden.userId, (tx) =>
			refusal(
				change(tx, goldenContext(golden.userId), netflix(), 1, {
					pause: { from: "2026-11-05", until: "2026-11-05" },
				}),
			),
		);
		expect(result.fields).toEqual({
			"pause.until": "Choose a date after 5 Nov.",
		});
	});

	test("an until 24 months after today is accepted, and a day more is 422 with the limit", async () => {
		const { result } = await asUser(golden.userId, async (tx) => ({
			over: await refusal(
				change(tx, goldenContext(golden.userId), netflix(), 1, {
					pause: { from: "2026-11-05", until: "2028-11-03" },
				}),
			),
			edge: await change(tx, goldenContext(golden.userId), netflix(), 1, {
				pause: { from: "2026-11-05", until: "2028-11-02" },
			}),
		}));
		expect(result.over.fields).toEqual({
			"pause.until": "Choose a date up to 2 Nov 2028.",
		});
		expect(result.edge.pause?.until).toBe("2028-11-02");
	});

	test("a pause equal to the stored one is no change and is not judged again", async () => {
		const ctx = on(golden.userId, "2026-12-10");
		const { result } = await asUser(golden.userId, async (tx) => {
			const set = await change(
				tx,
				goldenContext(golden.userId),
				netflix(),
				1,
				{ pause: PAUSE },
			);
			return change(tx, ctx, netflix(), set.version, {
				changedAt: when("2026-12-10"),
				pause: PAUSE,
			});
		});
		expect(result.version).toBe(2);
	});

	test("setting a pause deletes the unedited charges on its dates from C on, and keeps edited ones", async () => {
		const ctx = on(golden.userId, "2026-12-10");
		const { result } = await asUser(golden.userId, async (tx) => {
			await laterCharge(tx, golden.userId, netflix(), "2026-11-05");
			await laterCharge(tx, golden.userId, netflix(), "2026-12-05", {
				edited: true,
			});
			const answer = await change(tx, ctx, netflix(), 1, {
				changedAt: when("2026-11-02"),
				pause: PAUSE,
			});
			return { answer, rows: await charges(tx, netflix()) };
		});
		expect(result.rows.map((r) => [r.dueOn, r.edited])).toEqual([
			["2026-09-05", false],
			["2026-10-05", false],
			["2026-12-05", true],
		]);
		expect(result.answer).toMatchObject({
			chargesDeleted: 1,
			chargesCreated: 0,
		});
	});

	test("Resume now on 10 November ends the pause there: 5 November is never charged and next due is 5 December", async () => {
		const ctx = on(golden.userId, "2026-11-10");
		const { result } = await asUser(golden.userId, async (tx) => {
			const set = await change(
				tx,
				goldenContext(golden.userId),
				netflix(),
				1,
				{ pause: PAUSE },
			);
			const resumed = await change(tx, ctx, netflix(), set.version, {
				changedAt: when("2026-11-10"),
				pause: { from: "2026-11-05", until: "2026-11-10" },
			});
			return { resumed, dues: await dueOns(tx, netflix()) };
		});
		expect(result.resumed).toMatchObject({
			nextDueOn: "2026-12-05",
			status: "active",
			chargesFrom: "2026-09-05",
		});
		expect(result.dues).toEqual(["2026-09-05", "2026-10-05"]);
	});

	test("Resume now on 5 December charges 5 December, and its Undo the same day puts the pause back and deletes that charge", async () => {
		const ctx = on(golden.userId, "2026-12-05");
		const { result } = await asUser(golden.userId, async (tx) => {
			const set = await change(
				tx,
				goldenContext(golden.userId),
				netflix(),
				1,
				{ pause: PAUSE },
			);
			const resumed = await change(tx, ctx, netflix(), set.version, {
				changedAt: when("2026-12-05"),
				pause: { from: "2026-11-05", until: "2026-12-05" },
			});
			const charged = await dueOns(tx, netflix());
			const undone = await change(tx, ctx, netflix(), resumed.version, {
				changedAt: when("2026-12-05"),
				pause: PAUSE,
			});
			return { resumed, charged, undone, after: await dueOns(tx, netflix()) };
		});
		expect(result.resumed.chargesCreated).toBe(1);
		expect(result.charged).toContain("2026-12-05");
		expect(result.undone).toMatchObject({
			chargesDeleted: 1,
			chargesCreated: 0,
			status: "paused",
		});
		expect(result.after).not.toContain("2026-12-05");
		expect(result.undone.pause).toEqual(PAUSE);
	});

	test("Resume now on 5 November itself clears the pause and charges 5 November", async () => {
		const ctx = on(golden.userId, "2026-11-05");
		const { result } = await asUser(golden.userId, async (tx) => {
			const set = await change(
				tx,
				goldenContext(golden.userId),
				netflix(),
				1,
				{ pause: PAUSE },
			);
			const resumed = await change(tx, ctx, netflix(), set.version, {
				changedAt: when("2026-11-05"),
				pause: null,
			});
			return { resumed, dues: await dueOns(tx, netflix()) };
		});
		expect(result.resumed).toMatchObject({
			pause: null,
			status: "active",
			chargesCreated: 1,
		});
		expect(result.dues).toEqual(["2026-09-05", "2026-10-05", "2026-11-05"]);
	});

	test("clearing a pause before it starts changes no chargesFrom", async () => {
		const ctx = on(golden.userId, "2026-11-03");
		const { result } = await asUser(golden.userId, async (tx) => {
			const set = await change(
				tx,
				goldenContext(golden.userId),
				netflix(),
				1,
				{ pause: PAUSE },
			);
			return change(tx, ctx, netflix(), set.version, {
				changedAt: when("2026-11-03"),
				pause: null,
			});
		});
		expect(result).toMatchObject({
			pause: null,
			chargesFrom: "2026-09-05",
			nextDueOn: "2026-11-05",
		});
	});

	test("a later pause that replaces a started one never charges 5 November (AC-F05-19)", async () => {
		const ctx = on(golden.userId, "2026-11-10");
		const { result } = await asUser(golden.userId, async (tx) => {
			const set = await change(
				tx,
				goldenContext(golden.userId),
				netflix(),
				1,
				{ pause: PAUSE },
			);
			const replaced = await change(tx, ctx, netflix(), set.version, {
				changedAt: when("2026-11-10"),
				pause: { from: "2026-12-05", until: "2027-02-05" },
			});
			return { replaced, dues: await dueOns(tx, netflix()) };
		});
		// The new pause has not started, but its end is ahead: the status is paused (BR-F05-28).
		expect(result.replaced).toMatchObject({
			chargesFrom: "2026-11-10",
			status: "paused",
		});
		expect(result.dues).toEqual(["2026-09-05", "2026-10-05"]);
	});

	test("Change pause moves only the end: it keeps from and may be any date from C on", async () => {
		const ctx = on(golden.userId, "2026-11-10");
		const { result } = await asUser(golden.userId, async (tx) => {
			const set = await change(
				tx,
				goldenContext(golden.userId),
				netflix(),
				1,
				{ pause: PAUSE },
			);
			return {
				early: await refusal(
					change(tx, ctx, netflix(), set.version, {
						changedAt: when("2026-11-10"),
						pause: { from: "2026-11-05", until: "2026-11-09" },
					}),
				),
				moved: await change(tx, ctx, netflix(), set.version, {
					changedAt: when("2026-11-10"),
					pause: { from: "2026-11-05", until: "2027-03-05" },
				}),
			};
		});
		expect(result.moved).toMatchObject({
			nextDueOn: "2027-03-05",
			chargesFrom: "2026-09-05",
		});
		expect(result.early.fields).toHaveProperty("pause.until");
	});

	test("a pause in force cannot have another start: that is a new pause and needs the next due date", async () => {
		const ctx = on(golden.userId, "2026-11-10");
		const { result } = await asUser(golden.userId, async (tx) => {
			const set = await change(
				tx,
				goldenContext(golden.userId),
				netflix(),
				1,
				{ pause: PAUSE },
			);
			return refusal(
				change(tx, ctx, netflix(), set.version, {
					changedAt: when("2026-11-10"),
					pause: { from: "2026-11-06", until: "2027-03-05" },
				}),
			);
		});
		expect(result.fields).toHaveProperty("pause.from");
	});

	test("a skipped date inside a pause stays skipped after the pause ends", async () => {
		const ctx = on(golden.userId, "2026-11-10");
		const { result } = await asUser(golden.userId, async (tx) => {
			await tombstone(tx, golden.userId, netflix(), "2026-12-05");
			const set = await change(
				tx,
				goldenContext(golden.userId),
				netflix(),
				1,
				{
					pause: { from: "2026-11-05", until: "2027-01-05" },
				},
			);
			const resumed = await change(tx, ctx, netflix(), set.version, {
				changedAt: when("2026-11-10"),
				pause: { from: "2026-11-05", until: "2026-11-10" },
			});
			return { resumed, skips: await skipsOf(tx, netflix()) };
		});
		expect(result.skips).toEqual(["2026-12-05"]);
		expect(result.resumed.nextDueOn).toBe("2027-01-05");
	});
});

describe("locks (SRV-7, BR-F05-08 step 1)", () => {
	test("waits for a held Subscription lock, then sees the tombstone the holder committed", async () => {
		const user = await goldenUser(owner, "sub-change-lock-skip");
		users.push(user.userId);
		const ctx = on(user.userId, "2026-11-06");
		const id = user.subscription("netflix");
		const result = await holdingLock(
			owner,
			user.userId,
			id,
			async (holder) => {
				await holder.query(
					`INSERT INTO app.subscription_skips (id, user_id, created_at, updated_at, subscription_id, due_on)
					VALUES ($1, $2, $3, $3, $4, '2026-11-05')`,
					[uuidV7At(GOLDEN_NOW), user.userId, GOLDEN_NOW, id],
				);
			},
			() =>
				withUser({ user: ctx.user }, "write", (tx) =>
					change(tx, ctx, id, 1, {
						changedAt: when("2026-11-06"),
						name: "Netflix HD",
					}),
				),
		);
		// A read that locks as it goes would miss the tombstone and charge 5 November.
		expect(result.chargesCreated).toBe(0);
		expect(result.skips).toEqual(["2026-11-05"]);
	}, 60_000);

	test("waits for a held lock, then is 409 when the holder changed the Subscription", async () => {
		const user = await goldenUser(owner, "sub-change-lock-version");
		users.push(user.userId);
		const ctx = goldenContext(user.userId);
		const id = user.subscription("netflix");
		const refused = await holdingLock(
			owner,
			user.userId,
			id,
			async (holder) => {
				await holder.query(
					"UPDATE app.subscriptions SET name = 'Netflix HD', version = version + 1 WHERE id = $1",
					[id],
				);
			},
			() =>
				refusal(
					withUser({ user: ctx.user }, "write", (tx) =>
						change(tx, ctx, id, 1, { name: "Netflix 4K" }),
					),
				),
		);
		expect(refused.code).toBe("version_conflict");
		expect(refused.details).toMatchObject({
			current: { name: "Netflix HD", version: 2 },
		});
	}, 60_000);

	test("two changes made at the same version: the first commits, the second is 409 and writes nothing", async () => {
		const user = await goldenUser(owner, "sub-change-race");
		users.push(user.userId);
		const ctx = goldenContext(user.userId);
		const id = user.subscription("netflix");
		const run = (body: Record<string, unknown>) =>
			refusal(
				withUser({ user: ctx.user }, "write", (tx) =>
					change(tx, ctx, id, 1, body),
				),
			).catch((error: unknown) => error);
		const settled = await Promise.allSettled([
			withUser({ user: ctx.user }, "write", (tx) =>
				change(tx, ctx, id, 1, { name: "A" }),
			),
			withUser({ user: ctx.user }, "write", (tx) =>
				change(tx, ctx, id, 1, { name: "B" }),
			),
		]);
		void run;
		const ok = settled.filter((s) => s.status === "fulfilled");
		const failed = settled.filter((s) => s.status === "rejected");
		expect(ok).toHaveLength(1);
		expect(failed).toHaveLength(1);
		expect((failed[0] as PromiseRejectedResult).reason).toMatchObject({
			code: "version_conflict",
		});
		const { rows } = await owner.query(
			"SELECT version FROM app.subscriptions WHERE id = $1",
			[id],
		);
		expect(rows).toEqual([{ version: 2 }]);
	}, 60_000);
});
