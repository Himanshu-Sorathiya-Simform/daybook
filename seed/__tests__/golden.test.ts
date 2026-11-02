import { describe, expect, test } from "vitest";

import {
	GOLDEN_ALL,
	GOLDEN_GOALS,
	GOLDEN_NOW,
	GOLDEN_PENDING_P1,
	GOLDEN_ROW_27,
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
