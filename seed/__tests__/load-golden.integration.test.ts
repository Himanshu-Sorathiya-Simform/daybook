import { Client, Pool } from "pg";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

import { parseOwnerEnv, parseServerEnv } from "../../src/server/env";
import { createUser } from "../../src/server/db/__tests__/private-rows";
import {
	GOLDEN_ALL,
	GOLDEN_BUDGETS,
	GOLDEN_NOW,
	GOLDEN_SKIPS,
	GOLDEN_SUBSCRIPTIONS,
	goldenRow,
} from "../golden";
import {
	GOLDEN_M1_ROWS,
	loadGolden,
	loadGoldenBudgets,
	type LoadedBudget,
	type LoadedGolden,
} from "../load-golden";

/** The golden loader (D-471), against a real database: two users each get their own copy. */

let owner: Client;
let runtime: Pool;
let first: LoadedGolden;
let second: LoadedGolden;

beforeAll(async () => {
	owner = new Client({
		connectionString: parseOwnerEnv(process.env).DATABASE_URL_OWNER,
	});
	await owner.connect();
	runtime = new Pool({
		connectionString: parseServerEnv(process.env).DATABASE_URL_RUNTIME,
		max: 1,
	});
	first = await loadGolden(owner, await createUser(owner, "golden-load"));
	second = await loadGolden(owner, await createUser(owner, "golden-load-2"));
});

afterAll(async () => {
	await owner?.query(`DELETE FROM auth."user" WHERE id = ANY($1)`, [
		[first?.userId, second?.userId].filter(Boolean),
	]);
	await Promise.all([owner?.end(), runtime?.end()]);
});

/** What the runtime role sees as `userId`, through RLS. */
async function asUser<T extends Record<string, unknown>>(
	userId: string,
	query: string,
): Promise<T[]> {
	const client = await runtime.connect();
	try {
		await client.query("BEGIN");
		await client.query("SELECT set_config('app.user_id', $1, true)", [userId]);
		return (await client.query<T>(query)).rows;
	} finally {
		await client.query("ROLLBACK").catch(() => {});
		client.release();
	}
}

const GOAL_ROWS = [3, 9, 14, 22, 23];

describe("the M1 rows", () => {
	test("are #1 to #27 without the five Goal rows: 22 rows", () => {
		const expected = Array.from({ length: 27 }, (_, i) => i + 1).filter(
			(n) => !GOAL_ROWS.includes(n),
		);
		expect(GOLDEN_M1_ROWS.map((row) => row.golden)).toEqual(expected);
		expect(GOLDEN_M1_ROWS).toHaveLength(22);
	});

	test("include #27, which catch-up would create from F05 on", () => {
		expect(GOLDEN_M1_ROWS).toContainEqual(goldenRow(27));
	});
});

describe("a load", () => {
	test("writes all 22 rows for the user, field for field", async () => {
		const stored = await asUser<{
			id: string;
			type: string;
			amount_minor: string;
			occurred_at: Date;
			occurred_on: string;
			category: string;
			payee: string;
			description: string | null;
			note: string | null;
			source: string;
			demo: boolean;
			version: number;
			created_at: Date;
			updated_at: Date;
		}>(
			first.userId,
			`SELECT id, type, amount_minor, occurred_at, occurred_on::text, category, payee,
			        description, note, source, demo, version, created_at, updated_at
			 FROM app.transactions ORDER BY occurred_on, occurred_at, id`,
		);
		expect(stored).toHaveLength(22);
		for (const row of stored) {
			const golden = goldenRow(first.golden(row.id));
			expect({
				type: row.type,
				amountMinor: Number(row.amount_minor),
				occurredAt: row.occurred_at.toISOString(),
				occurredOn: row.occurred_on,
				category: row.category,
				payee: row.payee,
				description: row.description,
				note: row.note,
				source: row.source,
				demo: row.demo,
				version: row.version,
				createdAt: row.created_at.toISOString(),
				updatedAt: row.updated_at.toISOString(),
			}).toEqual({
				type: golden.type,
				amountMinor: golden.amountMinor,
				occurredAt: new Date(golden.occurredAt).toISOString(),
				occurredOn: golden.occurredOn,
				category: golden.category,
				payee: golden.payee,
				description: golden.description,
				note: golden.note,
				source: golden.source,
				demo: false,
				version: 1,
				createdAt: new Date(golden.createdAt).toISOString(),
				updatedAt: new Date(golden.updatedAt).toISOString(),
			});
		}
	});

	// golden: Setup, the India profile.
	test("writes the golden profile", async () => {
		const [profile] = await asUser(
			first.userId,
			`SELECT country, currency, timezone, week_start, last_catch_up_on::text
			 FROM app.profile`,
		);
		expect(profile).toEqual({
			country: "IN",
			currency: "INR",
			timezone: "Asia/Kolkata",
			week_start: "monday",
			last_catch_up_on: "2026-11-02",
		});
	});

	test("is visible only to its own user", async () => {
		const seen = await asUser<{ id: string }>(
			second.userId,
			"SELECT id FROM app.transactions",
		);
		expect(seen).toHaveLength(22);
		const firstIds = new Set(first.rows.map((row) => row.id));
		expect(seen.some((row) => firstIds.has(row.id))).toBe(false);
	});
});

describe("ids", () => {
	test("differ between loads, so every user can hold a copy", () => {
		expect(first.id(12)).not.toBe(second.id(12));
		expect(first.id(12)).not.toBe(goldenRow(12).id);
	});

	test("are UUIDv7s that keep the golden id order, which breaks ties in every list", () => {
		const byGoldenId = [...GOLDEN_M1_ROWS]
			.sort((a, b) => (a.id < b.id ? -1 : 1))
			.map((row) => row.golden);
		const byLoadedId = [...first.rows]
			.sort((a, b) => (a.id < b.id ? -1 : 1))
			.map((row) => row.golden);
		expect(byLoadedId).toEqual(byGoldenId);
		for (const row of first.rows) {
			expect(row.id).toMatch(
				/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
			);
		}
	});

	test("map to and from golden row numbers", () => {
		expect(first.golden(first.id(26))).toBe(26);
		expect(first.rows.find((row) => row.golden === 26)?.id).toBe(first.id(26));
	});

	test.each(GOAL_ROWS)("refuse Goal row #%i, which M1 does not load", (n) => {
		expect(() => first.id(n)).toThrow(`Golden row #${n} is not loaded.`);
	});

	test("refuse an id from another load", () => {
		expect(() => first.golden(second.id(4))).toThrow(
			"is not a golden row of this load",
		);
	});

	test("leave the shared fixture untouched", () => {
		expect(GOLDEN_ALL.find((row) => row.golden === 12)?.id).toBe(
			"0199a000-0000-7000-8000-000000000012",
		);
	});
});

describe("the golden Budgets", () => {
	let firstBudgets: LoadedBudget[];
	let secondBudgets: LoadedBudget[];

	beforeAll(async () => {
		firstBudgets = await loadGoldenBudgets(owner, first.userId);
		secondBudgets = await loadGoldenBudgets(owner, second.userId);
	});

	test("load all four for the user, field for field, at the golden clock", async () => {
		const rows = await asUser<Record<string, unknown>>(
			first.userId,
			`SELECT id, category, schedule, overrides, demo, version,
			   created_at = '${GOLDEN_NOW}' AND updated_at = '${GOLDEN_NOW}' AS at_golden_clock
			 FROM app.budgets ORDER BY id`,
		);
		expect(rows).toEqual(
			firstBudgets.map(
				({ id, category, schedule, overrides, demo, version }) => ({
					id,
					category,
					schedule,
					overrides,
					demo,
					version,
					at_golden_clock: true,
				}),
			),
		);
		expect(rows.map((row) => row["category"])).toEqual(
			GOLDEN_BUDGETS.map((budget) => budget.category),
		);
	});

	test("give each load its own ids, visible only to its own user", async () => {
		const firstIds = firstBudgets.map((budget) => budget.id);
		const secondIds = secondBudgets.map((budget) => budget.id);
		expect(firstIds.some((id) => secondIds.includes(id))).toBe(false);
		const seen = await asUser<{ id: string }>(
			second.userId,
			"SELECT id FROM app.budgets",
		);
		expect(seen.map((row) => row.id).sort()).toEqual([...secondIds].sort());
	});

	test("leave the shared fixture's ids untouched", () => {
		expect(GOLDEN_BUDGETS[0].id).toBe("0199a000-0000-7000-8004-000000000001");
	});
});

describe("the golden Subscriptions", () => {
	type Stored = {
		id: string;
		name: string;
		amount_minor: string;
		cadence_unit: string;
		cadence_every: number;
		start_date: string;
		category: string;
		note: string | null;
		end_date: string | null;
		pause_from: string | null;
		pause_until: string | null;
		charges_from: string;
		last_change_on: string;
		demo: boolean;
		version: number;
		created_at: Date;
		updated_at: Date;
	};

	const stored = (userId: string) =>
		asUser<Stored>(
			userId,
			`SELECT id, name, amount_minor, cadence_unit, cadence_every, start_date::text, category,
			        note, end_date::text, pause_from::text, pause_until::text, charges_from::text,
			        last_change_on::text, demo, version, created_at, updated_at
			 FROM app.subscriptions ORDER BY start_date, name`,
		);

	test("load all four, field for field", async () => {
		const rows = await stored(first.userId);
		expect(rows).toHaveLength(4);
		for (const row of rows) {
			const golden = Object.values(GOLDEN_SUBSCRIPTIONS).find(
				(subscription) => subscription.name === row.name,
			)!;
			expect({
				id: row.id,
				amountMinor: Number(row.amount_minor),
				cadence: { unit: row.cadence_unit, every: row.cadence_every },
				startDate: row.start_date,
				category: row.category,
				note: row.note,
				endDate: row.end_date,
				pause: [row.pause_from, row.pause_until],
				chargesFrom: row.charges_from,
				lastChangeOn: row.last_change_on,
				demo: row.demo,
				version: row.version,
				createdAt: row.created_at.toISOString(),
				updatedAt: row.updated_at.toISOString(),
			}).toEqual({
				id: first.subscription(
					Object.entries(GOLDEN_SUBSCRIPTIONS).find(
						([, subscription]) => subscription.name === row.name,
					)![0] as keyof typeof GOLDEN_SUBSCRIPTIONS,
				),
				amountMinor: golden.amountMinor,
				cadence: golden.cadence,
				startDate: golden.startDate,
				category: golden.category,
				note: null,
				endDate: null,
				pause: [null, null],
				chargesFrom: golden.chargesFrom,
				lastChangeOn: golden.lastChangeOn,
				demo: false,
				version: 1,
				createdAt: new Date(golden.createdAt).toISOString(),
				updatedAt: new Date(golden.createdAt).toISOString(),
			});
		}
	});

	test("give each load its own ids, visible only to its own user", async () => {
		const names = Object.keys(
			GOLDEN_SUBSCRIPTIONS,
		) as (keyof typeof GOLDEN_SUBSCRIPTIONS)[];
		const firstIds = names.map((name) => first.subscription(name));
		const secondIds = names.map((name) => second.subscription(name));
		expect(new Set([...firstIds, ...secondIds]).size).toBe(8);
		expect(firstIds).not.toContain(GOLDEN_SUBSCRIPTIONS.netflix.id);
		const seen = await asUser<{ id: string }>(
			second.userId,
			"SELECT id FROM app.subscriptions",
		);
		expect(seen.map((row) => row.id).sort()).toEqual([...secondIds].sort());
	});

	test("keep the ids' kind and order: 8002, in the dataset's order", () => {
		for (const name of Object.keys(
			GOLDEN_SUBSCRIPTIONS,
		) as (keyof typeof GOLDEN_SUBSCRIPTIONS)[])
			expect(first.subscription(name).split("-")[3]).toBe("8002");
		const ids = (["sunrise", "netflix", "cultGym", "amazonPrime"] as const).map(
			(name) => first.subscription(name),
		);
		expect([...ids].sort()).toEqual(ids);
	});

	// golden: each charge is linked to its Subscription on its due date (BR-F05-02).
	test("link every charge to its Subscription, with its due date", async () => {
		const charges = await asUser<{
			id: string;
			subscription_id: string | null;
			due_on: string | null;
			occurred_on: string;
			edited: boolean;
			source: string;
		}>(
			first.userId,
			`SELECT id, subscription_id, due_on::text, occurred_on::text, edited, source
			 FROM app.transactions WHERE source = 'subscription'`,
		);
		expect(
			charges.map((row) => first.golden(row.id)).sort((a, b) => a - b),
		).toEqual([1, 5, 7, 12, 16, 20, 27]);
		for (const charge of charges) {
			const golden = goldenRow(first.golden(charge.id));
			expect(charge.subscription_id).toBe(
				first.subscription(
					Object.entries(GOLDEN_SUBSCRIPTIONS).find(
						([, subscription]) =>
							subscription.id === golden.subscriptionId,
					)![0] as keyof typeof GOLDEN_SUBSCRIPTIONS,
				),
			);
			expect(charge.due_on).toBe(golden.occurredOn);
			expect(charge.due_on).toBe(charge.occurred_on);
			expect(charge.edited).toBe(false);
		}
	});

	test("leave every manual row unlinked", async () => {
		const manual = await asUser<{
			subscription_id: string | null;
			due_on: string | null;
			edited: boolean;
		}>(
			first.userId,
			`SELECT subscription_id, due_on::text, edited FROM app.transactions
			 WHERE source = 'manual'`,
		);
		expect(manual).toHaveLength(15);
		for (const row of manual)
			expect(row).toEqual({
				subscription_id: null,
				due_on: null,
				edited: false,
			});
	});

	// golden: Subscriptions (as of 2 November), Charges in October.
	test("count charges per Subscription: 3, 2, 1 and 1", async () => {
		const counts = await asUser<{ name: string; charges: number }>(
			first.userId,
			`SELECT s.name, count(t.id)::int AS charges
			 FROM app.subscriptions s
			 LEFT JOIN app.transactions t ON t.subscription_id = s.id AND t.user_id = s.user_id
			 GROUP BY s.name ORDER BY s.name`,
		);
		expect(counts).toEqual([
			{ name: "Amazon Prime", charges: 1 },
			{ name: "Cult Gym", charges: 1 },
			{ name: "Netflix", charges: 2 },
			{ name: "Sunrise Apartments", charges: 3 },
		]);
	});

	// golden: check E, `src=subscription` over October: #12, #16, #20, 20,148.00.
	test("keep October's charges at 20,148.00 over 3 rows, without the skipped one", async () => {
		const [october] = await asUser<{ n: number; total: string }>(
			first.userId,
			`SELECT count(*)::int AS n, sum(amount_minor) AS total FROM app.transactions
			 WHERE source = 'subscription' AND occurred_on BETWEEN '2026-10-01' AND '2026-10-31'`,
		);
		expect(october).toEqual({ n: 3, total: "2014800" });
	});

	// golden: Cult Gym's 10 October charge was deleted, leaving a tombstone.
	test("write the one tombstone, Cult Gym's 10 October, at its own time", async () => {
		const skips = await asUser<{
			id: string;
			subscription_id: string;
			due_on: string;
			created_at: Date;
			updated_at: Date;
		}>(
			first.userId,
			`SELECT id, subscription_id, due_on::text, created_at, updated_at
			 FROM app.subscription_skips`,
		);
		expect(skips).toHaveLength(1);
		expect(skips[0]).toMatchObject({
			subscription_id: first.subscription("cultGym"),
			due_on: GOLDEN_SKIPS[0].dueOn,
		});
		expect(skips[0]!.created_at.toISOString()).toBe(
			new Date(GOLDEN_SKIPS[0].createdAt).toISOString(),
		);
		expect(skips[0]!.updated_at).toEqual(skips[0]!.created_at);
		expect(skips[0]!.id).not.toBe(GOLDEN_SKIPS[0].id);
		expect(skips[0]!.id.split("-")[3]).toBe("8005");
	});

	test("show each user only their own tombstone", async () => {
		const seen = await asUser<{ subscription_id: string }>(
			second.userId,
			"SELECT subscription_id FROM app.subscription_skips",
		);
		expect(seen).toEqual([{ subscription_id: second.subscription("cultGym") }]);
	});

	test("leave the shared fixture's ids untouched", () => {
		expect(GOLDEN_SUBSCRIPTIONS.netflix.id).toBe(
			"0199a000-0000-7000-8002-000000000002",
		);
		expect(GOLDEN_SKIPS[0].id).toBe("0199a000-0000-7000-8005-000000000001");
		expect(goldenRow(16).subscriptionId).toBe(GOLDEN_SUBSCRIPTIONS.netflix.id);
	});

	test("a user's delete removes the Subscriptions, tombstone and charges together", async () => {
		const doomed = await createUser(owner, "golden-load-delete");
		await loadGolden(owner, doomed);
		await owner.query(`DELETE FROM auth."user" WHERE id = $1`, [doomed]);
		for (const table of [
			"subscriptions",
			"subscription_skips",
			"transactions",
			"profile",
		]) {
			const left = await owner.query<{ count: string }>(
				`SELECT count(*) FROM app.${table} WHERE user_id = $1`,
				[doomed],
			);
			expect(Number(left.rows[0]?.count)).toBe(0);
		}
	});
});

describe("a load before catch-up (AC-F05-03)", () => {
	let before: LoadedGolden;

	beforeAll(async () => {
		before = await loadGolden(owner, await createUser(owner, "golden-before"), {
			beforeCatchUp: true,
		});
	});

	afterAll(async () => {
		await owner?.query(`DELETE FROM auth."user" WHERE id = $1`, [
			before?.userId,
		]);
	});

	test("leaves out #27, the one row catch-up creates: 21 rows", async () => {
		expect(before.rows).toHaveLength(21);
		expect(before.rows.map((row) => row.golden)).not.toContain(27);
		const stored = await asUser<{ id: string }>(
			before.userId,
			"SELECT id FROM app.transactions",
		);
		expect(stored).toHaveLength(21);
		expect(() => before.id(27)).toThrow("Golden row #27 is not loaded.");
	});

	test("keeps #26, the last row before it, and every other charge", async () => {
		expect(before.id(26)).toBeDefined();
		const charges = await asUser<{ id: string }>(
			before.userId,
			"SELECT id FROM app.transactions WHERE source = 'subscription'",
		);
		expect(
			charges.map((row) => before.golden(row.id)).sort((a, b) => a - b),
		).toEqual([1, 5, 7, 12, 16, 20]);
	});

	test("puts the profile's last catch-up on 1 November, so 2 November's catch-up is due", async () => {
		const [profile] = await asUser(
			before.userId,
			"SELECT last_catch_up_on::text FROM app.profile",
		);
		expect(profile).toEqual({ last_catch_up_on: "2026-11-01" });
	});

	test("still loads the four Subscriptions and the tombstone", async () => {
		const subscriptions = await asUser<{ name: string }>(
			before.userId,
			"SELECT name FROM app.subscriptions ORDER BY name",
		);
		expect(subscriptions.map((row) => row.name)).toEqual([
			"Amazon Prime",
			"Cult Gym",
			"Netflix",
			"Sunrise Apartments",
		]);
		const skips = await asUser(
			before.userId,
			"SELECT due_on::text FROM app.subscription_skips",
		);
		expect(skips).toEqual([{ due_on: "2026-10-10" }]);
	});

	test("leaves Sunrise Apartments' due date of 1 November without a charge", async () => {
		const november = await asUser<{ due_on: string }>(
			before.userId,
			`SELECT due_on::text FROM app.transactions
			 WHERE subscription_id = '${before.subscription("sunrise")}' ORDER BY due_on`,
		);
		expect(november.map((row) => row.due_on)).toEqual([
			"2026-09-01",
			"2026-10-01",
		]);
	});

	test("does not change the ordinary load", () => {
		expect(first.rows).toHaveLength(22);
		expect(first.id(27)).toBeDefined();
	});
});
