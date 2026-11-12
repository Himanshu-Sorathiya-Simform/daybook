import { describe, expect, test } from "vitest";

import { isUnder, QUERY_ROOTS } from "../query-keys";

describe("QUERY_ROOTS (STATE-5)", () => {
	test("holds one root per area that exists so far", () => {
		expect(QUERY_ROOTS).toEqual({
			me: "me",
			profile: "profile",
			transactions: "transactions",
			payees: "payees",
			transactionViews: "transactionViews",
		});
	});

	test("no two areas share a root", () => {
		const roots = Object.values(QUERY_ROOTS);
		expect(new Set(roots).size).toBe(roots.length);
	});
});

describe("isUnder", () => {
	test.each([
		[["transactions"], "transactions", true],
		[["transactions", "list", {}], "transactions", true],
		[["transactionViews", "list"], "transactions", false],
		[["payees"], "transactions", false],
		[[], "transactions", false],
		[["Transactions"], "transactions", false],
	] as const)("%j under %s is %s", (key, root, expected) => {
		expect(isUnder(key, root)).toBe(expected);
	});
});
