import { describe, expect, test } from "vitest";

import type { CurrencyCode } from "@/lib/currency";
import type { FilterParam } from "@/lib/transactions/model";
import {
	checkQuery,
	readFilterParams,
	writeFilterQuery,
	type ListParams,
	type TransactionFilter,
} from "@/lib/transactions/url";

const DEFAULT_LIST: ListParams = { sort: "date", dir: "desc", group: "day" };
const GOAL_ID = "0192f0c4-7a1e-7c3b-9d2a-5b8e1f0a1c01";

function read(query: string, currency: CurrencyCode = "INR") {
	return readFilterParams(new URLSearchParams(query), { currency });
}

/** The URL a page writes back after reading `query`, and the parameters it dropped. */
function normalize(query: string, currency: CurrencyCode = "INR") {
	const { filter, list, invalid } = read(query, currency);
	return { query: writeFilterQuery(filter, list, { currency }), invalid };
}

describe("normalizing a filter URL (BR-F03-33, BR-F03-34)", () => {
	// AC-F03-15
	test("dedupes a list and omits the default sort and direction", () => {
		expect(normalize("cat=food,food&dir=desc&sort=date")).toEqual({
			query: "cat=food",
			invalid: [],
		});
	});

	// AC-F03-15
	test("drops both dates when from is after to", () => {
		expect(normalize("from=2026-10-31&to=2026-10-01")).toEqual({
			query: "",
			invalid: ["from", "to"],
		});
	});

	// AC-F03-15
	test("drops a short text search and keeps a short numeric one", () => {
		expect(normalize("q=ab")).toEqual({ query: "", invalid: ["q"] });
		expect(normalize("q=12")).toEqual({ query: "q=12", invalid: [] });
	});

	test.each([
		["type=refund,expense&cat=shopping", "type=expense,refund&cat=shopping"],
		[
			"sort=amount&cat=shopping&type=refund",
			"type=refund&cat=shopping&sort=amount",
		],
		["cat=food,,shopping", "cat=food,shopping"],
		["cat=shopping,food,food", "cat=food,shopping"],
		["max=2000&min=500.5", "min=500.50&max=2000.00"],
		["min=500&max=500", "min=500.00&max=500.00"],
		["from=2026-10-01&to=2026-10-01", "from=2026-10-01&to=2026-10-01"],
		["from=2028-02-29&to=2028-03-01", "from=2028-02-29&to=2028-03-01"],
		["group=day", ""],
		["sort=amount&group=none", "sort=amount"],
		["sort=amount&group=payee", "sort=amount&group=payee"],
		["group=category", "group=category"],
		["dir=asc", "dir=asc"],
		["sort=amount&dir=asc", "sort=amount&dir=asc"],
		["src=subscription", "src=subscription"],
		["q=%20swiggy%20", "q=swiggy"],
		["q=chai+point", "q=chai%20point"],
		["q=50%25", "q=50%25"],
		["q=Cafe%CC%81", "q=Caf%C3%A9"],
		["q=1,240.50", "q=1%2C240.50"],
		["q=%20%20%20", ""],
		// Q3, D-498: text of invisible characters only is empty, so it is no search.
		["q=%E2%80%8B", ""],
		["q=%E2%80%8B%20%E2%81%A0", ""],
		["from=&to=&min=&max=&src=&goal=&sort=&dir=&group=", ""],
		["cat=", ""],
		["type=,", ""],
		["foo=1&txn=0192&new=1&view=abc", ""],
		[`goal=${GOAL_ID.toUpperCase()}`, `goal=${GOAL_ID}`],
	])("normalizes %j to %j with no notice", (query, normalized) => {
		expect(normalize(query)).toEqual({ query: normalized, invalid: [] });
	});

	test.each([
		["min=1,500", ["min"], "grouping in a URL amount"],
		["min=1500.505", ["min"], "too many decimals"],
		["min=abc", ["min"], "not a number"],
		["min=0", ["min"], "a zero bound"],
		["max=0.00", ["max"], "a zero bound with decimals"],
		["max=1000000000", ["max"], "above MON-5"],
		["min=900&max=100", ["min", "max"], "min above max"],
		[
			"from=2026-02-30&to=2026-03-01",
			["from", "to"],
			"a date that does not exist",
		],
		["from=2026-1-01&to=2026-01-31", ["from", "to"], "a malformed date"],
		[
			"from=2026-02-29&to=2026-03-01",
			["from", "to"],
			"29 February outside a leap year",
		],
		[
			"from=2026-10-01&to=2026-10-32",
			["from", "to"],
			"an end date that does not exist",
		],
		["from=2026-10-01", ["from"], "a range with no end"],
		["to=2026-10-31", ["to"], "a range with no start"],
		[
			"from=2026-10-01&from=2026-10-02&to=2026-10-31",
			["from", "to"],
			"a repeated date",
		],
		["type=expense,transfer", ["type"], "an unknown type"],
		["cat=pizza", ["cat"], "an unknown category"],
		["cat=food,pizza", ["cat"], "one unknown category among known ones"],
		["cat=food&cat=shopping", ["cat"], "a repeated list"],
		["goal=abc", ["goal"], "a Goal that is not a UUID"],
		["sub=12345", ["sub"], "a Subscription that is not a UUID"],
		["src=bank", ["src"], "an unknown source"],
		["q=a", ["q"], "one character of text"],
		["q=ab%09cd", ["q"], "a control character"],
		[`q=${"a".repeat(101)}`, ["q"], "101 characters"],
		[`q=${"1".repeat(101)}`, ["q"], "101 digits"],
		["sort=price", ["sort"], "an unknown sort"],
		["dir=up", ["dir"], "an unknown direction"],
		["group=week", ["group"], "an unknown group"],
	] as [string, FilterParam[], string][])(
		"drops %j with the notice: %s",
		(query, invalid) => {
			const result = normalize(query);
			expect(result.invalid).toEqual(invalid);
			expect(result.query).toBe("");
		},
	);

	// AC-F03-33
	describe("grouping", () => {
		test("day grouping with the amount sort is dropped with the notice", () => {
			expect(normalize("sort=amount&group=day")).toEqual({
				query: "sort=amount",
				invalid: ["group"],
			});
		});

		test("day grouping and no grouping are each their sort's default", () => {
			expect(normalize("group=day")).toEqual({ query: "", invalid: [] });
			expect(normalize("sort=amount&group=none")).toEqual({
				query: "sort=amount",
				invalid: [],
			});
		});

		test("payee grouping is kept with the amount sort", () => {
			expect(normalize("sort=amount&group=payee")).toEqual({
				query: "sort=amount&group=payee",
				invalid: [],
			});
		});

		test("an unknown group is dropped with the notice", () => {
			expect(normalize("group=week")).toEqual({
				query: "",
				invalid: ["group"],
			});
		});

		test("with an unknown sort, the date sort's day grouping stays valid", () => {
			expect(read("sort=price&group=day")).toEqual({
				filter: {},
				list: DEFAULT_LIST,
				invalid: ["sort"],
			});
		});

		test("no grouping with the date sort is kept", () => {
			expect(normalize("group=none")).toEqual({
				query: "group=none",
				invalid: [],
			});
		});
	});

	test("drops only what is invalid and keeps every valid parameter", () => {
		expect(normalize("cat=food&min=abc&q=swiggy&sort=amount&dir=up")).toEqual({
			query: "cat=food&q=swiggy&sort=amount",
			invalid: ["min", "dir"],
		});
	});

	test("lists dropped parameters in the URL's fixed order", () => {
		expect(read("group=week&q=a&cat=pizza&from=2026-13-01").invalid).toEqual([
			"from",
			"cat",
			"q",
			"group",
		]);
	});

	test("accepts a search of exactly 100 characters, counted in code points", () => {
		expect(normalize(`q=${"a".repeat(100)}`).invalid).toEqual([]);
		const emoji = encodeURIComponent("👍".repeat(100));
		expect(read(`q=${emoji}`).filter.q).toBe("👍".repeat(100));
	});

	test("accepts a search of exactly 3 characters", () => {
		expect(read("q=abc").filter).toEqual({ q: "abc" });
	});
});

describe("reading the golden list checks", () => {
	// docs/03-golden-dataset.md, "Transactions list checks".
	test.each([
		[
			"A",
			"from=2026-10-01&to=2026-10-31",
			{ from: "2026-10-01", to: "2026-10-31" },
		],
		[
			"B",
			"from=2026-10-01&to=2026-10-31&cat=food",
			{ from: "2026-10-01", to: "2026-10-31", cat: ["food"] },
		],
		[
			"C",
			"from=2026-09-01&to=2026-10-31&cat=shopping",
			{ from: "2026-09-01", to: "2026-10-31", cat: ["shopping"] },
		],
		["D", "q=swiggy", { q: "swiggy" }],
		[
			"E",
			"from=2026-10-01&to=2026-10-31&src=subscription",
			{ from: "2026-10-01", to: "2026-10-31", src: "subscription" },
		],
		[
			"F",
			"type=goal_contribution,goal_withdrawal",
			{ type: ["goal_contribution", "goal_withdrawal"] },
		],
		["G", "q=groceries", { q: "groceries" }],
		["H", "q=649", { q: "649" }],
		[
			"I",
			"from=2026-11-01&to=2026-11-02",
			{ from: "2026-11-01", to: "2026-11-02" },
		],
	] as [string, string, TransactionFilter][])(
		"check %s",
		(_check, query, filter) => {
			expect(read(query)).toEqual({ filter, list: DEFAULT_LIST, invalid: [] });
		},
	);

	test("reads amounts into minor units and every other field as given", () => {
		expect(
			read(
				`from=2026-09-01&to=2026-10-31&type=expense&cat=food&goal=${GOAL_ID}&sub=${GOAL_ID}&src=manual&min=500&max=2900.5&q=bigbasket&sort=amount&dir=asc&group=category`,
			),
		).toEqual({
			filter: {
				from: "2026-09-01",
				to: "2026-10-31",
				type: ["expense"],
				cat: ["food"],
				goal: GOAL_ID,
				sub: GOAL_ID,
				src: "manual",
				minMinor: 50000,
				maxMinor: 290050,
				q: "bigbasket",
			},
			list: { sort: "amount", dir: "asc", group: "category" },
			invalid: [],
		});
	});
});

describe("equivalent URLs share one normalized filter (the query key)", () => {
	test("whatever the order, repeats and spelling of amounts", () => {
		const a = read("type=refund,expense&from=2026-10-01&to=2026-10-31&min=500");
		const b = read(
			"to=2026-10-31&min=500.00&type=expense,refund,expense&from=2026-10-01",
		);

		expect(a).toEqual(b);
		expect(Object.keys(a.filter)).toEqual(Object.keys(b.filter));
	});

	test("keys follow the URL's fixed order, so serialized keys match too", () => {
		const { filter } = read("q=swiggy&cat=food&to=2026-10-31&from=2026-10-01");
		expect(Object.keys(filter)).toEqual(["from", "to", "cat", "q"]);
	});
});

describe("amounts by currency", () => {
	test.each([
		["JPY", "min=1500", "min=1500", []],
		["JPY", "min=1500.5", "", ["min"]],
		["KWD", "min=1.25", "min=1.250", []],
		["KWD", "min=1.2505", "", ["min"]],
		["USD", "max=999999999.99", "max=999999999.99", []],
	] as [CurrencyCode, string, string, FilterParam[]][])(
		"in %s, %j normalizes to %j",
		(currency, query, normalized, invalid) => {
			expect(normalize(query, currency)).toEqual({
				query: normalized,
				invalid,
			});
		},
	);
});

describe("writeFilterQuery", () => {
	test("writes nothing for the default filter and list", () => {
		expect(writeFilterQuery({}, DEFAULT_LIST, { currency: "INR" })).toBe("");
	});

	test("writes every field in the fixed order", () => {
		expect(
			writeFilterQuery(
				{
					q: "a b",
					maxMinor: 100000,
					minMinor: 100,
					src: "subscription",
					sub: GOAL_ID,
					goal: GOAL_ID,
					cat: ["shopping", "food"],
					type: ["refund", "expense"],
					to: "2026-10-31",
					from: "2026-10-01",
				},
				{ sort: "amount", dir: "asc", group: "payee" },
				{ currency: "INR" },
			),
		).toBe(
			`from=2026-10-01&to=2026-10-31&type=expense,refund&cat=food,shopping&goal=${GOAL_ID}&sub=${GOAL_ID}&src=subscription&min=1.00&max=1000.00&q=a%20b&sort=amount&dir=asc&group=payee`,
		);
	});

	test("omits an empty list", () => {
		expect(
			writeFilterQuery({ cat: [], type: [] }, DEFAULT_LIST, {
				currency: "INR",
			}),
		).toBe("");
	});

	test("omits the group when it is the sort's default, and writes it otherwise", () => {
		const inr = { currency: "INR" } as const;
		expect(
			writeFilterQuery({}, { sort: "date", dir: "desc", group: "day" }, inr),
		).toBe("");
		expect(
			writeFilterQuery({}, { sort: "date", dir: "desc", group: "none" }, inr),
		).toBe("group=none");
		expect(
			writeFilterQuery(
				{},
				{ sort: "amount", dir: "desc", group: "none" },
				inr,
			),
		).toBe("sort=amount");
	});

	test("reads back to the same filter and list", () => {
		const cases: [TransactionFilter, ListParams][] = [
			[{}, DEFAULT_LIST],
			[{ q: "Café & co. 50%" }, DEFAULT_LIST],
			[{ q: "1,23,456.50" }, { sort: "amount", dir: "asc", group: "none" }],
			[{ type: ["income"], minMinor: 1, maxMinor: 99999999999 }, DEFAULT_LIST],
			[
				{
					from: "2025-12-01",
					to: "2026-11-30",
					cat: ["food", "health"],
					src: "manual",
				},
				{ sort: "date", dir: "asc", group: "category" },
			],
		];
		for (const [filter, list] of cases) {
			const query = writeFilterQuery(filter, list, { currency: "INR" });
			expect(read(query)).toEqual({ filter, list, invalid: [] });
		}
	});
});

describe("checkQuery (BR-F03-34)", () => {
	test("answers the search trimmed and in NFC", () => {
		expect(checkQuery(" Cafe\u0301 ", "INR")).toEqual({
			ok: true,
			q: "Caf\u00e9",
		});
	});

	test("treats a missing or blank search as absent", () => {
		expect(checkQuery(undefined, "INR")).toEqual({ ok: true, q: undefined });
		expect(checkQuery("   ", "INR")).toEqual({ ok: true, q: undefined });
	});

	// Q3, D-498: a search of invisible characters only is blank too.
	test("treats a search of zero-width spaces as absent", () => {
		expect(checkQuery("\u200b\u200b", "INR")).toEqual({
			ok: true,
			q: undefined,
		});
	});

	// B3, D-498: it would reach `jsonb` in a saved view, which Postgres refuses.
	test("refuses a lone surrogate as a character problem", () => {
		expect(checkQuery("cafe\ud800 bar", "INR")).toEqual({
			ok: false,
			reason: "characters",
		});
	});

	test.each([
		["ab\u0007c", "characters"],
		["a".repeat(101), "too_long"],
		["ab", "too_short"],
		["0", "too_short"],
	])("refuses %j: %s", (raw, reason) => {
		expect(checkQuery(raw, "INR")).toEqual({ ok: false, reason });
	});

	test("keeps a short search that is an amount", () => {
		expect(checkQuery("12", "INR")).toEqual({ ok: true, q: "12" });
	});
});
