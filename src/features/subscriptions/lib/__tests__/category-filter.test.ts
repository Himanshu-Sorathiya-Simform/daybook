import { describe, expect, test } from "vitest";

import { GOLDEN_SUBSCRIPTIONS } from "../../../../../seed/golden";
import {
	categoryChip,
	filterByCategory,
	FILTER_TEXT,
	isFilterable,
} from "../category-filter";
import { subscriptionItem, subscriptionList } from "./fixtures";

const list = () => subscriptionList();
const netflixId = GOLDEN_SUBSCRIPTIONS.netflix.id;
const primeId = GOLDEN_SUBSCRIPTIONS.amazonPrime.id;

describe("FILTER_TEXT and categoryChip (BR-F05-50)", () => {
	test("the chip row reads Showing and Show all", () => {
		expect(FILTER_TEXT.showing).toBe("Showing");
		expect(FILTER_TEXT.showAll).toBe("Show all");
	});

	test("the chip is the category's name", () => {
		expect(categoryChip("entertainment")).toBe("Entertainment");
		expect(categoryChip("personal_care")).toBe("Personal care");
		expect(categoryChip("gifts_donations")).toBe("Gifts and donations");
	});
});

describe("isFilterable (BR-F05-50)", () => {
	test("a category with a Subscription that counts is", () => {
		expect(isFilterable(list(), "entertainment")).toBe(true);
		expect(isFilterable(list(), "housing")).toBe(true);
		expect(isFilterable(list(), "health")).toBe(true);
	});

	test("a category with no Subscription is not", () => {
		expect(isFilterable(list(), "travel")).toBe(false);
	});

	test("an ended Subscription alone does not make a category filterable", () => {
		const only = {
			items: [
				subscriptionItem("netflix", { status: "ended", nextDueOn: null }),
			],
		};
		expect(isFilterable(only, "entertainment")).toBe(false);
	});

	test("an ended Subscription does not, even with a next due date", () => {
		const only = {
			items: [
				subscriptionItem("netflix", {
					status: "ended",
					nextDueOn: "2026-12-05",
				}),
			],
		};
		expect(isFilterable(only, "entertainment")).toBe(false);
	});

	test("one with no next due date does not either, as the summary leaves it out", () => {
		const only = { items: [subscriptionItem("netflix", { nextDueOn: null })] };
		expect(isFilterable(only, "entertainment")).toBe(false);
	});

	test("a paused or upcoming one does, since it counts in the summary", () => {
		for (const status of ["paused", "upcoming", "ending"] as const) {
			expect(
				isFilterable(
					{ items: [subscriptionItem("netflix", { status })] },
					"entertainment",
				),
			).toBe(true);
		}
	});

	test("an empty list has none", () => {
		expect(isFilterable({ items: [] }, "housing")).toBe(false);
	});
});

describe("filterByCategory (BR-F05-50)", () => {
	test("keeps the Subscriptions of the category and drops the others", () => {
		const result = filterByCategory(list(), "entertainment");
		expect(result.items.map((item) => item.name).sort()).toEqual([
			"Amazon Prime",
			"Netflix",
		]);
		expect(result.items.every((item) => item.category === "entertainment")).toBe(
			true,
		);
	});

	test("keeps the upcoming charges of those Subscriptions only", () => {
		const result = filterByCategory(list(), "entertainment");
		expect(result.upcoming.map((entry) => entry.subscriptionId)).toEqual([
			netflixId,
		]);
		const housing = filterByCategory(list(), "housing");
		expect(housing.upcoming.map((entry) => entry.dueOn)).toEqual(["2026-12-01"]);
	});

	test("leaves the totals and everything else of the list alone", () => {
		const base = list();
		const result = filterByCategory(base, "health");
		expect(result.totals).toBe(base.totals);
		expect(result.currency).toBe(base.currency);
		expect(result.thisMonth).toBe(base.thisMonth);
		expect(result.upcomingTotalMinor).toBe(base.upcomingTotalMinor);
	});

	test("an ended Subscription of the category stays, for the Ended group", () => {
		const base = list();
		const ended = subscriptionItem("netflix", {
			id: "ended-one",
			status: "ended",
			nextDueOn: null,
			category: "health",
		});
		const result = filterByCategory(
			{ ...base, items: [...base.items, ended] },
			"health",
		);
		expect(result.items.map((item) => item.id)).toContain("ended-one");
	});

	test("a category with none gives an empty list", () => {
		const result = filterByCategory(list(), "travel");
		expect(result.items).toEqual([]);
		expect(result.upcoming).toEqual([]);
	});

	test("does not change what it is given", () => {
		const base = list();
		filterByCategory(base, "health");
		expect(base.items).toHaveLength(4);
		expect(base.upcoming).toHaveLength(3);
	});

	test("Amazon Prime shares Entertainment with Netflix, so its yearly charge is not upcoming here", () => {
		const result = filterByCategory(list(), "entertainment");
		expect(result.items.map((i) => i.id)).toContain(primeId);
	});
});
