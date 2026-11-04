import { describe, expect, test } from "vitest";

import type { ListParams } from "@/lib/transactions/url";
import {
	GROUP_CHOICES,
	groupSortLabel,
	SORT_CHOICES,
	sortChoiceOf,
	withGroup,
	withSort,
} from "../group-sort";

const list = (
	sort: ListParams["sort"],
	dir: ListParams["dir"],
	group: ListParams["group"],
) => ({
	sort,
	dir,
	group,
});

describe("the choices (BR-F03-39, BR-F03-40)", () => {
	test("list the four sorts in order, each a sort and a direction (D-529)", () => {
		expect(
			SORT_CHOICES.map(({ label, sort, dir }) => [label, sort, dir]),
		).toEqual([
			["Newest first", "date", "desc"],
			["Oldest first", "date", "asc"],
			["Largest first", "amount", "desc"],
			["Smallest first", "amount", "asc"],
		]);
	});

	test("list the groupings in order, Day with its description", () => {
		expect(GROUP_CHOICES.map((each) => each.label)).toEqual([
			"Day",
			"Category",
			"Payee",
			"No grouping",
		]);
		expect(GROUP_CHOICES[0]).toHaveProperty("description", "with day totals");
		expect(GROUP_CHOICES.slice(1).some((each) => "description" in each)).toBe(
			false,
		);
	});

	test.each([
		["date", "desc", "newest"],
		["date", "asc", "oldest"],
		["amount", "desc", "largest"],
		["amount", "asc", "smallest"],
	] as const)("%s %s is %s", (sort, dir, id) => {
		expect(sortChoiceOf({ sort, dir }).id).toBe(id);
	});
});

describe("groupSortLabel", () => {
	test("the default reads Day · Newest first", () => {
		expect(groupSortLabel(list("date", "desc", "day"))).toBe(
			"Day · Newest first",
		);
	});

	test.each([
		[list("amount", "desc", "none"), "No grouping · Largest first"],
		[list("amount", "asc", "payee"), "Payee · Smallest first"],
		[list("date", "asc", "category"), "Category · Oldest first"],
	])("%j reads %s", (params, label) => {
		expect(groupSortLabel(params)).toBe(label);
	});
});

describe("withSort (BR-F03-55, D-529)", () => {
	test("by day, newest first, to largest first: the default grouping follows to none", () => {
		expect(withSort(list("date", "desc", "day"), "largest")).toEqual(
			list("amount", "desc", "none"),
		);
	});

	test("with no grouping, largest first, back to newest first: the default follows to day", () => {
		expect(withSort(list("amount", "desc", "none"), "newest")).toEqual(
			list("date", "desc", "day"),
		);
	});

	test("between the two date sorts the grouping stays", () => {
		expect(withSort(list("date", "desc", "day"), "oldest")).toEqual(
			list("date", "asc", "day"),
		);
	});

	test("between the two amount sorts the grouping stays", () => {
		expect(withSort(list("amount", "desc", "none"), "smallest")).toEqual(
			list("amount", "asc", "none"),
		);
	});

	test.each(["category", "payee"] as const)(
		"a chosen %s grouping stays across every sort",
		(group) => {
			for (const choice of [
				"newest",
				"oldest",
				"largest",
				"smallest",
			] as const) {
				expect(withSort(list("date", "desc", group), choice).group).toBe(
					group,
				);
				expect(withSort(list("amount", "asc", group), choice).group).toBe(
					group,
				);
			}
		},
	);

	test("no grouping chosen under a date sort stays when sorting by amount", () => {
		expect(withSort(list("date", "desc", "none"), "largest")).toEqual(
			list("amount", "desc", "none"),
		);
	});

	test("no grouping under a date sort stays when going back to a date sort", () => {
		expect(withSort(list("date", "asc", "none"), "newest")).toEqual(
			list("date", "desc", "none"),
		);
	});

	test("the result is never day with an amount sort, which the URL refuses", () => {
		for (const group of ["day", "category", "payee", "none"] as const)
			for (const from of SORT_CHOICES)
				for (const to of SORT_CHOICES) {
					const next = withSort(list(from.sort, from.dir, group), to.id);
					expect(next.group === "day" && next.sort === "amount").toBe(
						false,
					);
				}
	});

	test("choosing the sort already chosen changes nothing", () => {
		const params = list("date", "desc", "payee");
		expect(withSort(params, "newest")).toEqual(params);
	});
});

describe("withGroup (BR-F03-55, D-529)", () => {
	test.each(["category", "payee", "none"] as const)(
		"choosing %s keeps the sort",
		(group) => {
			expect(withGroup(list("amount", "asc", "day"), group)).toEqual(
				list("amount", "asc", group),
			);
		},
	);

	test("choosing Day under a date sort keeps it", () => {
		expect(withGroup(list("date", "asc", "none"), "day")).toEqual(
			list("date", "asc", "day"),
		);
	});

	test("choosing Day under largest first switches to newest first", () => {
		expect(withGroup(list("amount", "desc", "none"), "day")).toEqual(
			list("date", "desc", "day"),
		);
	});

	test("choosing Day under smallest first switches to oldest first", () => {
		expect(withGroup(list("amount", "asc", "payee"), "day")).toEqual(
			list("date", "asc", "day"),
		);
	});

	test("never changes the list it is given", () => {
		const params = list("amount", "desc", "none");
		withGroup(params, "day");
		withSort(params, "newest");
		expect(params).toEqual(list("amount", "desc", "none"));
	});
});
