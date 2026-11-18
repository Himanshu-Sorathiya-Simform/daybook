import { describe, expect, test } from "vitest";

import { isUuidV7 } from "@/lib/ids";

import {
	GOLDEN_ALL,
	GOLDEN_BUDGETS,
	GOLDEN_GOALS,
	GOLDEN_NOW,
	GOLDEN_PENDING_P1,
	GOLDEN_ROW_27,
	GOLDEN_SKIPS,
	GOLDEN_SUBSCRIPTIONS,
	GOLDEN_TRANSACTIONS,
	goldenRow,
	type GoldenTransaction,
} from "../golden";

// Each expected figure is copied from docs/03-golden-dataset.md, never computed from the code.
// The sums below are written out in the test so a mistyped fixture row fails here first.

function totals(rows: readonly GoldenTransaction[]) {
	const sum = (type: string) =>
		rows
			.filter((row) => row.type === type)
			.reduce((total, row) => total + row.amountMinor, 0);
	return {
		count: rows.length,
		income: sum("income"),
		out: sum("expense") - sum("refund"),
		toGoals: sum("goal_contribution") - sum("goal_withdrawal"),
	};
}

const inMonth = (month: string) =>
	GOLDEN_ALL.filter((row) => row.occurredOn.startsWith(month));

describe("the golden Transactions", () => {
	test("rows #1 to #26 load, and #27 comes from catch-up", () => {
		expect(GOLDEN_TRANSACTIONS.map((row) => row.golden)).toEqual(
			Array.from({ length: 26 }, (_, index) => index + 1),
		);
		expect(GOLDEN_ROW_27.golden).toBe(27);
		expect(GOLDEN_ROW_27.createdAt).toBe(GOLDEN_NOW);
		expect(GOLDEN_ALL).toHaveLength(27);
	});

	// golden: Monthly totals
	test.each([
		["2026-09", 11, 9700000, 2804900, 800000],
		["2026-10", 14, 8500000, 3116800, 700000],
		["2026-11", 2, 0, 1842000, 0],
	])(
		"%s has %i rows, In %i, Out %i and To Goals %i",
		(month, count, income, out, toGoals) => {
			expect(totals(inMonth(month))).toEqual({ count, income, out, toGoals });
		},
	);

	// golden: "All time, to 2 November"
	test("all time: income 182,000.00, spending 77,637.00, To Goals 15,000.00", () => {
		const all = totals(GOLDEN_ALL);
		expect(all.income).toBe(18200000);
		expect(all.out).toBe(7763700);
		expect(all.toGoals).toBe(1500000);
		expect(all.income - all.out - all.toGoals).toBe(8936300);
	});

	// golden: Spending by category
	test.each([
		[
			"2026-09",
			{
				housing: 1800000,
				food: 505000,
				shopping: 240000,
				entertainment: 64900,
				transportation: 45000,
				health: 150000,
			},
		],
		[
			"2026-10",
			{
				housing: 1800000,
				food: 622000,
				shopping: 300000,
				entertainment: 214800,
				transportation: 180000,
			},
		],
		["2026-11", { housing: 1800000, food: 42000 }],
	] as [string, Record<string, number>][])(
		"%s spending by category",
		(month, expected) => {
			const spending: Record<string, number> = {};
			for (const row of inMonth(month)) {
				if (row.type !== "expense" && row.type !== "refund") continue;
				const sign = row.type === "refund" ? -1 : 1;
				const key = row.category ?? "none";
				spending[key] = (spending[key] ?? 0) + sign * row.amountMinor;
			}
			expect(spending).toEqual(expected);
		},
	);

	// golden: "Timezone checks". Bucketing by the UTC date would move exactly these four rows
	// into another month. The dataset marks them ⚑.
	test("only #1, #12, #26 and #27 fall in another month in UTC", () => {
		const flagged = GOLDEN_ALL.filter(
			(row) => row.occurredAt.slice(0, 7) !== row.occurredOn.slice(0, 7),
		);
		expect(flagged.map((row) => row.golden)).toEqual([1, 12, 26, 27]);
	});

	test("every charge and #26 fall on another date in UTC", () => {
		const flagged = GOLDEN_ALL.filter(
			(row) => row.occurredAt.slice(0, 10) !== row.occurredOn,
		);
		expect(flagged.map((row) => row.golden)).toEqual([
			1, 5, 7, 12, 16, 20, 26, 27,
		]);
	});

	// TIME-6: a charge is stored at 00:00 local, which is 18:30 UTC the day before in Kolkata.
	test("every charge sits at 18:30 UTC, and links to its Subscription and due date", () => {
		const charges = GOLDEN_ALL.filter((row) => row.source === "subscription");
		expect(charges.map((row) => row.golden)).toEqual([1, 5, 7, 12, 16, 20, 27]);
		for (const charge of charges) {
			expect(charge.occurredAt.slice(11)).toBe("18:30:00Z");
			expect(charge.dueOn).toBe(charge.occurredOn);
			expect(charge.subscriptionId).not.toBeNull();
		}
		expect(goldenRow(20).subscriptionId).toBe(
			GOLDEN_SUBSCRIPTIONS.amazonPrime.id,
		);
	});

	test("manual rows have no Subscription and no due date", () => {
		for (const row of GOLDEN_ALL.filter((row) => row.source === "manual")) {
			expect(row.subscriptionId).toBeNull();
			expect(row.dueOn).toBeNull();
		}
	});

	// TXN-3, TXN-4: Goal rows have a Goal and no category or payee; the rest the opposite.
	test("Goal rows #3, #9, #14, #22 and #23 carry a Goal and nothing else", () => {
		const goalRows = GOLDEN_ALL.filter((row) => row.goalId !== null);
		expect(goalRows.map((row) => row.golden)).toEqual([3, 9, 14, 22, 23]);
		for (const row of goalRows) {
			expect(row.category).toBeNull();
			expect(row.payee).toBeNull();
		}
		expect(goldenRow(3).goalId).toBe(GOLDEN_GOALS.emergencyFund.id);
		expect(goldenRow(23).goalId).toBe(GOLDEN_GOALS.vacation.id);
	});

	test("every other row has a category and a payee", () => {
		for (const row of GOLDEN_ALL.filter((row) => row.goalId === null)) {
			expect(row.category).not.toBeNull();
			expect(row.payee).not.toBeNull();
		}
	});

	test("only #8 and #21 have a description: Monthly groceries", () => {
		const described = GOLDEN_ALL.filter((row) => row.description !== null);
		expect(described.map((row) => [row.golden, row.description])).toEqual([
			[8, "Monthly groceries"],
			[21, "Monthly groceries"],
		]);
	});

	test("ids are distinct UUIDv7 values", () => {
		const ids = [
			...GOLDEN_ALL.map((row) => row.id),
			...Object.values(GOLDEN_GOALS).map((goal) => goal.id),
			...Object.values(GOLDEN_SUBSCRIPTIONS).map(
				(subscription) => subscription.id,
			),
			...GOLDEN_SKIPS.map((skip) => skip.id),
			GOLDEN_PENDING_P1.id,
		];
		expect(new Set(ids).size).toBe(ids.length);
		for (const id of ids) {
			expect(id).toMatch(
				/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
			);
		}
	});

	test("every row is at version 1, not demo and not edited", () => {
		for (const row of GOLDEN_ALL) {
			expect(row).toMatchObject({
				version: 1,
				demo: false,
				edited: false,
				note: null,
			});
		}
	});
});

describe("goldenRow", () => {
	test("finds a row by its number", () => {
		expect(goldenRow(26)).toMatchObject({
			payee: "Swiggy",
			amountMinor: 42000,
			occurredOn: "2026-11-01",
			occurredAt: "2026-10-31T19:00:00Z",
		});
	});

	test.each([0, 28, 1.5])("refuses #%s, which the dataset does not have", (n) => {
		expect(() => goldenRow(n)).toThrow(RangeError);
	});
});

// golden: Pending P1
test("P1 is Chai Point, 300.00 food at 11:40 on 2 November", () => {
	expect(GOLDEN_PENDING_P1).toMatchObject({
		type: "expense",
		category: "food",
		payee: "Chai Point",
		amountMinor: 30000,
		occurredOn: "2026-11-02",
		occurredAt: "2026-11-02T06:10:00Z",
	});
});

// docs/03-golden-dataset.md, Setup: the Budgets table.
describe("the golden Budgets", () => {
	test("are food, shopping, entertainment and transportation, with their limits", () => {
		expect(
			GOLDEN_BUDGETS.map(({ category, schedule, overrides }) => ({
				category,
				schedule,
				overrides,
			})),
		).toEqual([
			{
				category: "food",
				schedule: [
					{ from: "2026-09", limitMinor: 600000 },
					{ from: "2026-10", limitMinor: 500000 },
				],
				overrides: [],
			},
			{
				category: "shopping",
				schedule: [{ from: "2026-09", limitMinor: 300000 }],
				overrides: [],
			},
			{
				category: "entertainment",
				schedule: [{ from: "2026-09", limitMinor: 100000 }],
				overrides: [],
			},
			{
				category: "transportation",
				schedule: [{ from: "2026-10", limitMinor: 200000 }],
				overrides: [],
			},
		]);
	});

	test("food's one change makes it version 2; the rest are version 1, none demo", () => {
		expect(
			GOLDEN_BUDGETS.map((budget) => [budget.version, budget.demo]),
		).toEqual([
			[2, false],
			[1, false],
			[1, false],
			[1, false],
		]);
	});

	test("have distinct UUIDv7 ids of their own kind, 8004", () => {
		const ids = GOLDEN_BUDGETS.map((budget) => budget.id);
		expect(new Set(ids).size).toBe(4);
		for (const id of ids) {
			expect(isUuidV7(id)).toBe(true);
			expect(id.split("-")[3]).toBe("8004");
		}
	});
});

// Each expected figure is copied from docs/03-golden-dataset.md (Setup and Subscriptions).
describe("the golden Subscriptions", () => {
	const subscriptions = Object.values(GOLDEN_SUBSCRIPTIONS);

	test("are Sunrise Apartments, Netflix, Cult Gym and Amazon Prime", () => {
		expect(subscriptions.map((subscription) => subscription.name)).toEqual([
			"Sunrise Apartments",
			"Netflix",
			"Cult Gym",
			"Amazon Prime",
		]);
	});

	test("have the dataset's amount, cadence, start and category", () => {
		expect(
			subscriptions.map((s) => [
				s.name,
				s.amountMinor,
				s.cadence,
				s.startDate,
				s.category,
			]),
		).toEqual([
			[
				"Sunrise Apartments",
				1800000,
				{ unit: "month", every: 1 },
				"2026-09-01",
				"housing",
			],
			[
				"Netflix",
				64900,
				{ unit: "month", every: 1 },
				"2026-09-05",
				"entertainment",
			],
			[
				"Cult Gym",
				150000,
				{ unit: "month", every: 1 },
				"2026-09-10",
				"health",
			],
			[
				"Amazon Prime",
				149900,
				{ unit: "month", every: 12 },
				"2026-10-12",
				"entertainment",
			],
		]);
	});

	// golden: "each created on its start date, without backfill", so charging starts on it.
	test("were created on their start date: charging and the last change start there", () => {
		for (const subscription of subscriptions) {
			expect(subscription.chargesFrom).toBe(subscription.startDate);
			expect(subscription.lastChangeOn).toBe(subscription.startDate);
		}
	});

	// golden: "No golden Subscription is paused"; none is cancelled, noted, demo or changed.
	test("are running: no pause, end date or note; not demo, version 1", () => {
		for (const subscription of subscriptions) {
			expect(subscription).toMatchObject({
				pause: null,
				endDate: null,
				note: null,
				demo: false,
				version: 1,
			});
		}
	});

	test("were recorded at the midnight of their first charge, as that charge was", () => {
		for (const subscription of subscriptions) {
			const first = GOLDEN_ALL.filter(
				(row) => row.subscriptionId === subscription.id,
			).sort((a, b) => (a.occurredOn < b.occurredOn ? -1 : 1))[0];
			expect(first?.occurredOn).toBe(subscription.startDate);
			expect(subscription.createdAt).toBe(first?.occurredAt);
		}
	});

	// golden: Subscriptions (as of 2 November), Yearly cost, written out.
	test("cost 243,287.00 a year: 216,000.00 + 18,000.00 + 7,788.00 + 1,499.00", () => {
		const yearly = (amountMinor: number, every: number) =>
			(amountMinor * 12) / every;
		expect(yearly(1800000, 1)).toBe(21600000);
		expect(yearly(150000, 1)).toBe(1800000);
		expect(yearly(64900, 1)).toBe(778800);
		expect(yearly(149900, 12)).toBe(149900);
		expect(
			subscriptions.reduce(
				(total, s) => total + yearly(s.amountMinor, s.cadence.every),
				0,
			),
		).toBe(24328700);
	});

	test("every charge repeats its Subscription's name, category and amount", () => {
		for (const charge of GOLDEN_ALL.filter(
			(row) => row.source === "subscription",
		)) {
			const subscription = subscriptions.find(
				(s) => s.id === charge.subscriptionId,
			);
			expect(subscription).toBeDefined();
			expect(charge).toMatchObject({
				type: "expense",
				payee: subscription?.name,
				category: subscription?.category,
				amountMinor: subscription?.amountMinor,
			});
		}
	});

	// golden: the charges' due dates, and the missing 10 October for Cult Gym.
	test.each([
		["sunrise", [1, 12, 27], ["2026-09-01", "2026-10-01", "2026-11-01"]],
		["netflix", [5, 16], ["2026-09-05", "2026-10-05"]],
		["cultGym", [7], ["2026-09-10"]],
		["amazonPrime", [20], ["2026-10-12"]],
	] as const)("%s has charges #%j on its due dates", (name, numbers, dates) => {
		const charges = GOLDEN_ALL.filter(
			(row) => row.subscriptionId === GOLDEN_SUBSCRIPTIONS[name].id,
		);
		expect(charges.map((row) => row.golden)).toEqual(numbers);
		expect(charges.map((row) => row.dueOn)).toEqual(dates);
	});

	test("have distinct UUIDv7 ids of their own kind, 8002", () => {
		const ids = subscriptions.map((subscription) => subscription.id);
		expect(new Set(ids).size).toBe(4);
		for (const id of ids) {
			expect(isUuidV7(id)).toBe(true);
			expect(id.split("-")[3]).toBe("8002");
		}
	});
});

describe("the golden skipped charge", () => {
	// golden: "The 2026-10-10 charge was deleted, leaving a tombstone".
	test("is Cult Gym's 10 October, and only that one", () => {
		expect(GOLDEN_SKIPS).toHaveLength(1);
		expect(GOLDEN_SKIPS[0]).toMatchObject({
			subscription: "cultGym",
			dueOn: "2026-10-10",
		});
	});

	test("has no charge on its date, since the delete removed it", () => {
		const [skip] = GOLDEN_SKIPS;
		const id = GOLDEN_SUBSCRIPTIONS[skip.subscription].id;
		expect(
			GOLDEN_ALL.filter(
				(row) => row.subscriptionId === id && row.dueOn === skip.dueOn,
			),
		).toEqual([]);
	});

	test("is a due date of a Subscription that exists, and was recorded after it was created", () => {
		const [skip] = GOLDEN_SKIPS;
		const subscription = GOLDEN_SUBSCRIPTIONS[skip.subscription];
		expect(skip.createdAt > subscription.createdAt).toBe(true);
		expect(skip.dueOn > subscription.startDate).toBe(true);
	});

	test("has a UUIDv7 id of its own kind, 8005", () => {
		const [skip] = GOLDEN_SKIPS;
		expect(isUuidV7(skip.id)).toBe(true);
		expect(skip.id.split("-")[3]).toBe("8005");
	});
});
