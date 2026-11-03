// @vitest-environment node
import { describe, expect, test } from "vitest";

import { ApiError } from "../../../api/errors";
import { type Cursor, encodeCursor } from "../cursor";
import {
	badParams,
	HISTOGRAM_IGNORES,
	LIST_PARAMS,
	readFilterQuery,
	readHistoryQuery,
	readListQuery,
	readPayeesQuery,
	readSummaryQuery,
	single,
} from "../query";

const read = (query: string) => readListQuery(new URLSearchParams(query), "INR");

// golden #13: Acme Corp, 85,000.00 on 1 October at 10:05 IST, newest first by day.
const BY_DAY: Cursor = {
	v: 1,
	sort: "date",
	dir: "desc",
	group: "day",
	travel: "next",
	on: "2026-10-01",
	at: "2026-10-01T04:35:00.000Z",
	id: "0199a000-0000-7000-8000-000000000013",
};
const BY_CATEGORY = encodeCursor({
	...BY_DAY,
	dir: "asc",
	group: "category",
	groupKey: "salary",
	order: "0123456789abcdef",
});

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
				`from=2026-10-01&to=2026-10-31&cat=food&dir=asc&group=category&limit=20&cursor=${BY_CATEGORY}`,
			),
		).toEqual({
			filter: { from: "2026-10-01", to: "2026-10-31", cat: ["food"] },
			list: { sort: "date", dir: "asc", group: "category" },
			limit: 20,
			cursor: BY_CATEGORY,
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

	// D-478, D-490: the cursor is read with the query, so one 400 names it beside the rest.
	test("names a cursor that does not decode beside the other invalid parameters", () => {
		expect(refused("cat=pizza&cursor=junk&limit=0")).toEqual([
			"cat",
			"limit",
			"cursor",
		]);
	});

	// AC-F03-38, before any statement runs.
	test("names a cursor made under another grouping", () => {
		expect(refused(`group=none&cursor=${encodeCursor(BY_DAY)}`)).toEqual([
			"cursor",
		]);
	});

	// D-490: Postgres has no year 0, so this cursor would fail its cast as a 500.
	test("names a cursor whose instant lies in the year 0000", () => {
		const forged = Buffer.from(
			JSON.stringify({ ...BY_DAY, at: "0000-12-31T23:59:00.000Z" }),
		).toString("base64url");
		expect(refused(`cursor=${forged}`)).toEqual(["cursor"]);
	});

	// D-490: with no valid sort, direction or group to compare with, only the contents count.
	test.each([
		["sort=price", ["sort"]],
		["dir=up", ["dir"]],
		["group=week", ["group"]],
		["sort=amount&group=day", ["group"]],
	])("with %s, a well-formed cursor is not named", (query, params) => {
		expect(refused(`${query}&cursor=${encodeCursor(BY_DAY)}`)).toEqual(params);
	});

	test("with an invalid sort, a cursor that does not decode is still named", () => {
		expect(refused("sort=price&cursor=junk")).toEqual(["sort", "cursor"]);
	});

	// D-490: Postgres has no year 0.
	test("refuses dates in the year 0000", () => {
		expect(refused("from=0000-01-01&to=2026-10-31")).toEqual(["from", "to"]);
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

describe("readPayeesQuery (BR-F03-61)", () => {
	const payees = (query: string) => readPayeesQuery(new URLSearchParams(query));

	test("no q is the full list", () => {
		expect(payees("")).toEqual({});
		expect(payees("limit=5&page=2")).toEqual({});
	});

	test("q is trimmed and put in NFC", () => {
		expect(payees("q=%20apart%20")).toEqual({ q: "apart" });
		expect(payees(`q=${encodeURIComponent("Cafe\u0301")}`)).toEqual({
			q: "Café",
		});
	});

	test("takes 1 to 80 code points, an emoji counting as one", () => {
		expect(payees("q=a")).toEqual({ q: "a" });
		const eighty = "👍".repeat(80);
		expect(payees(`q=${encodeURIComponent(eighty)}`)).toEqual({ q: eighty });
	});

	// AC-F03-44
	test.each([
		["an empty q", "q="],
		["a q of spaces only", "q=%20%20"],
		["81 code points", `q=${"a".repeat(81)}`],
		["a control character", "q=a%09b"],
		["q twice", "q=a&q=b"],
	])("refuses %s, naming q", (_label, query) => {
		expect(refused(query, payees)).toEqual(["q"]);
	});
});

describe("readHistoryQuery (BR-F03-62)", () => {
	const history = (query: string) => readHistoryQuery(new URLSearchParams(query));

	test("months defaults to 3", () => {
		expect(history("payee=Swiggy")).toEqual({ payee: "Swiggy", months: 3 });
	});

	test.each(["1", "9", "10", "12"])("takes months=%s", (months) => {
		expect(history(`payee=Swiggy&months=${months}`).months).toBe(
			Number.parseInt(months, 10),
		);
	});

	// AC-F03-43
	test.each(["0", "13", "01", "1.5", "-1", "abc", "", "3&months=3"])(
		"refuses months=%s, naming months",
		(months) => {
			expect(refused(`payee=Swiggy&months=${months}`, history)).toEqual([
				"months",
			]);
		},
	);

	// AC-F03-43
	test.each([
		["no payee", "months=3"],
		["an empty payee", "payee="],
		["81 code points", `payee=${"a".repeat(81)}`],
		["a control character", "payee=a%0Ab"],
		["payee twice", "payee=a&payee=b"],
	])("refuses %s, naming payee", (_label, query) => {
		expect(refused(query, history)).toEqual(["payee"]);
	});

	test("names both when both are invalid, payee first", () => {
		expect(refused("months=13", history)).toEqual(["payee", "months"]);
	});

	test("trims the payee", () => {
		expect(history("payee=%20Acme%20Corp%20").payee).toBe("Acme Corp");
	});
});
