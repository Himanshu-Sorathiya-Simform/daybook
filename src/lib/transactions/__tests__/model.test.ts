import { describe, expect, test } from "vitest";

import {
	CATEGORY_LABELS,
	EXPENSE_CATEGORIES,
	INCOME_CATEGORIES,
} from "@/lib/categories";
import {
	CATEGORY_KEYS,
	DATE_PRESETS,
	DEFAULT_DIR,
	DEFAULT_SORT,
	DIRS,
	FILTER_PARAMS,
	GOAL_TYPES,
	GROUPS,
	MAX_LIMIT,
	PAGE_SIZE,
	RANGE_PRESETS,
	SORTS,
	SOURCES,
	TXN_TYPES,
	TYPE_GROUPS,
	categoriesFor,
	defaultGroup,
	isGoalType,
} from "@/lib/transactions/model";

describe("Transaction types (TXN-1)", () => {
	test("are the five types of the root spec, in its order", () => {
		expect(TXN_TYPES).toEqual([
			"income",
			"expense",
			"refund",
			"goal_contribution",
			"goal_withdrawal",
		]);
	});

	test("the Goal types are the contribution and the withdrawal", () => {
		expect(GOAL_TYPES).toEqual(["goal_contribution", "goal_withdrawal"]);
		expect(TXN_TYPES.filter(isGoalType)).toEqual(GOAL_TYPES);
	});

	// BR-F03-02: a type changes only within its group.
	test("fall into two groups that together hold every type once", () => {
		expect(TYPE_GROUPS).toEqual([
			["income", "expense", "refund"],
			["goal_contribution", "goal_withdrawal"],
		]);
		expect(TYPE_GROUPS.flat().sort()).toEqual([...TXN_TYPES].sort());
	});
});

describe("categoriesFor (TXN-3)", () => {
	test("income takes the income categories", () => {
		expect(categoriesFor("income")).toEqual(INCOME_CATEGORIES);
	});

	test("expense and refund take the expense categories", () => {
		expect(categoriesFor("expense")).toEqual(EXPENSE_CATEGORIES);
		expect(categoriesFor("refund")).toEqual(EXPENSE_CATEGORIES);
	});

	test("Goal types take no category", () => {
		expect(categoriesFor("goal_contribution")).toEqual([]);
		expect(categoriesFor("goal_withdrawal")).toEqual([]);
	});

	test("every category key belongs to exactly one list", () => {
		expect([...CATEGORY_KEYS].sort()).toEqual(
			Object.keys(CATEGORY_LABELS).sort(),
		);
		expect(new Set(CATEGORY_KEYS).size).toBe(20);
	});
});

describe("list parameters", () => {
	test("sources are manual and subscription (TXN-8)", () => {
		expect(SOURCES).toEqual(["manual", "subscription"]);
	});

	test("sorts are date and amount, newest first by default (BR-F03-40)", () => {
		expect(SORTS).toEqual(["date", "amount"]);
		expect(DIRS).toEqual(["desc", "asc"]);
		expect(DEFAULT_SORT).toBe("date");
		expect(DEFAULT_DIR).toBe("desc");
	});

	// BR-F03-55
	test("groups are day, category, payee and none", () => {
		expect(GROUPS).toEqual(["day", "category", "payee", "none"]);
	});

	test("the date sort groups by day by default, the amount sort not at all", () => {
		expect(defaultGroup("date")).toBe("day");
		expect(defaultGroup("amount")).toBe("none");
	});

	test("pages hold 50 rows and a request may ask for at most 100 (API-7, BR-F03-30)", () => {
		expect(PAGE_SIZE).toBe(50);
		expect(MAX_LIMIT).toBe(100);
	});

	// BR-F03-33: the fixed order of the URL's parameters.
	test("URL parameters run in the spec's fixed order", () => {
		expect(FILTER_PARAMS).toEqual([
			"from",
			"to",
			"type",
			"cat",
			"goal",
			"sub",
			"src",
			"min",
			"max",
			"q",
			"sort",
			"dir",
			"group",
		]);
	});
});

describe("date presets (F03 section 3, D-227)", () => {
	test("are the seven presets with their keys, in the spec's order", () => {
		expect(DATE_PRESETS).toEqual([
			"all",
			"this_month",
			"last_month",
			"last_3_months",
			"year_to_date",
			"last_12_months",
			"custom",
		]);
	});

	test("the range presets are all but All time and Custom", () => {
		expect(RANGE_PRESETS).toEqual([
			"this_month",
			"last_month",
			"last_3_months",
			"year_to_date",
			"last_12_months",
		]);
	});
});
