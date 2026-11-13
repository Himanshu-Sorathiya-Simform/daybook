import { describe, expect, test } from "vitest";
import type { z } from "zod";

import { GOLDEN_BUDGETS } from "../../../../seed/golden";
import { monthRange } from "../months";
import {
	BUDGET_MESSAGES as M,
	budgetCreateSchema,
	budgetDeleteSchema,
	budgetEditSchema,
	monthRangeMessage,
} from "../schemas";

const FOOD_ID = GOLDEN_BUDGETS[0].id;
const FOOD_SCHEDULE = [
	{ from: "2026-09", limitMinor: 600000 },
	{ from: "2026-10", limitMinor: 500000 },
];

/** Every issue as `path: message`, in Zod's order. */
function issues(schema: z.ZodType, body: unknown): string[] {
	const result = schema.safeParse(body);
	if (result.success) return [];
	return result.error.issues.map(
		(issue) => `${issue.path.join(".")}: ${issue.message}`,
	);
}

const create = (changes: Record<string, unknown> = {}) => ({
	id: FOOD_ID,
	category: "food",
	from: "2026-11",
	limitMinor: 500000,
	currency: "INR",
	...changes,
});

const restoreCreate = (changes: Record<string, unknown> = {}) => ({
	id: FOOD_ID,
	category: "food",
	schedule: FOOD_SCHEDULE,
	overrides: [],
	currency: "INR",
	...changes,
});

describe("F04 section 8's messages", () => {
	test("read as the spec writes them", () => {
		expect(M.categoryRequired).toBe("Choose a category.");
		expect(M.limitRequired).toBe("Enter a limit.");
		expect(M.stopRemovesEveryMonth).toBe(
			"This would remove every month. Delete the Budget instead.",
		);
		expect(M.limitZero).toBe("Enter an amount above zero.");
	});

	// BR-F04-07 on the golden clock.
	test("the range message names Nov 2023 and Nov 2027 on golden", () => {
		expect(monthRangeMessage(monthRange("2026-11"))).toBe(
			"Choose a month from Nov 2023 to Nov 2027.",
		);
		expect(monthRangeMessage(monthRange("2026-01"))).toBe(
			"Choose a month from Jan 2023 to Jan 2027.",
		);
	});
});

describe("budgetCreateSchema, from a month (F04 section 11)", () => {
	test("accepts flow 7.1's body and names its kind", () => {
		expect(budgetCreateSchema.parse(create())).toEqual({
			kind: "from",
			id: FOOD_ID,
			category: "food",
			from: "2026-11",
			limitMinor: 500000,
			currency: "INR",
		});
	});

	test("lowercases the id", () => {
		expect(
			budgetCreateSchema.parse(create({ id: FOOD_ID.toUpperCase() })).id,
		).toBe(FOOD_ID);
	});

	test.each([
		["missing", undefined],
		["a UUIDv4", "3f0b9d1c-2a4e-4b8f-9c1d-5e6f7a8b9c0d"],
		["not a UUID", "food"],
		["a number", 7],
	])("refuses an id that is %s", (_name, id) => {
		expect(issues(budgetCreateSchema, create({ id }))).toEqual([`id: ${M.id}`]);
	});

	test.each([
		["missing", undefined],
		["an income category", "salary"],
		["another income category", "other_income"],
		["no category at all", "groceries"],
		["in capitals", "Food"],
		["null", null],
	])("refuses a category that is %s (CAT-2)", (_name, category) => {
		expect(issues(budgetCreateSchema, create({ category }))).toEqual([
			`category: ${M.categoryRequired}`,
		]);
	});

	test("accepts every expense category", () => {
		for (const category of [
			"food",
			"housing",
			"fees_taxes",
			"other",
			"personal_care",
		]) {
			expect(issues(budgetCreateSchema, create({ category }))).toEqual([]);
		}
	});

	test.each([
		["missing", undefined],
		["unsupported", "XYZ"],
		["in lower case", "inr"],
	])("refuses a currency that is %s", (_name, currency) => {
		expect(issues(budgetCreateSchema, create({ currency }))).toContain(
			`currency: ${M.currency}`,
		);
	});

	test.each([
		["missing", undefined],
		["month 13", "2026-13"],
		["one digit", "2026-1"],
		["a date", "2026-11-01"],
		["a number", 202611],
	])("refuses a from that is %s", (_name, from) => {
		expect(issues(budgetCreateSchema, create({ from }))).toEqual([
			`from: ${M.month}`,
		]);
	});

	test("refuses a missing or null limit: a create can't stop", () => {
		expect(
			issues(budgetCreateSchema, create({ limitMinor: undefined })),
		).toEqual([`limitMinor: ${M.limitRequired}`]);
		expect(issues(budgetCreateSchema, create({ limitMinor: null }))).toEqual([
			`limitMinor: ${M.limitRequired}`,
		]);
	});

	test.each([
		["zero", 0, M.limitZero],
		["negative", -500000, M.limitZero],
		["a fraction", 500000.5, M.limitWhole],
		["text", "500000", M.limitWhole],
		["not a number", Number.NaN, M.limitWhole],
		["infinite", Number.POSITIVE_INFINITY, M.limitWhole],
	])("refuses a limit that is %s (BR-F03-04)", (_name, limitMinor, message) => {
		expect(issues(budgetCreateSchema, create({ limitMinor }))).toEqual([
			`limitMinor: ${message}`,
		]);
	});

	test.each([
		["INR", 99999999999, "999,999,999.99"],
		["JPY", 999999999, "999,999,999"],
		["KWD", 999999999999, "999,999,999.999"],
	])(
		"accepts %s's largest limit, %i, and refuses one more (MON-5)",
		(currency, largest, text) => {
			expect(
				issues(
					budgetCreateSchema,
					create({ currency, limitMinor: largest }),
				),
			).toEqual([]);
			expect(
				issues(
					budgetCreateSchema,
					create({ currency, limitMinor: largest + 1 }),
				),
			).toEqual([`limitMinor: The largest amount is ${text}.`]);
		},
	);

	test("accepts the smallest limit, 1", () => {
		expect(issues(budgetCreateSchema, create({ limitMinor: 1 }))).toEqual([]);
	});

	test.each(["version", "demo", "createdAt", "scope", "month", "state"])(
		"refuses %s, a field the create has no place for",
		(field) => {
			expect(
				issues(budgetCreateSchema, create({ [field]: 1 })).length,
			).toBeGreaterThan(0);
		},
	);

	test("refuses an empty body and a non-object", () => {
		expect(issues(budgetCreateSchema, {}).length).toBeGreaterThan(0);
		expect(issues(budgetCreateSchema, null).length).toBeGreaterThan(0);
		expect(issues(budgetCreateSchema, [create()]).length).toBeGreaterThan(0);
	});
});

describe("budgetCreateSchema, restoring (BR-F04-33)", () => {
	// AC-F04-18
	test("accepts a whole Budget back and names its kind", () => {
		expect(
			budgetCreateSchema.parse(
				restoreCreate({
					overrides: [{ month: "2026-10", limitMinor: 800000 }],
				}),
			),
		).toEqual({
			kind: "restore",
			id: FOOD_ID,
			category: "food",
			currency: "INR",
			schedule: FOOD_SCHEDULE,
			overrides: [{ month: "2026-10", limitMinor: 800000 }],
		});
	});

	test("refuses a restore without its one-month limits, or without its schedule", () => {
		expect(
			issues(budgetCreateSchema, restoreCreate({ overrides: undefined })),
		).toEqual([`overrides: ${M.shape}`]);
		expect(
			issues(budgetCreateSchema, restoreCreate({ schedule: undefined })),
		).toEqual([`schedule: ${M.shape}`]);
	});

	test("refuses from or limitMinor beside a schedule", () => {
		expect(
			issues(budgetCreateSchema, restoreCreate({ from: "2026-11" })),
		).toEqual([`from: ${M.notWithScope}`]);
		expect(
			issues(budgetCreateSchema, restoreCreate({ limitMinor: 500000 })),
		).toEqual([`limitMinor: ${M.notWithScope}`]);
	});

	test("checks each limit against the currency's largest", () => {
		expect(
			issues(
				budgetCreateSchema,
				restoreCreate({
					schedule: [{ from: "2026-09", limitMinor: 100000000000 }],
					overrides: [{ month: "2026-10", limitMinor: 100000000000 }],
				}),
			),
		).toEqual([
			"schedule.0.limitMinor: The largest amount is 999,999,999.99.",
			"overrides.0.limitMinor: The largest amount is 999,999,999.99.",
		]);
	});
});

const edit = (changes: Record<string, unknown>) => changes;

describe("budgetEditSchema, from a month onward (BR-F04-03, BR-F04-04)", () => {
	test("accepts a new limit with its currency", () => {
		expect(
			budgetEditSchema.parse(
				edit({ from: "2026-09", limitMinor: 700000, currency: "INR" }),
			),
		).toEqual({
			kind: "from",
			from: "2026-09",
			limitMinor: 700000,
			currency: "INR",
		});
	});

	// Flow 7.4's stop.
	test("accepts a stop, with or without a currency", () => {
		expect(
			budgetEditSchema.parse(edit({ from: "2026-11", limitMinor: null })),
		).toEqual({
			kind: "from",
			from: "2026-11",
			limitMinor: null,
			currency: undefined,
		});
		expect(
			issues(
				budgetEditSchema,
				edit({ from: "2026-11", limitMinor: null, currency: "INR" }),
			),
		).toEqual([]);
	});

	// BR-F04-22: a limit carries its currency.
	test("refuses a limit without its currency", () => {
		expect(
			issues(budgetEditSchema, edit({ from: "2026-09", limitMinor: 700000 })),
		).toEqual([`currency: ${M.currencyWithLimit}`]);
	});

	test("refuses a missing limit", () => {
		expect(
			issues(budgetEditSchema, edit({ from: "2026-09", currency: "INR" })),
		).toEqual([`limitMinor: ${M.limitRequired}`]);
	});

	test("refuses a from that is no month", () => {
		expect(
			issues(budgetEditSchema, edit({ from: "2026-9", limitMinor: null })),
		).toEqual([`from: ${M.month}`]);
	});

	test("refuses a limit of zero or above the largest", () => {
		expect(
			issues(
				budgetEditSchema,
				edit({ from: "2026-09", limitMinor: 0, currency: "INR" }),
			),
		).toEqual([`limitMinor: ${M.limitZero}`]);
		expect(
			issues(
				budgetEditSchema,
				edit({ from: "2026-09", limitMinor: 100000000000, currency: "INR" }),
			),
		).toEqual(["limitMinor: The largest amount is 999,999,999.99."]);
	});
});

describe("budgetEditSchema, one month (BR-F04-24)", () => {
	// F04 section 15's one-month body.
	test("accepts section 15's body", () => {
		expect(
			budgetEditSchema.parse(
				edit({
					month: "2026-10",
					limitMinor: 800000,
					currency: "INR",
					scope: "month",
				}),
			),
		).toEqual({
			kind: "month",
			month: "2026-10",
			limitMinor: 800000,
			currency: "INR",
		});
	});

	test("accepts no limit for one month, without a currency", () => {
		expect(
			budgetEditSchema.parse(
				edit({ month: "2026-10", limitMinor: null, scope: "month" }),
			),
		).toEqual({
			kind: "month",
			month: "2026-10",
			limitMinor: null,
			currency: undefined,
		});
	});

	test("refuses a month without its scope, and a scope without its month", () => {
		expect(
			issues(budgetEditSchema, edit({ month: "2026-10", limitMinor: null })),
		).toEqual([`scope: ${M.scope}`]);
		expect(
			issues(budgetEditSchema, edit({ scope: "month", limitMinor: null })),
		).toEqual([`month: ${M.month}`]);
	});

	test("refuses a scope other than month", () => {
		expect(
			issues(
				budgetEditSchema,
				edit({ month: "2026-10", limitMinor: null, scope: "year" }),
			),
		).toEqual([`scope: ${M.scope}`]);
	});

	test("refuses from beside a one-month change", () => {
		expect(
			issues(
				budgetEditSchema,
				edit({
					month: "2026-10",
					from: "2026-10",
					limitMinor: null,
					scope: "month",
				}),
			),
		).toEqual([`from: ${M.notWithScope}`]);
	});

	test("refuses a missing limit, and a limit without its currency", () => {
		expect(
			issues(budgetEditSchema, edit({ month: "2026-10", scope: "month" })),
		).toEqual([`limitMinor: ${M.limitRequired}`]);
		expect(
			issues(
				budgetEditSchema,
				edit({ month: "2026-10", scope: "month", limitMinor: 800000 }),
			),
		).toEqual([`currency: ${M.currencyWithLimit}`]);
	});
});

describe("budgetEditSchema, restoring (BR-F04-33)", () => {
	const restore = (changes: Record<string, unknown> = {}) => ({
		schedule: FOOD_SCHEDULE,
		overrides: [],
		currency: "INR",
		...changes,
	});

	// AC-F04-18
	test("accepts the lists and names its kind", () => {
		expect(budgetEditSchema.parse(restore())).toEqual({
			kind: "restore",
			currency: "INR",
			schedule: FOOD_SCHEDULE,
			overrides: [],
		});
	});

	test("refuses a restore without its currency", () => {
		expect(issues(budgetEditSchema, restore({ currency: undefined }))).toEqual([
			`currency: ${M.currencyWithLimit}`,
		]);
	});

	test.each(["from", "month", "scope", "limitMinor"])(
		"refuses %s beside the lists",
		(field) => {
			const value = {
				from: "2026-10",
				month: "2026-10",
				scope: "month",
				limitMinor: 1,
			}[field];
			expect(issues(budgetEditSchema, restore({ [field]: value }))).toEqual([
				`${field}: ${M.notWithScope}`,
			]);
		},
	);

	test("refuses one list without the other", () => {
		expect(issues(budgetEditSchema, restore({ overrides: undefined }))).toEqual([
			`overrides: ${M.shape}`,
		]);
		expect(issues(budgetEditSchema, restore({ schedule: undefined }))).toEqual([
			`schedule: ${M.shape}`,
		]);
	});

	// AC-F04-28: months are not range-checked, only kept within 2000 to 2099.
	test("accepts an entry from 2001-01, and the ends 2000-01 and 2099-12", () => {
		expect(
			issues(
				budgetEditSchema,
				restore({
					schedule: [
						{ from: "2000-01", limitMinor: 1 },
						{ from: "2001-01", limitMinor: 2 },
						{ from: "2099-12", limitMinor: 3 },
					],
				}),
			),
		).toEqual([]);
	});

	test("refuses months outside 2000 to 2099", () => {
		expect(
			issues(
				budgetEditSchema,
				restore({
					schedule: [{ from: "1999-12", limitMinor: 1 }],
					overrides: [{ month: "2100-01", limitMinor: 1 }],
				}),
			),
		).toEqual([
			`schedule.0.from: ${M.restoreMonth}`,
			`overrides.0.month: ${M.restoreMonth}`,
		]);
	});

	test("refuses a schedule out of order, or with a month twice", () => {
		expect(
			issues(
				budgetEditSchema,
				restore({ schedule: [...FOOD_SCHEDULE].reverse() }),
			),
		).toEqual([`schedule: ${M.scheduleOrder}`]);
		expect(
			issues(
				budgetEditSchema,
				restore({
					schedule: [
						{ from: "2026-09", limitMinor: 600000 },
						{ from: "2026-09", limitMinor: 500000 },
					],
				}),
			),
		).toEqual([`schedule: ${M.scheduleOrder}`]);
	});

	test("refuses a schedule with no limit at all", () => {
		expect(issues(budgetEditSchema, restore({ schedule: [] }))).toEqual([
			`schedule: ${M.scheduleNeedsLimit}`,
		]);
		expect(
			issues(
				budgetEditSchema,
				restore({ schedule: [{ from: "2026-09", limitMinor: null }] }),
			),
		).toEqual([`schedule: ${M.scheduleNeedsLimit}`]);
	});

	// AC-F04-28
	test("refuses one-month limits that repeat a month", () => {
		expect(
			issues(
				budgetEditSchema,
				restore({
					overrides: [
						{ month: "2026-10", limitMinor: 800000 },
						{ month: "2026-10", limitMinor: null },
					],
				}),
			),
		).toEqual([`overrides: ${M.overrideMonths}`]);
	});

	test("refuses entries with other fields or the wrong types", () => {
		expect(
			issues(
				budgetEditSchema,
				restore({
					schedule: [{ from: "2026-09", limitMinor: 600000, note: "x" }],
				}),
			).length,
		).toBeGreaterThan(0);
		expect(
			issues(budgetEditSchema, restore({ schedule: [{ from: "2026-09" }] })),
		).toEqual([`schedule.0.limitMinor: ${M.limitWhole}`]);
		expect(
			issues(
				budgetEditSchema,
				restore({ overrides: [{ month: "2026-10", limitMinor: 0 }] }),
			),
		).toEqual([`overrides.0.limitMinor: ${M.limitZero}`]);
		expect(issues(budgetEditSchema, restore({ schedule: "all" }))).toEqual([
			`schedule: ${M.shape}`,
		]);
	});

	// BR-F04-33: the server applies BR-F04-05 and keeps the one-month limits as sent.
	test("normalizes the schedule and keeps the one-month limits, in month order", () => {
		expect(
			budgetEditSchema.parse(
				restore({
					schedule: [
						{ from: "2026-08", limitMinor: null },
						{ from: "2026-09", limitMinor: 600000 },
						{ from: "2026-10", limitMinor: 600000 },
					],
					overrides: [
						{ month: "2026-12", limitMinor: 600000 },
						{ month: "2026-10", limitMinor: null },
					],
				}),
			),
		).toEqual({
			kind: "restore",
			currency: "INR",
			schedule: [{ from: "2026-09", limitMinor: 600000 }],
			overrides: [
				{ month: "2026-10", limitMinor: null },
				{ month: "2026-12", limitMinor: 600000 },
			],
		});
	});
});

describe("budgetEditSchema, anything else", () => {
	test("refuses an empty body, or a currency alone", () => {
		expect(issues(budgetEditSchema, {})).toEqual([`: ${M.shape}`]);
		expect(issues(budgetEditSchema, { currency: "INR" })).toEqual([
			`: ${M.shape}`,
		]);
	});

	test.each(["version", "id", "category", "demo"])(
		"refuses %s: it can't change",
		(field) => {
			expect(
				issues(budgetEditSchema, {
					from: "2026-11",
					limitMinor: null,
					[field]: "x",
				}).length,
			).toBeGreaterThan(0);
		},
	);
});

test("budgetDeleteSchema takes only the empty object", () => {
	expect(budgetDeleteSchema.safeParse({}).success).toBe(true);
	expect(budgetDeleteSchema.safeParse({ version: 2 }).success).toBe(false);
	expect(budgetDeleteSchema.safeParse(null).success).toBe(false);
});
