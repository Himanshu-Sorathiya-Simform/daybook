import { describe, expect, test } from "vitest";

import { isUnder, QUERY_ROOTS } from "@/lib/api/query-keys";
import { subscriptionKeys } from "../keys";

describe("subscriptionKeys (STATE-5)", () => {
	const every = [
		subscriptionKeys.all,
		subscriptionKeys.list(),
		subscriptionKeys.months("2026-10", "2026-12"),
		subscriptionKeys.monthCharges("2026-11"),
		subscriptionKeys.charges("abc"),
		subscriptionKeys.charges(null),
		subscriptionKeys.duplicates("Netflix", "2025-09-05", "2026-11-01"),
		subscriptionKeys.duplicates(null, "", ""),
	];

	test("the root is the Subscriptions area's", () => {
		expect(subscriptionKeys.all).toEqual([QUERY_ROOTS.subscriptions]);
	});

	test("every key sits under the root, so one invalidation refreshes the page", () => {
		for (const key of every) {
			expect(isUnder(key, QUERY_ROOTS.subscriptions)).toBe(true);
		}
	});

	test("the kinds of read never share a key", () => {
		const hashes = every.map((key) => JSON.stringify(key));
		expect(new Set(hashes).size).toBe(hashes.length);
	});

	test("the same parameters make the same key, other parameters another", () => {
		expect(subscriptionKeys.months("2026-10", "2026-12")).toEqual(
			subscriptionKeys.months("2026-10", "2026-12"),
		);
		expect(subscriptionKeys.months("2026-10", "2026-12")).not.toEqual(
			subscriptionKeys.months("2026-10", "2026-11"),
		);
		expect(subscriptionKeys.months("2026-10", "2026-12")).not.toEqual(
			subscriptionKeys.months("2026-09", "2026-12"),
		);
		expect(subscriptionKeys.monthCharges("2026-11")).not.toEqual(
			subscriptionKeys.monthCharges("2026-10"),
		);
		expect(subscriptionKeys.charges("a")).not.toEqual(
			subscriptionKeys.charges("b"),
		);
	});

	test("a read still waiting for an id never matches a real one's", () => {
		expect(subscriptionKeys.charges(null)).not.toEqual(
			subscriptionKeys.charges("null"),
		);
	});

	test("a duplicates read is keyed by the name and both ends of the period", () => {
		const base = subscriptionKeys.duplicates(
			"Netflix",
			"2025-09-05",
			"2026-11-01",
		);
		expect(base).not.toEqual(
			subscriptionKeys.duplicates(
				"Netflix Premium",
				"2025-09-05",
				"2026-11-01",
			),
		);
		expect(base).not.toEqual(
			subscriptionKeys.duplicates("Netflix", "2025-09-06", "2026-11-01"),
		);
		expect(base).not.toEqual(
			subscriptionKeys.duplicates("Netflix", "2025-09-05", "2026-10-31"),
		);
	});
});
