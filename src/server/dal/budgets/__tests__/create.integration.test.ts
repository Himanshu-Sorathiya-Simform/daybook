import { sql } from "drizzle-orm";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

import { GOLDEN_NOW } from "../../../../../seed/golden";
import { BUDGET_MESSAGES } from "@/lib/budgets/schemas";
import { createUser } from "../../../db/__tests__/private-rows";
import { runtimePool } from "../../../db/pools";
import { parseOwnerEnv } from "../../../env";
import {
	asUser,
	goldenContext,
	uuidV7At,
} from "../../transactions/__tests__/helpers";
import type { ProfiledContext } from "../../context";
import type { Tx } from "../../with-user";
import { createBudget } from "../create";
import { budgetMonth } from "../read";
import { getBudget } from "../row";
import {
	budgetBody,
	goldenBudgetUser,
	refusal,
	transactionIdOf,
	waitForWaiterOn,
} from "./helpers";

/** `createBudget` (F04 section 11, BR-F04-01, BR-F04-07, BR-F04-22, BR-F04-33, BR-P2-20)
 * through the runtime role and RLS. Every case rolls back, except the races, which commit
 * their other side and remove it after. */

let owner: Client;
let userId: string;
let ids: Record<string, string>;
let other: string;
let noProfile: string;

beforeAll(async () => {
	owner = new Client({
		connectionString: parseOwnerEnv(process.env).DATABASE_URL_OWNER,
	});
	await owner.connect();
	({ userId, ids } = await goldenBudgetUser(owner, "budget-create"));
	other = (await goldenBudgetUser(owner, "budget-create-other")).userId;
	noProfile = await createUser(owner, "budget-create-no-profile");
});

afterAll(async () => {
	await owner?.query(`DELETE FROM auth."user" WHERE id = ANY($1)`, [
		[userId, other, noProfile].filter(Boolean),
	]);
	await owner?.end();
	await runtimePool().end();
});

/** Runs `before`, then creates a Budget from `input`, as the golden user at the golden clock
 * unless `ctx` says otherwise. */
function create(
	input: unknown,
	{
		before = async () => {},
		ctx = goldenContext(userId),
	}: { before?: (tx: Tx) => Promise<unknown>; ctx?: ProfiledContext } = {},
) {
	return asUser(ctx.user.id, async (tx) => {
		await before(tx);
		return createBudget(tx, ctx, input);
	});
}

const invalid = (fields: Record<string, string>) => ({
	code: "validation_failed",
	fields,
	details: {},
});

const RANGE = "Choose a month from Nov 2023 to Nov 2027.";

describe("a create from a month", () => {
	// F04 flow 7.1
	test("stores health at 1,500.00 from November at version 1, at the request clock, in three statements", async () => {
		const input = budgetBody();
		const { result, statements } = await create(input);
		expect(result).toEqual({
			created: true,
			budget: {
				id: input["id"],
				category: "health",
				schedule: [{ from: "2026-11", limitMinor: 150000 }],
				overrides: [],
				version: 1,
				demo: false,
				createdAt: GOLDEN_NOW,
				updatedAt: GOLDEN_NOW,
				currency: "INR",
			},
		});
		// The profile lock, the id lookup and the insert.
		expect(statements).toBe(3);
	});

	test("is in the month view at once", async () => {
		const { result: view } = await asUser(userId, async (tx) => {
			await createBudget(tx, goldenContext(userId), budgetBody());
			return budgetMonth(tx, goldenContext(userId), "2026-11");
		});
		expect(view.budgets.find((row) => row.category === "health")).toMatchObject({
			limitMinor: 150000,
			spentMinor: 0,
			state: "ok",
		});
		expect(view.overall.limitMinor).toBe(1250000);
	});

	// AC-F04-11: the ends of the range are allowed.
	test.each(["2023-11", "2027-11"])(
		"accepts %s, an end of the range",
		async (from) => {
			const { result } = await create(budgetBody({ from }));
			expect(result.budget.schedule).toEqual([{ from, limitMinor: 150000 }]);
		},
	);

	// AC-F04-11
	test.each(["2023-10", "2027-12", "2020-01"])(
		"refuses %s, outside the range, with 422 on from",
		async (from) => {
			expect(await refusal(create(budgetBody({ from })))).toEqual(
				invalid({ from: RANGE }),
			);
		},
	);

	test("takes the range from the profile zone's month", async () => {
		// 23:00 on 31 October in Kolkata: the current month is October, the range ends Oct 2027.
		const ctx = {
			...goldenContext(userId),
			now: new Date("2026-10-31T17:30:00Z"),
			today: "2026-10-31",
		};
		const input = budgetBody({
			id: uuidV7At("2026-10-31T17:30:00Z"),
			from: "2027-11",
		});
		expect(await refusal(create(input, { ctx }))).toEqual(
			invalid({ from: "Choose a month from Oct 2023 to Oct 2027." }),
		);
	});

	// BR-P2-20: the id's time may run 5 minutes past the clock, not more.
	test("refuses an id from more than 5 minutes ahead, and takes one from 4", async () => {
		const ahead = (minutes: number) =>
			uuidV7At(new Date(Date.parse(GOLDEN_NOW) + minutes * 60_000));
		expect(await refusal(create(budgetBody({ id: ahead(6) })))).toEqual(
			invalid({ id: BUDGET_MESSAGES.idInFuture }),
		);
		expect((await create(budgetBody({ id: ahead(4) }))).result.created).toBe(
			true,
		);
	});

	test("names a month out of range and an id from the future together", async () => {
		const id = uuidV7At(new Date(Date.parse(GOLDEN_NOW) + 3_600_000));
		expect(await refusal(create(budgetBody({ id, from: "2030-01" })))).toEqual(
			invalid({ from: RANGE, id: BUDGET_MESSAGES.idInFuture }),
		);
	});
});

describe("the body", () => {
	test("is checked before any statement: 422 with field paths", async () => {
		const { statements } = await asUser(userId, async (tx) => {
			expect(
				await refusal(
					createBudget(
						tx,
						goldenContext(userId),
						budgetBody({ category: "salary", currency: "XYZ" }),
					),
				),
			).toEqual(
				invalid({
					category: BUDGET_MESSAGES.categoryRequired,
					currency: BUDGET_MESSAGES.currency,
				}),
			);
		});
		expect(statements).toBe(0);
	});

	test("refuses a limit above INR's largest", async () => {
		expect(
			await refusal(create(budgetBody({ limitMinor: 100000000000 }))),
		).toEqual(invalid({ limitMinor: "The largest amount is 999,999,999.99." }));
	});

	// BR-F04-22, D-213
	test("in another currency is 422 currency_mismatch", async () => {
		expect(await refusal(create(budgetBody({ currency: "USD" })))).toMatchObject(
			{
				code: "currency_mismatch",
			},
		);
	});
});

describe("one Budget per category (BR-F04-01)", () => {
	// AC-F04-08: after the first.
	test("a second create for food is 409 budget_exists, with the food Budget", async () => {
		expect(
			await refusal(create(budgetBody({ category: "food", from: "2026-11" }))),
		).toEqual({
			code: "budget_exists",
			fields: {},
			details: {
				current: {
					id: ids["food"],
					category: "food",
					schedule: [
						{ from: "2026-09", limitMinor: 600000 },
						{ from: "2026-10", limitMinor: 500000 },
					],
					overrides: [],
					version: 2,
					demo: false,
					createdAt: GOLDEN_NOW,
					updatedAt: GOLDEN_NOW,
					currency: "INR",
				},
			},
		});
	});

	test("a Budget with no limit this month still takes its category", async () => {
		// Golden transportation starts in October; a create for it is still refused.
		expect(
			await refusal(
				create(budgetBody({ category: "transportation", from: "2026-09" })),
			),
		).toMatchObject({
			code: "budget_exists",
			details: { current: { id: ids["transportation"] } },
		});
	});

	// AC-F04-08: at the same moment. The other request has inserted health and not committed;
	// this create waits on its row, then finds health taken.
	test("a create racing another for health gets budget_exists once that one commits", async () => {
		const holder = new Client({
			connectionString: parseOwnerEnv(process.env).DATABASE_URL_OWNER,
		});
		await holder.connect();
		const theirs = budgetBody();
		try {
			await holder.query("BEGIN");
			await holder.query(
				`INSERT INTO app.budgets (id, user_id, created_at, updated_at, category, schedule, overrides)
				 VALUES ($1, $2, $3, $3, 'health', '[{"from": "2026-11", "limitMinor": 100000}]', '[]')`,
				[theirs["id"], userId, GOLDEN_NOW],
			);
			const pending = refusal(create(budgetBody()));
			await waitForWaiterOn(owner, await transactionIdOf(holder));
			await holder.query("COMMIT");
			expect(await pending).toMatchObject({
				code: "budget_exists",
				details: { current: { id: theirs["id"], category: "health" } },
			});
		} finally {
			await holder.query("ROLLBACK").catch(() => {});
			await holder.end();
			await owner.query("DELETE FROM app.budgets WHERE id = $1", [
				theirs["id"],
			]);
		}
	});

	test("a create racing the same id answers that Budget once it commits, as done (API-5)", async () => {
		const holder = new Client({
			connectionString: parseOwnerEnv(process.env).DATABASE_URL_OWNER,
		});
		await holder.connect();
		const input = budgetBody();
		try {
			await holder.query("BEGIN");
			await holder.query(
				`INSERT INTO app.budgets (id, user_id, created_at, updated_at, category, schedule, overrides)
				 VALUES ($1, $2, $3, $3, 'health', '[{"from": "2026-11", "limitMinor": 150000}]', '[]')`,
				[input["id"], userId, GOLDEN_NOW],
			);
			const pending = create(input);
			await waitForWaiterOn(owner, await transactionIdOf(holder));
			await holder.query("COMMIT");
			const { result, statements } = await pending;
			expect(result).toMatchObject({
				created: false,
				budget: { id: input["id"] },
			});
			// The lock, the lookup, the insert that found the row, and the re-read.
			expect(statements).toBe(4);
		} finally {
			await holder.query("ROLLBACK").catch(() => {});
			await holder.end();
			await owner.query("DELETE FROM app.budgets WHERE id = $1", [
				input["id"],
			]);
		}
	});

	test("a create racing one that rolls back creates its Budget", async () => {
		const holder = new Client({
			connectionString: parseOwnerEnv(process.env).DATABASE_URL_OWNER,
		});
		await holder.connect();
		try {
			await holder.query("BEGIN");
			await holder.query(
				`INSERT INTO app.budgets (id, user_id, created_at, updated_at, category, schedule, overrides)
				 VALUES ($1, $2, $3, $3, 'health', '[{"from": "2026-11", "limitMinor": 100000}]', '[]')`,
				[uuidV7At(GOLDEN_NOW), userId, GOLDEN_NOW],
			);
			const pending = create(budgetBody());
			await waitForWaiterOn(owner, await transactionIdOf(holder));
			await holder.query("ROLLBACK");
			expect((await pending).result.created).toBe(true);
		} finally {
			await holder.end();
		}
	});
});

describe("the id (API-5, BR-P2-20)", () => {
	test("one the user has answers that Budget unchanged, whatever the body now says", async () => {
		const input = budgetBody();
		const { result, statements } = await create(
			{ ...input, limitMinor: 990000, from: "2030-01", currency: "USD" },
			{ before: (tx) => createBudget(tx, goldenContext(userId), input) },
		);
		expect(result).toEqual({
			created: false,
			budget: expect.objectContaining({
				id: input["id"],
				schedule: [{ from: "2026-11", limitMinor: 150000 }],
				version: 1,
				currency: "INR",
			}),
		});
		// The first create's three, then this one's lock and lookup.
		expect(statements).toBe(5);
	});

	test("is found in capitals too", async () => {
		const input = budgetBody();
		const { result } = await create(
			{ ...input, id: String(input["id"]).toUpperCase() },
			{ before: (tx) => createBudget(tx, goldenContext(userId), input) },
		);
		expect(result).toMatchObject({
			created: false,
			budget: { id: input["id"] },
		});
	});

	test("another user's id is 409 id_conflict, and their Budget stays as it was", async () => {
		const taken = uuidV7At(GOLDEN_NOW);
		await owner.query(
			`INSERT INTO app.budgets (id, user_id, created_at, updated_at, category, schedule, overrides)
			 VALUES ($1, $2, $3, $3, 'health', '[{"from": "2026-11", "limitMinor": 1}]', '[]')`,
			[taken, other, GOLDEN_NOW],
		);
		try {
			expect(await refusal(create(budgetBody({ id: taken })))).toMatchObject({
				code: "id_conflict",
			});
			const { rows } = await owner.query(
				"SELECT user_id, schedule FROM app.budgets WHERE id = $1",
				[taken],
			);
			expect(rows).toEqual([
				{ user_id: other, schedule: [{ from: "2026-11", limitMinor: 1 }] },
			]);
		} finally {
			await owner.query("DELETE FROM app.budgets WHERE id = $1", [taken]);
		}
	});

	test("another user's id for a category this user has is still id_conflict, never budget_exists", async () => {
		const taken = uuidV7At(GOLDEN_NOW);
		await owner.query(
			`INSERT INTO app.budgets (id, user_id, created_at, updated_at, category, schedule, overrides)
			 VALUES ($1, $2, $3, $3, 'health', '[{"from": "2026-11", "limitMinor": 1}]', '[]')`,
			[taken, other, GOLDEN_NOW],
		);
		try {
			expect(
				await refusal(create(budgetBody({ id: taken, category: "health" }))),
			).toMatchObject({ code: "id_conflict" });
		} finally {
			await owner.query("DELETE FROM app.budgets WHERE id = $1", [taken]);
		}
	});
});

describe("a restoring create (BR-F04-33)", () => {
	// AC-F04-18: Undo after a delete puts the Budget back under a new id.
	test("re-creates deleted food with its schedule and one-month limits, and the same month views", async () => {
		const ctx = goldenContext(userId);
		const restored = {
			id: uuidV7At(GOLDEN_NOW),
			category: "food",
			schedule: [
				{ from: "2026-09", limitMinor: 600000 },
				{ from: "2026-10", limitMinor: 500000 },
			],
			overrides: [],
			currency: "INR",
		};
		const { result } = await asUser(userId, async (tx) => {
			const before = await Promise.all(
				["2026-09", "2026-10", "2026-11"].map((month) =>
					budgetMonth(tx, ctx, month),
				),
			);
			await tx.execute(sql`DELETE FROM app.budgets WHERE category = 'food'`);
			const created = await createBudget(tx, ctx, restored);
			const after = await Promise.all(
				["2026-09", "2026-10", "2026-11"].map((month) =>
					budgetMonth(tx, ctx, month),
				),
			);
			return { before, after, created };
		});
		expect(result.created).toMatchObject({
			created: true,
			budget: { id: restored.id, version: 1, schedule: restored.schedule },
		});
		const figures = (views: typeof result.before) =>
			views.map((view) => [
				view.overall,
				view.unbudgeted,
				view.budgets.map((row) => [
					row.category,
					row.limitMinor,
					row.utilizationTenths,
				]),
			]);
		expect(figures(result.after)).toEqual(figures(result.before));
	});

	// AC-F04-28: a restoring create's months are not range-checked.
	test("keeps months outside the range, and stores the one-month limits as sent", async () => {
		const input = {
			id: uuidV7At(GOLDEN_NOW),
			category: "health",
			schedule: [
				{ from: "2001-01", limitMinor: 100000 },
				{ from: "2026-10", limitMinor: 150000 },
			],
			overrides: [
				{ month: "2026-12", limitMinor: 150000 },
				{ month: "2001-02", limitMinor: null },
			],
			currency: "INR",
		};
		const { result } = await create(input);
		expect(result.budget).toMatchObject({
			schedule: input.schedule,
			overrides: [
				{ month: "2001-02", limitMinor: null },
				{ month: "2026-12", limitMinor: 150000 },
			],
		});
	});

	test("refuses a schedule with no limit", async () => {
		expect(
			await refusal(
				create({
					id: uuidV7At(GOLDEN_NOW),
					category: "health",
					schedule: [{ from: "2026-10", limitMinor: null }],
					overrides: [],
					currency: "INR",
				}),
			),
		).toEqual(invalid({ schedule: BUDGET_MESSAGES.scheduleNeedsLimit }));
	});

	test("for a category taken is budget_exists like any create", async () => {
		expect(
			await refusal(
				create({
					id: uuidV7At(GOLDEN_NOW),
					category: "shopping",
					schedule: [{ from: "2026-09", limitMinor: 300000 }],
					overrides: [],
					currency: "INR",
				}),
			),
		).toMatchObject({ code: "budget_exists" });
	});
});

describe("the profile lock (BR-F04-22, D-213)", () => {
	test("waits for a currency change in flight, then answers", async () => {
		const holder = new Client({
			connectionString: parseOwnerEnv(process.env).DATABASE_URL_OWNER,
		});
		await holder.connect();
		try {
			await holder.query("BEGIN");
			await holder.query(
				"SELECT 1 FROM app.profile WHERE user_id = $1 FOR UPDATE",
				[userId],
			);
			const pending = create(budgetBody());
			await waitForWaiterOn(owner, await transactionIdOf(holder));
			await holder.query("COMMIT");
			expect((await pending).result.created).toBe(true);
		} finally {
			await holder.query("ROLLBACK").catch(() => {});
			await holder.end();
		}
	});

	test("without a profile, the create is 403 profile_required", async () => {
		expect(
			await refusal(create(budgetBody(), { ctx: goldenContext(noProfile) })),
		).toMatchObject({ code: "profile_required" });
	});
});

test("the stored row is the one answered", async () => {
	const input = budgetBody();
	const { result } = await asUser(userId, async (tx) => {
		const { budget } = await createBudget(tx, goldenContext(userId), input);
		return { budget, stored: await getBudget(tx, String(input["id"])) };
	});
	expect({ ...result.stored, currency: "INR" }).toEqual(result.budget);
});
