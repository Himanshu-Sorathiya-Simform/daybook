// @vitest-environment node
import { describe, expect, test } from "vitest";

import { ApiError } from "../../../api/errors";
import {
	badParams,
	HISTOGRAM_IGNORES,
	LIST_PARAMS,
	readFilterQuery,
	readListQuery,
	readSummaryQuery,
	single,
} from "../query";

const read = (query: string) => readListQuery(new URLSearchParams(query), "INR");

/** The parameters a 400 names, or null when the query reads. */
function refused(
	query: string,
	reader: (query: string) => unknown = read,
): string[] | null {
	try {
		reader(query);
		return null;
	} catch (error) {
		if (!(error instanceof ApiError)) throw error;
		expect(error).toMatchObject({ code: "bad_request", status: 400 });
		return error.details["params"] as string[];
	}
}

describe("readListQuery", () => {
	test("an empty query lists everything, newest first by day, 50 a page", () => {
		expect(read("")).toEqual({
			filter: {},
			list: { sort: "date", dir: "desc", group: "day" },
			limit: 50,
			cursor: undefined,
		});
	});

	// golden check B, oldest first by category, 20 a page.
	test("reads the filter, the list parameters, the limit and the cursor", () => {
		expect(
			read(
				"from=2026-10-01&to=2026-10-31&cat=food&dir=asc&group=category&limit=20&cursor=abc",
			),
		).toEqual({
			filter: { from: "2026-10-01", to: "2026-10-31", cat: ["food"] },
			list: { sort: "date", dir: "asc", group: "category" },
			limit: 20,
			cursor: "abc",
		});
	});

	test.each(["1", "50", "99", "100"])("takes limit=%s", (limit) => {
		expect(read(`limit=${limit}`).limit).toBe(Number.parseInt(limit, 10));
	});

	test.each(["0", "101", "1000", "1.5", "01", "-1", "+5", "1e2", "abc", " 5"])(
		"refuses limit=%j",
		(limit) => {
			expect(refused(`limit=${encodeURIComponent(limit)}`)).toEqual(["limit"]);
		},
	);

	// D-458: an empty value counts as absent.
	test("an empty limit or cursor counts as absent", () => {
		expect(read("limit=&cursor=")).toMatchObject({
			limit: 50,
			cursor: undefined,
		});
	});

	// D-458: a repeated parameter is invalid.
	test.each(["limit=5&limit=5", "cursor=a&cursor=b"])("refuses %s", (query) => {
		expect(refused(query)).toEqual([query.split("=")[0]]);
	});

	// D-457: the API refuses what a page would drop with the notice.
	test.each([
		["cat=pizza", ["cat"]],
		["from=2026-10-31&to=2026-10-01", ["from", "to"]],
		["q=ab", ["q"]],
		["sort=price", ["sort"]],
		["sort=amount&group=day", ["group"]],
		["group=week", ["group"]],
		["min=0", ["min"]],
	])("refuses %s, naming %j", (query, params) => {
		expect(refused(query)).toEqual(params);
	});

	test("names every invalid parameter at once, filter and list first, then limit and cursor", () => {
		expect(
			refused("cursor=a&cursor=b&limit=0&sort=price&cat=pizza&type=gift"),
		).toEqual(["type", "cat", "sort", "limit", "cursor"]);
	});

	test("ignores names that are not its own, such as txn, view and page", () => {
		expect(read("txn=1&view=2&page=3&new=1")).toEqual(read(""));
	});
});

describe("single", () => {
	const query = new URLSearchParams("a=1&b=&c=1&c=2");

	test("is the value once, undefined when absent or empty, null when repeated", () => {
		expect(single(query, "a")).toBe("1");
		expect(single(query, "b")).toBeUndefined();
		expect(single(query, "z")).toBeUndefined();
		expect(single(query, "c")).toBeNull();
	});
});

describe("badParams", () => {
	test("is 400 bad_request naming the parameters, as a copy", () => {
		const names = ["cat"];
		const error = badParams(names);
		names.push("q");
		expect(error).toMatchObject({
			code: "bad_request",
			status: 400,
			details: { params: ["cat"] },
		});
	});
});

describe("readFilterQuery (D-478)", () => {
	const facets = (query: string) =>
		readFilterQuery(new URLSearchParams(query), "INR", LIST_PARAMS);
	const histogram = (query: string) =>
		readFilterQuery(new URLSearchParams(query), "INR", HISTOGRAM_IGNORES);

	// F03 section 3: the list parameters select no rows, so these endpoints ignore them.
	test.each([
		"sort=price",
		"dir=up",
		"group=week",
		"sort=amount&group=day",
		"limit=0",
		"cursor=x",
	])("ignores %s, valid or not", (query) => {
		expect(facets(query)).toEqual({});
	});

	test("still refuses every invalid filter parameter, naming them", () => {
		expect(refused("cat=pizza&q=ab&sort=price", facets)).toEqual(["cat", "q"]);
	});

	test("reads the filter as the list does", () => {
		expect(facets("from=2026-10-01&to=2026-10-31&cat=food,food")).toEqual({
			from: "2026-10-01",
			to: "2026-10-31",
			cat: ["food"],
		});
	});

	// F03 section 11: the histogram ignores min and max, valid or not.
	test.each(["min=abc", "max=0", "min=500.00&max=100.00", "min=1.234"])(
		"the histogram also ignores %s",
		(query) => {
			expect(() => histogram(query)).not.toThrow();
		},
	);

	test("the histogram keeps a valid min and max in the filter, for its function to drop", () => {
		expect(histogram("min=100.00&max=500.00")).toEqual({
			minMinor: 10000,
			maxMinor: 50000,
		});
	});

	test("the filter counts do not ignore min and max", () => {
		expect(refused("min=abc", facets)).toEqual(["min"]);
	});
});

describe("readSummaryQuery (BR-F03-58)", () => {
	const summary = (query: string) =>
		readSummaryQuery(new URLSearchParams(query), "INR");

	test.each([
		["", []],
		["by=category", ["category"]],
		["by=payee", ["payee"]],
		["by=category,payee", ["category", "payee"]],
		["by=payee,category", ["payee", "category"]],
	])("by from %j is %j", (query, by) => {
		expect(summary(query).by).toEqual(by);
	});

	// AC-F03-39
	test.each([
		"by=",
		"by=week",
		"by=category,category",
		"by=category,",
		"by=Category",
		"by=category&by=payee",
	])("refuses %s, naming by", (query) => {
		expect(refused(query, summary)).toEqual(["by"]);
	});

	test("ignores the list parameters and names by after the filter", () => {
		expect(refused("by=week&cat=pizza&sort=price", summary)).toEqual([
			"cat",
			"by",
		]);
		expect(summary("sort=price&group=week&by=payee")).toEqual({
			filter: {},
			by: ["payee"],
		});
	});
});
