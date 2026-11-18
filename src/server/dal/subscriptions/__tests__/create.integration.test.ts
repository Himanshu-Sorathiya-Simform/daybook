import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

import { dueDates } from "@/lib/subscriptions/schedule";
import { uuidV7At } from "../../transactions/__tests__/helpers";

import { GOLDEN_NOW } from "../../../../../seed/golden";
import { insertProfile, type LoadedGolden } from "../../../../../seed/load-golden";
import { createUser } from "../../../db/__tests__/private-rows";
import { runtimePool } from "../../../db/pools";
import { parseOwnerEnv } from "../../../env";
import { currencyEditable } from "../../profile/read";
import { asUser, goldenContext } from "../../transactions/__tests__/helpers";
import { withUser } from "../../with-user";
import { createSubscription } from "../create";
import { addSubscription, goldenUser } from "./helpers";
import { refusal } from "../../budgets/__tests__/helpers";

/** `POST /api/subscriptions` (F05 section 11, section 7.1, BR-F05-03, BR-F05-04) through the
 * runtime role and RLS. Every scenario runs in a rolled-back transaction as one profile user,
 * except the race, which commits. Expected figures come from F05 sections 5 and 7. */

let owner: Client;
let bare: string;
let neighbour: LoadedGolden;
const users: string[] = [];
const DAY = 86_400_000;

beforeAll(async () => {
	owner = new Client({
		connectionString: parseOwnerEnv(process.env).DATABASE_URL_OWNER,
	});
	await owner.connect();
	bare = await createUser(owner, "sub-create");
	await insertProfile(owner, bare);
	neighbour = await goldenUser(owner, "sub-create-neighbour");
	users.push(bare, neighbour.userId);
}, 60_000);

afterAll(async () => {
	await owner?.query(`DELETE FROM auth."user" WHERE id = ANY($1)`, [users]);
	await owner?.end();
	await runtimePool().end();
});

/** A create body as the client sends it: Netflix, monthly from 5 Sep 2025, at the golden clock. */
const body = (fields: Record<string, unknown> = {}): Record<string, unknown> => ({
	id: uuidV7At(GOLDEN_NOW),
	name: "Netflix",
	amountMinor: 64900,
	currency: "INR",
	cadence: { unit: "month", every: 1 },
	startDate: "2025-09-05",
	category: "entertainment",
	note: null,
	backfill: false,
	createdAt: GOLDEN_NOW,
	...fields,
});

const create = (input: Record<string, unknown>, who = bare) =>
	asUser(who, (tx) => createSubscription(tx, goldenContext(who), input));

describe("creating a Subscription (section 7.1)", () => {
	// F05 section 7.1: chargesFrom and lastChangeOn become today; no charge, the next due date is 5 November.
	test("golden Netflix without past charges: nothing is charged and the next charge is 5 November", async () => {
		const input = body();
		const { result } = await create(input);
		expect(result.created).toBe(true);
		expect(result.subscription).toEqual({
			id: input["id"],
			name: "Netflix",
			amountMinor: 64900,
			cadence: { unit: "month", every: 1 },
			startDate: "2025-09-05",
			category: "entertainment",
			note: null,
			endDate: null,
			pause: null,
			chargesFrom: "2026-11-02",
			lastChangeOn: "2026-11-02",
			demo: false,
			version: 1,
			createdAt: "2026-11-02T06:30:00.000Z",
			updatedAt: "2026-11-02T06:30:00.000Z",
			skips: [],
			status: "active",
			nextDueOn: "2026-11-05",
			yearlyMinor: 778800,
			monthlyMinor: 64900,
			chargeCount: 0,
			paidMinor: 0,
			chargesCreated: 0,
			currency: "INR",
		});
	});

	test("keeps the client's createdAt and stamps updatedAt with the request clock", async () => {
		const { result } = await create(
			body({ createdAt: "2026-11-02T06:28:00.000Z" }),
		);
		expect(result.subscription).toMatchObject({
			createdAt: "2026-11-02T06:28:00.000Z",
			updatedAt: "2026-11-02T06:30:00.000Z",
		});
	});

	test("stores a note, and a null note as none", async () => {
		const noted = (await create(body({ note: "Family plan" }))).result
			.subscription;
		expect(noted.note).toBe("Family plan");
		expect(
			(await create(body({ note: "" }))).result.subscription.note,
		).toBeNull();
	});

	test("stores the preset cadences as the same two columns", async () => {
		for (const cadence of [
			{ unit: "week", every: 1 },
			{ unit: "month", every: 3 },
			{ unit: "month", every: 12 },
			{ unit: "week", every: 52 },
			{ unit: "month", every: 24 },
		]) {
			expect(
				(await create(body({ cadence }))).result.subscription.cadence,
			).toEqual(cadence);
		}
	});

	test("takes the largest amount of the currency", async () => {
		expect(
			(await create(body({ amountMinor: 99999999999 }))).result.subscription
				.amountMinor,
		).toBe(99999999999);
	});

	test("a name of 60 characters charges under the same payee", async () => {
		const name = "n".repeat(60);
		const { result } = await create(
			body({ name, backfill: true, startDate: "2026-10-05" }),
		);
		expect(result.subscription.name).toBe(name);
		expect(result.subscription.chargesCreated).toBe(1);
	});

	test("answers the Subscription as a list item: costs and next due from the shared rules", async () => {
		const { result } = await create(
			body({
				cadence: { unit: "week", every: 3 },
				amountMinor: 10000,
				startDate: "2026-10-01",
			}),
		);
		expect(result.subscription).toMatchObject({
			yearlyMinor: 173333,
			monthlyMinor: 14444,
			status: "active",
		});
	});

	test("fixes the currency: the profile's currencyEditable turns false", async () => {
		const { result } = await asUser(bare, async (tx) => {
			const before = await currencyEditable(tx);
			await createSubscription(tx, goldenContext(bare), body());
			return { before, after: await currencyEditable(tx) };
		});
		expect(result).toEqual({ before: true, after: false });
	});
});

describe("the past-charges choice (BR-F05-03, BR-F05-04, AC-F05-04)", () => {
	// F05 section 5: 14 dates, 9,086.00.
	test("golden Netflix with past charges: 14 charges from 5 Sep 2025 to 5 Oct 2026, 9,086.00", async () => {
		const { result: made } = await create(body({ backfill: true }));
		expect(made.subscription).toMatchObject({
			chargesFrom: "2025-09-05",
			lastChangeOn: "2026-11-02",
			chargesCreated: 14,
			chargeCount: 14,
			paidMinor: 908600,
			nextDueOn: "2026-11-05",
		});
	});

	test("the charges are one on each due date, at midnight in Kolkata, as unedited expenses", async () => {
		const input = body({ backfill: true });
		const client = await runtimePool().connect();
		try {
			await client.query("BEGIN");
			await client.query("SELECT set_config('app.user_id', $1, true)", [bare]);
			const { drizzle } = await import("drizzle-orm/node-postgres");
			const schema = await import("../../../db/schema");
			const tx = drizzle({ client, schema });
			await createSubscription(tx, goldenContext(bare), input);
			const { rows } = await client.query(
				`SELECT due_on::text, occurred_on::text,
					to_char(occurred_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS occurred_at,
					amount_minor::text, type, source, edited, payee, category, demo, version
				 FROM app.transactions WHERE subscription_id = $1 ORDER BY due_on`,
				[input["id"]],
			);
			expect(rows).toHaveLength(14);
			expect(rows[0]).toEqual({
				due_on: "2025-09-05",
				occurred_on: "2025-09-05",
				occurred_at: "2025-09-04T18:30:00Z",
				amount_minor: "64900",
				type: "expense",
				source: "subscription",
				edited: false,
				payee: "Netflix",
				category: "entertainment",
				demo: false,
				version: 1,
			});
			expect(rows.at(-1)).toMatchObject({
				due_on: "2026-10-05",
				occurred_at: "2026-10-04T18:30:00Z",
			});
			expect(rows.map((row) => row["due_on"])).toEqual(
				dueDates(
					{
						startDate: "2025-09-05",
						cadence: { unit: "month", every: 1 },
					},
					"2025-09-05",
					"2026-11-02",
				),
			);
		} finally {
			await client.query("ROLLBACK");
			client.release();
		}
	});

	// AC-F05-04: started 13 months ago.
	test("started 13 months ago, no past charge without the choice, every due date with it", async () => {
		const start = "2025-10-05";
		const without = (await create(body({ startDate: start }))).result
			.subscription;
		expect(without).toMatchObject({
			chargesFrom: "2026-11-02",
			chargesCreated: 0,
			chargeCount: 0,
		});
		const withAll = (await create(body({ startDate: start, backfill: true })))
			.result.subscription;
		const expected = dueDates(
			{ startDate: start, cadence: { unit: "month", every: 1 } },
			start,
			"2026-11-02",
		);
		expect(expected).toHaveLength(13);
		expect(withAll).toMatchObject({
			chargesFrom: start,
			chargesCreated: 13,
			chargeCount: 13,
			paidMinor: 13 * 64900,
		});
	});

	test("a due date today is charged either way: it is not past", async () => {
		for (const backfill of [false, true]) {
			const { result } = await create(
				body({ startDate: "2026-11-02", backfill }),
			);
			expect(result.subscription).toMatchObject({
				chargesFrom: "2026-11-02",
				chargesCreated: 1,
				chargeCount: 1,
			});
		}
	});

	test("an upcoming start has no charge and starts charging from its start date, whatever the choice", async () => {
		for (const backfill of [false, true]) {
			const { result } = await create(
				body({ startDate: "2026-12-05", backfill }),
			);
			expect(result.subscription).toMatchObject({
				status: "upcoming",
				chargesFrom: "2026-12-05",
				chargesCreated: 0,
				nextDueOn: "2026-12-05",
			});
		}
	});

	test("a weekly Subscription started 10 years ago: 522 charges, in the same statements as two", async () => {
		const weekly = (startDate: string) =>
			body({ cadence: { unit: "week", every: 1 }, startDate, backfill: true });
		const big = await create(weekly("2016-11-03"));
		const small = await create(weekly("2026-10-22"));
		expect(big.result.subscription.chargesCreated).toBe(522);
		expect(big.result.subscription.chargeCount).toBe(522);
		expect(small.result.subscription.chargesCreated).toBe(2);
		expect(big.statements).toBe(small.statements);
	});

	test("made earlier and synced later: recorded on the day it was made", async () => {
		const { result } = await create(
			body({ createdAt: "2026-10-30T10:00:00.000Z", startDate: "2026-10-01" }),
		);
		// Recorded 30 October: only the due date of 1 November falls between then and today.
		expect(result.subscription).toMatchObject({
			chargesFrom: "2026-10-30",
			lastChangeOn: "2026-10-30",
			chargesCreated: 1,
			chargeCount: 1,
		});
	});

	test("a demo flag is never taken from the client: a created Subscription is not demo", async () => {
		expect(
			(await create(body({ backfill: true, startDate: "2026-10-05" }))).result
				.subscription.demo,
		).toBe(false);
	});
});

describe("a repeated or foreign id (API-5, BR-P2-20, D-603)", () => {
	test("the same id again answers that Subscription unchanged with 0 charges created, whatever the body now says", async () => {
		const input = body({ backfill: true, startDate: "2026-10-05" });
		const { result } = await asUser(bare, async (tx) => {
			const ctx = goldenContext(bare);
			const first = await createSubscription(tx, ctx, input);
			const again = await createSubscription(tx, ctx, {
				...input,
				name: "Changed",
				amountMinor: 1,
				backfill: false,
			});
			return { first, again };
		});
		expect(result.first.created).toBe(true);
		expect(result.first.subscription.chargesCreated).toBe(1);
		expect(result.again.created).toBe(false);
		expect(result.again.subscription).toEqual({
			...result.first.subscription,
			chargesCreated: 0,
		});
	});

	test("another user's id is 409 id_conflict, and reveals nothing", async () => {
		// The neighbour's own Subscription, with an id the window accepts.
		const theirs = await addSubscription(owner, neighbour.userId);
		const { result } = await asUser(bare, (tx) =>
			refusal(
				createSubscription(tx, goldenContext(bare), body({ id: theirs.id })),
			),
		);
		expect(result).toMatchObject({ code: "id_conflict" });
		expect(JSON.stringify(result)).not.toContain(neighbour.userId);
		const { rows } = await owner.query(
			"SELECT user_id FROM app.subscriptions WHERE id = $1",
			[theirs.id],
		);
		expect(rows).toEqual([{ user_id: neighbour.userId }]);
	});
});

describe("refusals", () => {
	const refused = async (input: unknown, who = bare) => {
		const { result, statements } = await asUser(who, (tx) =>
			refusal(createSubscription(tx, goldenContext(who), input)),
		);
		return { ...result, statements };
	};

	test("a currency other than the profile's is 422 currency_mismatch", async () => {
		const result = await refused(body({ currency: "USD" }));
		expect(result.code).toBe("currency_mismatch");
	});

	describe("the body, before any database work (AC-F05-11)", () => {
		test.each([
			[
				"a cadence of 0 weeks",
				{ cadence: { unit: "week", every: 0 } },
				"cadence.every",
				"Enter how many weeks, from 1 to 52.",
			],
			[
				"a cadence of 53 weeks",
				{ cadence: { unit: "week", every: 53 } },
				"cadence.every",
				"Enter how many weeks, from 1 to 52.",
			],
			[
				"a cadence of 25 months",
				{ cadence: { unit: "month", every: 25 } },
				"cadence.every",
				"Enter how many months, from 1 to 24.",
			],
			["no name", { name: "" }, "name", "Enter a name, like Netflix or Rent."],
			[
				"an amount of zero",
				{ amountMinor: 0 },
				"amountMinor",
				"Enter an amount above zero.",
			],
			[
				"an income category",
				{ category: "salary" },
				"category",
				"Choose a category.",
			],
			[
				"a bad date",
				{ startDate: "2026-02-30" },
				"startDate",
				"Use a date as YYYY-MM-DD.",
			],
			[
				"an end date",
				{ endDate: "2026-12-31" },
				"endDate",
				"Add the Subscription first, then change this.",
			],
			[
				"a pause",
				{ pause: { from: "2026-11-05", until: "2027-01-05" } },
				"pause",
				"Add the Subscription first, then change this.",
			],
			[
				"chargesFrom",
				{ chargesFrom: "2026-01-01" },
				"chargesFrom",
				"Daybook sets this field.",
			],
			["demo", { demo: true }, "demo", "Daybook sets this field."],
			["a version", { version: 3 }, "version", "Daybook sets this field."],
		])("%s is 422 on its field", async (_name, fields, field, message) => {
			const result = await refused(body(fields));
			expect(result).toMatchObject({
				code: "validation_failed",
				fields: { [field]: message },
				statements: 0,
			});
		});

		test("a body that is not an object is refused as a whole", async () => {
			const result = await refused("Netflix");
			expect(result).toMatchObject({
				code: "validation_failed",
				statements: 0,
			});
			expect(Object.keys(result.fields ?? {})).toEqual(["_body"]);
		});

		test("reports every field at once", async () => {
			const result = await refused(body({ name: "", amountMinor: 0 }));
			expect(Object.keys(result.fields ?? {}).sort()).toEqual([
				"amountMinor",
				"name",
			]);
		});
	});

	describe("the windows (D-257, D-267, BR-P2-43)", () => {
		// AC-F05-11: a startDate 11 years back.
		test("a start date 11 years back: Choose a date from 2 Nov 2016 to 2 Nov 2027.", async () => {
			const result = await refused(body({ startDate: "2015-11-02" }));
			expect(result).toMatchObject({
				code: "validation_failed",
				fields: {
					startDate: "Choose a date from 2 Nov 2016 to 2 Nov 2027.",
				},
			});
		});

		test("the ends of the start window are allowed, a day outside is not", async () => {
			expect(
				(await create(body({ startDate: "2016-11-02" }))).result.created,
			).toBe(true);
			expect(
				(await create(body({ startDate: "2027-11-02" }))).result.created,
			).toBe(true);
			expect((await refused(body({ startDate: "2016-11-01" }))).code).toBe(
				"validation_failed",
			);
			expect((await refused(body({ startDate: "2027-11-03" }))).code).toBe(
				"validation_failed",
			);
		});

		test("a createdAt 91 days old is too old; 90 days is fine", async () => {
			const old = new Date(
				new Date(GOLDEN_NOW).getTime() - 91 * DAY,
			).toISOString();
			expect(await refused(body({ createdAt: old }))).toMatchObject({
				code: "validation_failed",
				fields: {
					createdAt:
						"This change is too old to apply. Discard it and make it again.",
				},
			});
			const edge = new Date(
				new Date(GOLDEN_NOW).getTime() - 90 * DAY,
			).toISOString();
			expect((await create(body({ createdAt: edge }))).result.created).toBe(
				true,
			);
		});

		test("a createdAt more than 5 minutes ahead is in the future", async () => {
			const ahead = new Date(
				new Date(GOLDEN_NOW).getTime() + 6 * 60_000,
			).toISOString();
			expect(await refused(body({ createdAt: ahead }))).toMatchObject({
				fields: { createdAt: "The recording time can't be in the future." },
			});
			const ok = new Date(
				new Date(GOLDEN_NOW).getTime() + 5 * 60_000,
			).toISOString();
			expect((await create(body({ createdAt: ok }))).result.created).toBe(
				true,
			);
		});

		test("an id more than 5 minutes ahead is refused, one 5 minutes ahead is fine", async () => {
			const now = new Date(GOLDEN_NOW).getTime();
			expect(
				await refused(body({ id: uuidV7At(new Date(now + 6 * 60_000)) })),
			).toMatchObject({
				fields: {
					id: "This item's time is in the future. Check your device's clock.",
				},
			});
			expect(
				(await create(body({ id: uuidV7At(new Date(now + 5 * 60_000)) })))
					.result.created,
			).toBe(true);
		});

		test("an old id is fine: it may have waited in a queue", async () => {
			const id = uuidV7At(new Date(new Date(GOLDEN_NOW).getTime() - 80 * DAY));
			expect((await create(body({ id }))).result.created).toBe(true);
		});

		test("the start window is read from the day the create was made, not today", async () => {
			// Recorded 30 October: 10 years back is 30 October 2016, which today's window would refuse.
			const made = body({
				createdAt: "2026-10-30T10:00:00.000Z",
				startDate: "2016-10-30",
			});
			expect((await create(made)).result.created).toBe(true);
		});
	});
});

describe("two creates of one id at once", () => {
	test("one creates it and the other answers it, with its charges made once", async () => {
		const solo = await createUser(owner, "sub-create-race");
		await insertProfile(owner, solo);
		users.push(solo);
		const ctx = goldenContext(solo);
		const input = body({ backfill: true, startDate: "2026-09-05" });
		const run = () =>
			withUser({ user: ctx.user }, "write", (tx) =>
				createSubscription(tx, ctx, input),
			);
		const [a, b] = await Promise.all([run(), run()]);
		expect([a.created, b.created].sort()).toEqual([false, true]);
		const { rows } = await owner.query(
			`SELECT (SELECT count(*)::int FROM app.subscriptions WHERE user_id = $1) AS subs,
			        (SELECT count(*)::int FROM app.transactions WHERE user_id = $1) AS charges`,
			[solo],
		);
		expect(rows[0]).toEqual({ subs: 1, charges: 2 });
	}, 60_000);
});
