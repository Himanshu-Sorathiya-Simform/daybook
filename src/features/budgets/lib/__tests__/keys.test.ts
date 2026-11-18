import { hashKey } from "@tanstack/react-query";
import { describe, expect, test } from "vitest";

import { isUnder, QUERY_ROOTS } from "@/lib/api/query-keys";
import { budgetKeys } from "../keys";

const EVERY_KEY = [
	budgetKeys.month("2026-10"),
	budgetKeys.history("food", "2026-10", 6),
	budgetKeys.history(null, "2026-10", 6),
	budgetKeys.year(2026),
	budgetKeys.payees("food", "2026-10"),
	budgetKeys.payees(null, "2026-10"),
];

describe("budgetKeys (STATE-5)", () => {
	test("the root is the Budgets area's own", () => {
		expect(QUERY_ROOTS.budgets).toBe("budgets");
		expect(budgetKeys.all).toEqual(["budgets"]);
	});

	test("every key sits under the root, the panel's payees included, so one invalidation reaches all", () => {
		for (const key of EVERY_KEY)
			expect(isUnder(key, QUERY_ROOTS.budgets)).toBe(true);
	});

	test("no key sits under the Transactions or payees roots, whose writes must not reach them by accident", () => {
		for (const key of EVERY_KEY) {
			expect(isUnder(key, QUERY_ROOTS.transactions)).toBe(false);
			expect(isUnder(key, QUERY_ROOTS.payees)).toBe(false);
		}
	});

	test("each kind of read has its own key, with its parameters in order", () => {
		expect(budgetKeys.month("2026-10")).toEqual(["budgets", "month", "2026-10"]);
		expect(budgetKeys.history("food", "2026-11", 6)).toEqual([
			"budgets",
			"history",
			"food",
			"2026-11",
			6,
		]);
		expect(budgetKeys.year(2026)).toEqual(["budgets", "year", 2026]);
		expect(budgetKeys.payees("food", "2026-10")).toEqual([
			"budgets",
			"payees",
			"food",
			"2026-10",
		]);
	});

	test("every key differs from every other", () => {
		const hashes = EVERY_KEY.map(hashKey);
		expect(new Set(hashes).size).toBe(hashes.length);
	});

	test("each parameter changes the key", () => {
		const key = hashKey(budgetKeys.history("food", "2026-10", 6));
		expect(hashKey(budgetKeys.history("shopping", "2026-10", 6))).not.toBe(key);
		expect(hashKey(budgetKeys.history("food", "2026-09", 6))).not.toBe(key);
		expect(hashKey(budgetKeys.history("food", "2026-10", 2))).not.toBe(key);
		expect(hashKey(budgetKeys.month("2026-09"))).not.toBe(
			hashKey(budgetKeys.month("2026-10")),
		);
		expect(hashKey(budgetKeys.year(2027))).not.toBe(
			hashKey(budgetKeys.year(2026)),
		);
		expect(hashKey(budgetKeys.payees("food", "2026-09"))).not.toBe(
			hashKey(budgetKeys.payees("food", "2026-10")),
		);
	});

	test("a read with no category never shares a key with a real category's", () => {
		expect(hashKey(budgetKeys.history(null, "2026-10", 6))).not.toBe(
			hashKey(budgetKeys.history("food", "2026-10", 6)),
		);
		expect(hashKey(budgetKeys.payees(null, "2026-10"))).not.toBe(
			hashKey(budgetKeys.payees("food", "2026-10")),
		);
	});

	test("a month view's key is not a prefix of a history's, so invalidating one month leaves the rest", () => {
		const month = budgetKeys.month("2026-10");
		const history = budgetKeys.history("food", "2026-10", 6);
		expect(history.slice(0, month.length)).not.toEqual(month);
	});
});
