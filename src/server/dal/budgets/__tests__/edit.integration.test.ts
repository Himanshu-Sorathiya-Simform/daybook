import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

import { GOLDEN_NOW } from "../../../../../seed/golden";
import { BUDGET_MESSAGES } from "@/lib/budgets/schemas";
import { runtimePool } from "../../../db/pools";
import { parseOwnerEnv } from "../../../env";
import { asUser, goldenContext } from "../../transactions/__tests__/helpers";
import type { Tx } from "../../with-user";
import { deleteBudget, editBudget, removeMonthLimit } from "../edit";
import { budgetMonth } from "../read";
import { getBudget } from "../row";
import {
	goldenBudgetUser,
	refusal,
	transactionIdOf,
	waitForWaiterOn,
} from "./helpers";

/** `editBudget`, `removeMonthLimit` and `deleteBudget` (F04 section 11, BR-F04-03 to
 * BR-F04-07, BR-F04-23 to BR-F04-25, BR-F04-33, BR-F04-36, BR-P2-21; D-561) through the runtime
 * role and RLS, on the golden Budgets. Every case rolls back, an hour after the golden clock. */

let owner: Client;
let userId: string;
let ids: Record<string, string>;
let other: string;
let otherIds: Record<string, string>;

beforeAll(async () => {
	owner = new Client({
		connectionString: parseOwnerEnv(process.env).DATABASE_URL_OWNER,
	});
	await owner.connect();
	({ userId, ids } = await goldenBudgetUser(owner, "budget-edit"));
	({ userId: other, ids: otherIds } = await goldenBudgetUser(
		owner,
		"budget-edit-other",
	));
});

afterAll(async () => {
	await owner?.query(`DELETE FROM auth."user" WHERE id = ANY($1)`, [
		[userId, other].filter(Boolean),
	]);
	await owner?.end();
	await runtimePool().end();
});

// An hour after the golden clock, still 2 November in Kolkata, so updatedAt moves.
const LATER = "2026-11-02T07:30:00.000Z";
const ctx = () => ({ ...goldenContext(userId), now: new Date(LATER) });

const FOOD = [
	{ from: "2026-09", limitMinor: 600000 },
	{ from: "2026-10", limitMinor: 500000 },
];

/** Runs `fn` as the golden user, in a transaction that rolls back. */
const as = <T>(fn: (tx: Tx) => Promise<T>) => asUser(userId, fn);

/** Edits golden `category`'s Budget with `input` at `version`, then reads `months`' views. */
function edit(
	category: string,
	input: unknown,
	{ version, months = [] }: { version?: number; months?: string[] } = {},
) {
	return as(async (tx) => {
		const budget = await editBudget(
			tx,
			ctx(),
			ids[category] as string,
			version ?? (category === "food" ? 2 : 1),
			input,
		);
		const views = [];
		for (const month of months) views.push(await budgetMonth(tx, ctx(), month));
		return { budget, views };
	});
}

const invalid = (fields: Record<string, string>) => ({
	code: "validation_failed",
	fields,
	details: {},
});

const RANGE = "Choose a month from Nov 2023 to Nov 2027.";

describe("a change from a month onward (BR-F04-03)", () => {
	// AC-F04-03
	test("food at 7,000.00 from September replaces October's entry: 72.1% and 88.9%", async () => {
		const { result } = await edit(
			"food",
			{ from: "2026-09", limitMinor: 700000, currency: "INR" },
			{ months: ["2026-09", "2026-10"] },
		);
		expect(result.budget).toEqual({
			id: ids["food"],
			category: "food",
			schedule: [{ from: "2026-09", limitMinor: 700000 }],
			overrides: [],
			version: 3,
			demo: false,
			createdAt: GOLDEN_NOW,
			updatedAt: LATER,
			currency: "INR",
		});
		const food = (index: number) =>
			result.views[index]?.budgets.find((row) => row.category === "food");
		expect(food(0)).toMatchObject({ utilizationTenths: 721, state: "ok" });
		expect(food(1)).toMatchObject({ utilizationTenths: 889, state: "warning" });
	});

	test("takes three statements: the lock, the Budget and the update", async () => {
		const { statements } = await edit("food", {
			from: "2026-12",
			limitMinor: 700000,
			currency: "INR",
		});
		expect(statements).toBe(3);
	});

	test("adds an entry for a later month and keeps the earlier ones", async () => {
		const { result } = await edit("food", {
			from: "2027-02",
			limitMinor: 700000,
			currency: "INR",
		});
		expect(result.budget.schedule).toEqual([
			...FOOD,
			{ from: "2027-02", limitMinor: 700000 },
		]);
	});

	// AC-F04-05 at the database: 5,000.00 from November changes nothing.
	test("the limit already in force saves nothing and keeps the version (BR-F04-36)", async () => {
		const { result, statements } = await edit("food", {
			from: "2026-11",
			limitMinor: 500000,
			currency: "INR",
		});
		expect(result.budget).toMatchObject({
			schedule: FOOD,
			version: 2,
			updatedAt: GOLDEN_NOW,
		});
		// The lock and the Budget; no update.
		expect(statements).toBe(2);
	});

	// AC-F04-11
	test.each(["2023-10", "2027-12"])(
		"refuses %s, outside the range",
		async (from) => {
			expect(
				await refusal(
					edit("food", { from, limitMinor: 700000, currency: "INR" }),
				),
			).toEqual(invalid({ from: RANGE }));
		},
	);

	test.each(["2023-11", "2027-11"])(
		"accepts %s, an end of the range",
		async (from) => {
			const { result } = await edit("food", {
				from,
				limitMinor: 700000,
				currency: "INR",
			});
			expect(result.budget.version).toBe(3);
		},
	);
});

describe("stopping from a month onward (BR-F04-04)", () => {
	// AC-F04-04
	test("entertainment from November leaves September and October, and November reads 4.2%", async () => {
		const { result } = await edit(
			"entertainment",
			{ from: "2026-11", limitMinor: null },
			{ months: ["2026-09", "2026-10", "2026-11"] },
		);
		expect(result.budget.schedule).toEqual([
			{ from: "2026-09", limitMinor: 100000 },
			{ from: "2026-11", limitMinor: null },
		]);
		const [september, october, november] = result.views;
		expect(september?.overall.utilizationTenths).toBe(810);
		expect(october?.overall.utilizationTenths).toBe(1197);
		expect(november?.overall).toMatchObject({
			limitMinor: 1000000,
			utilizationTenths: 42,
		});
		expect(november?.inactive).toEqual([
			expect.objectContaining({
				category: "entertainment",
				status: "stopped",
			}),
		]);
	});

	// AC-F04-04
	test.each(["2026-09", "2026-08", "2023-11"])(
		"from %s, at or before its first entry, is 422: delete instead",
		async (from) => {
			expect(
				await refusal(edit("entertainment", { from, limitMinor: null })),
			).toEqual(invalid({ from: BUDGET_MESSAGES.stopRemovesEveryMonth }));
		},
	);

	test("may send the currency, which must match", async () => {
		const { result } = await edit("entertainment", {
			from: "2026-11",
			limitMinor: null,
			currency: "INR",
		});
		expect(result.budget.version).toBe(2);
		expect(
			await refusal(
				edit("entertainment", {
					from: "2026-11",
					limitMinor: null,
					currency: "EUR",
				}),
			),
		).toMatchObject({ code: "currency_mismatch" });
	});

	// AC-F04-27 through a restoring write.
	test("a stopped and restarted Budget reads stopped, then starts again", async () => {
		const { result } = await edit(
			"food",
			{
				schedule: [
					{ from: "2026-09", limitMinor: 600000 },
					{ from: "2026-11", limitMinor: null },
					{ from: "2027-02", limitMinor: 400000 },
				],
				overrides: [],
				currency: "INR",
			},
			{ months: ["2026-12"] },
		);
		expect(result.views[0]?.inactive).toEqual([
			expect.objectContaining({
				category: "food",
				status: "stopped",
				from: "2026-11",
				restartsFrom: "2027-02",
			}),
		]);
	});
});

describe("one month only (BR-F04-24, BR-F04-25)", () => {
	// AC-F04-14
	test("food at 8,000.00 for October: 77.8% On track, October overall 94.1%", async () => {
		const { result } = await edit(
			"food",
			{
				month: "2026-10",
				limitMinor: 800000,
				currency: "INR",
				scope: "month",
			},
			{ months: ["2026-09", "2026-10", "2026-11"] },
		);
		expect(result.budget).toMatchObject({
			schedule: FOOD,
			overrides: [{ month: "2026-10", limitMinor: 800000 }],
			version: 3,
		});
		const [september, october, november] = result.views;
		expect(
			october?.budgets.find((row) => row.category === "food"),
		).toMatchObject({
			utilizationTenths: 778,
			state: "ok",
			source: { kind: "override", month: "2026-10", limitMinor: 800000 },
		});
		expect(october?.overall).toMatchObject({
			limitMinor: 1400000,
			utilizationTenths: 941,
		});
		expect(september?.overall.utilizationTenths).toBe(810);
		expect(november?.overall.utilizationTenths).toBe(38);
	});

	// AC-F04-15
	test("no limit for entertainment in October: 110.2%, unbudgeted 20,148.00, skipped", async () => {
		const { result } = await edit(
			"entertainment",
			{ month: "2026-10", limitMinor: null, scope: "month" },
			{ months: ["2026-10"] },
		);
		const october = result.views[0];
		expect(october?.overall).toMatchObject({
			limitMinor: 1000000,
			spentMinor: 1102000,
			utilizationTenths: 1102,
			state: "over",
		});
		expect(october?.unbudgetedMinor).toBe(2014800);
		expect(october?.inactive).toEqual([
			expect.objectContaining({
				category: "entertainment",
				status: "skipped",
			}),
		]);
	});

	// AC-F04-16 at the database.
	test("5,000.00 for November on food stores nothing and keeps the version", async () => {
		const { result } = await edit("food", {
			month: "2026-11",
			limitMinor: 500000,
			currency: "INR",
			scope: "month",
		});
		expect(result.budget).toMatchObject({ overrides: [], version: 2 });
	});

	// AC-F04-16 at the database.
	test("a later change from September keeps October's one-month limit: 72.1%, 77.8%, 6.0%", async () => {
		const { result } = await as(async (tx) => {
			const raised = await editBudget(tx, ctx(), ids["food"] as string, 2, {
				month: "2026-10",
				limitMinor: 800000,
				currency: "INR",
				scope: "month",
			});
			await editBudget(tx, ctx(), ids["food"] as string, raised.version, {
				from: "2026-09",
				limitMinor: 700000,
				currency: "INR",
			});
			const tenths = [];
			for (const month of ["2026-09", "2026-10", "2026-11"]) {
				const view = await budgetMonth(tx, ctx(), month);
				tenths.push(
					view.budgets.find((row) => row.category === "food")
						?.utilizationTenths,
				);
			}
			return tenths;
		});
		expect(result).toEqual([721, 778, 60]);
	});

	test("gives transportation a Budget in September, before it starts", async () => {
		const { result } = await edit(
			"transportation",
			{ month: "2026-09", limitMinor: 50000, currency: "INR", scope: "month" },
			{ months: ["2026-09"] },
		);
		expect(
			result.views[0]?.budgets.find(
				(row) => row.category === "transportation",
			),
		).toMatchObject({
			limitMinor: 50000,
			spentMinor: 45000,
			utilizationTenths: 900,
		});
	});

	// AC-F04-11
	test.each(["2023-10", "2027-12"])(
		"refuses %s, outside the range, on month",
		async (month) => {
			expect(
				await refusal(
					edit("food", {
						month,
						limitMinor: 1,
						currency: "INR",
						scope: "month",
					}),
				),
			).toEqual(invalid({ month: RANGE }));
		},
	);

	// AC-F04-11: both ends of the range take a one-month limit.
	test.each(["2023-11", "2027-11"])(
		"accepts %s, an end of the range",
		async (month) => {
			const { result } = await edit("food", {
				month,
				limitMinor: 1,
				currency: "INR",
				scope: "month",
			});
			expect(result.budget.overrides).toEqual([{ month, limitMinor: 1 }]);
		},
	);
});

describe("restoring (BR-F04-33)", () => {
	// AC-F04-18: Undo after a change puts back the schedule and one-month limits exactly.
	test("puts food back exactly, with month views equal to the originals", async () => {
		const { result } = await as(async (tx) => {
			const months = ["2026-09", "2026-10", "2026-11"];
			const views = async () => {
				const all = [];
				for (const month of months)
					all.push(await budgetMonth(tx, ctx(), month));
				return all.map((view) => [
					view.overall,
					view.unbudgeted,
					view.inactive.length,
				]);
			};
			const before = await views();
			const changed = await editBudget(tx, ctx(), ids["food"] as string, 2, {
				from: "2026-09",
				limitMinor: 700000,
				currency: "INR",
			});
			const restored = await editBudget(
				tx,
				ctx(),
				ids["food"] as string,
				changed.version,
				{
					schedule: FOOD,
					overrides: [],
					currency: "INR",
				},
			);
			return { before, after: await views(), restored };
		});
		expect(result.restored).toMatchObject({
			schedule: FOOD,
			overrides: [],
			version: 4,
		});
		expect(result.after).toEqual(result.before);
	});

	test("stores one-month limits as sent, even one equal to the schedule", async () => {
		const { result } = await edit("food", {
			schedule: FOOD,
			overrides: [
				{ month: "2026-11", limitMinor: 500000 },
				{ month: "2026-10", limitMinor: null },
			],
			currency: "INR",
		});
		expect(result.budget.overrides).toEqual([
			{ month: "2026-10", limitMinor: null },
			{ month: "2026-11", limitMinor: 500000 },
		]);
	});

	// AC-F04-28
	test("accepts an entry from 2001-01, outside the range", async () => {
		const { result } = await edit("food", {
			schedule: [{ from: "2001-01", limitMinor: 100000 }, ...FOOD],
			overrides: [],
			currency: "INR",
		});
		expect(result.budget.schedule[0]).toEqual({
			from: "2001-01",
			limitMinor: 100000,
		});
	});

	// AC-F04-28
	test("refuses repeated one-month months, a schedule with no limit, and another currency", async () => {
		expect(
			await refusal(
				edit("food", {
					schedule: FOOD,
					overrides: [
						{ month: "2026-10", limitMinor: 1 },
						{ month: "2026-10", limitMinor: 2 },
					],
					currency: "INR",
				}),
			),
		).toEqual(invalid({ overrides: BUDGET_MESSAGES.overrideMonths }));
		expect(
			await refusal(
				edit("food", {
					schedule: [{ from: "2026-09", limitMinor: null }],
					overrides: [],
					currency: "INR",
				}),
			),
		).toEqual(invalid({ schedule: BUDGET_MESSAGES.scheduleNeedsLimit }));
		expect(
			await refusal(
				edit("food", { schedule: FOOD, overrides: [], currency: "USD" }),
			),
		).toMatchObject({ code: "currency_mismatch" });
	});

	test("the same lists save nothing and keep the version", async () => {
		const { result } = await edit("food", {
			schedule: FOOD,
			overrides: [],
			currency: "INR",
		});
		expect(result.budget).toMatchObject({ version: 2, updatedAt: GOLDEN_NOW });
	});
});

describe("versions and refusals (BR-F04-23, BR-P2-21)", () => {
	// AC-F04-09: the Budget holds a one-month limit, so the 409 must carry it.
	test("a stale If-Match is 409 with the current schedule and one-month limits", async () => {
		const { result } = await as(async (tx) => {
			await editBudget(tx, ctx(), ids["food"] as string, 2, {
				month: "2026-10",
				limitMinor: 800000,
				currency: "INR",
				scope: "month",
			});
			return refusal(
				editBudget(tx, ctx(), ids["food"] as string, 2, {
					from: "2026-12",
					limitMinor: 1,
					currency: "INR",
				}),
			);
		});
		expect(result).toEqual({
			code: "version_conflict",
			fields: {},
			details: {
				current: {
					id: ids["food"],
					category: "food",
					schedule: FOOD,
					overrides: [{ month: "2026-10", limitMinor: 800000 }],
					version: 3,
					demo: false,
					createdAt: GOLDEN_NOW,
					updatedAt: LATER,
					currency: "INR",
				},
			},
		});
	});

	test("a stale If-Match on golden food is 409 with it as stored", async () => {
		expect(
			await refusal(
				edit(
					"food",
					{ from: "2026-12", limitMinor: 1, currency: "INR" },
					{ version: 1 },
				),
			),
		).toMatchObject({
			code: "version_conflict",
			details: {
				current: {
					id: ids["food"],
					schedule: FOOD,
					overrides: [],
					version: 2,
				},
			},
		});
	});

	// AC-F04-24: the version check comes first.
	test("a stale If-Match is 409 even for a change that would change nothing", async () => {
		expect(
			await refusal(
				edit(
					"food",
					{ from: "2026-11", limitMinor: 500000, currency: "INR" },
					{ version: 1 },
				),
			),
		).toMatchObject({ code: "version_conflict" });
	});

	test("a stale If-Match is 409 before a refused stop is judged", async () => {
		expect(
			await refusal(
				edit(
					"entertainment",
					{ from: "2026-09", limitMinor: null },
					{ version: 7 },
				),
			),
		).toMatchObject({ code: "version_conflict" });
	});

	test("an id that is no UUID is 404 before any statement", async () => {
		const { result, statements } = await as((tx) =>
			refusal(
				editBudget(tx, ctx(), "food", 2, {
					from: "2026-11",
					limitMinor: null,
				}),
			),
		);
		expect(result).toMatchObject({ code: "not_found" });
		expect(statements).toBe(0);
	});

	test("an unknown id, or another user's, is 404, and theirs stays as it was", async () => {
		for (const id of [randomUUID(), otherIds["food"] as string]) {
			const { result } = await as((tx) =>
				refusal(
					editBudget(tx, ctx(), id, 2, {
						from: "2026-11",
						limitMinor: null,
					}),
				),
			);
			expect(result).toMatchObject({ code: "not_found" });
		}
		const { rows } = await owner.query(
			"SELECT version FROM app.budgets WHERE id = $1",
			[otherIds["food"]],
		);
		expect(rows).toEqual([{ version: 2 }]);
	});

	test("an unreadable body is 422 before any statement", async () => {
		const { result, statements } = await as((tx) =>
			refusal(editBudget(tx, ctx(), ids["food"] as string, 2, {})),
		);
		expect(result).toEqual(invalid({ _body: BUDGET_MESSAGES.shape }));
		expect(statements).toBe(0);
	});

	// BR-F04-22: the profile lock comes first, so a currency change in flight is waited for.
	test("waits for a currency change in flight, then saves", async () => {
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
			const pending = edit("food", {
				from: "2026-12",
				limitMinor: 1,
				currency: "INR",
			});
			await waitForWaiterOn(owner, await transactionIdOf(holder));
			await holder.query("COMMIT");
			expect((await pending).result.budget.version).toBe(3);
		} finally {
			await holder.query("ROLLBACK").catch(() => {});
			await holder.end();
		}
	});
});

describe("removeMonthLimit (BR-F04-25)", () => {
	/** Gives food October's one-month limit at version 3, then runs `fn`. */
	const withOctober = <T>(fn: (tx: Tx) => Promise<T>) =>
		as(async (tx) => {
			await editBudget(tx, ctx(), ids["food"] as string, 2, {
				month: "2026-10",
				limitMinor: 800000,
				currency: "INR",
				scope: "month",
			});
			return fn(tx);
		});

	// AC-F04-17
	test("removes October's one-month limit and answers the Budget at a new version", async () => {
		const { result } = await withOctober((tx) =>
			removeMonthLimit(tx, ctx(), ids["food"] as string, "2026-10", 3),
		);
		expect(result).toMatchObject({
			schedule: FOOD,
			overrides: [],
			version: 4,
			currency: "INR",
		});
	});

	// AC-F04-17
	test("a month with no one-month limit is 404", async () => {
		const { result } = await withOctober((tx) =>
			refusal(
				removeMonthLimit(tx, ctx(), ids["food"] as string, "2026-11", 3),
			),
		);
		expect(result).toMatchObject({ code: "not_found" });
	});

	// AC-F04-17
	test("a stale If-Match is 409 with the Budget", async () => {
		const { result } = await withOctober((tx) =>
			refusal(
				removeMonthLimit(tx, ctx(), ids["food"] as string, "2026-10", 2),
			),
		);
		expect(result).toMatchObject({
			code: "version_conflict",
			details: {
				current: { overrides: [{ month: "2026-10", limitMinor: 800000 }] },
			},
		});
	});

	test.each([
		["no UUID", "food", "2026-10"],
		["no month", "", "2026-1"],
		["a date", "", "2026-10-01"],
	])(
		"an id or month that is %s is 404 before any statement",
		async (_name, id, month) => {
			const { result, statements } = await as((tx) =>
				refusal(
					removeMonthLimit(
						tx,
						ctx(),
						id || (ids["food"] as string),
						month,
						2,
					),
				),
			);
			expect(result).toMatchObject({ code: "not_found" });
			expect(statements).toBe(0);
		},
	);

	test("another user's Budget is 404", async () => {
		const { result } = await as((tx) =>
			refusal(
				removeMonthLimit(
					tx,
					ctx(),
					otherIds["food"] as string,
					"2026-10",
					2,
				),
			),
		);
		expect(result).toMatchObject({ code: "not_found" });
	});
});

describe("deleteBudget (BR-F04-06)", () => {
	test("removes food from every month, past ones included", async () => {
		const { result, statements } = await as(async (tx) => {
			await deleteBudget(tx, ctx(), ids["food"] as string, 2);
			return {
				stored: await getBudget(tx, ids["food"] as string),
				september: await budgetMonth(tx, ctx(), "2026-09"),
			};
		});
		// The lock, the delete, the Budget and the month view.
		expect(statements).toBe(4);
		expect(result.stored).toBeNull();
		expect(result.september.budgets.map((row) => row.category)).toEqual([
			"shopping",
			"entertainment",
		]);
		expect(result.september.unbudgeted[1]).toEqual({
			category: "food",
			spentMinor: 505000,
			budgetId: null,
		});
	});

	test("a stale If-Match is 409 with the Budget, and nothing is deleted", async () => {
		const { result } = await as(async (tx) => ({
			refused: await refusal(
				deleteBudget(tx, ctx(), ids["food"] as string, 1),
			),
			stored: await getBudget(tx, ids["food"] as string),
		}));
		expect(result.refused).toMatchObject({
			code: "version_conflict",
			details: { current: { id: ids["food"], version: 2, currency: "INR" } },
		});
		expect(result.stored).not.toBeNull();
	});

	test("a second delete is 404, which the client counts as done", async () => {
		const { result } = await as(async (tx) => {
			await deleteBudget(tx, ctx(), ids["food"] as string, 2);
			return refusal(deleteBudget(tx, ctx(), ids["food"] as string, 2));
		});
		expect(result).toMatchObject({ code: "not_found" });
	});

	test("an id that is no UUID is 404 before any statement; another user's is 404", async () => {
		const { result, statements } = await as((tx) =>
			refusal(deleteBudget(tx, ctx(), "food", 2)),
		);
		expect(result).toMatchObject({ code: "not_found" });
		expect(statements).toBe(0);
		const theirs = await as((tx) =>
			refusal(deleteBudget(tx, ctx(), otherIds["food"] as string, 2)),
		);
		expect(theirs.result).toMatchObject({ code: "not_found" });
		const { rows } = await owner.query(
			"SELECT id FROM app.budgets WHERE id = $1",
			[otherIds["food"]],
		);
		expect(rows).toHaveLength(1);
	});
});
