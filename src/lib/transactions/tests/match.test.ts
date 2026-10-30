import { describe, expect, test } from "vitest";

import {
	GOLDEN_ALL,
	GOLDEN_GOALS,
	GOLDEN_PENDING_P1,
	GOLDEN_SUBSCRIPTIONS,
	goldenRow,
} from "../../../../seed/golden";
import {
	matchesFilter,
	searchTerms,
	searchText,
	type MatchableRow,
} from "@/lib/transactions/match";
import { readFilterParams, type TransactionFilter } from "@/lib/transactions/url";

/** The filter a page reads from `query`, as the golden checks write it. */
function filterOf(query: string): TransactionFilter {
	const { filter, invalid } = readFilterParams(new URLSearchParams(query), {
		currency: "INR",
	});
	expect(invalid).toEqual([]);
	return filter;
}

const P1: MatchableRow = GOLDEN_PENDING_P1;
const ROWS: { label: string; row: MatchableRow }[] = [
	...GOLDEN_ALL.map((row) => ({ label: `#${row.golden}`, row })),
	{ label: "P1", row: P1 },
];

function matching(filter: TransactionFilter): string[] {
	return ROWS.filter(({ row }) => matchesFilter(row, filter, "INR")).map(
		({ label }) => label,
	);
}

/** A plain expense to vary one field at a time. */
const BASE: MatchableRow = {
	type: "expense",
	amountMinor: 64000,
	occurredOn: "2026-10-19",
	category: "food",
	goalId: null,
	subscriptionId: null,
	source: "manual",
	payee: "Swiggy",
	description: null,
	note: null,
};
const row = (changes: Partial<MatchableRow>): MatchableRow => ({
	...BASE,
	...changes,
});
const matches = (changes: Partial<MatchableRow>, filter: TransactionFilter) =>
	matchesFilter(row(changes), filter, "INR");

// AC-F03-17: matchesFilter agrees with the golden list checks. P1 is pending and is matched
// here as the page matches pending rows (BR-F03-43); it is never counted in a total.
describe("the golden list checks", () => {
	test.each([
		[
			"A",
			"from=2026-10-01&to=2026-10-31",
			[
				"#12",
				"#13",
				"#14",
				"#15",
				"#16",
				"#17",
				"#18",
				"#19",
				"#20",
				"#21",
				"#22",
				"#23",
				"#24",
				"#25",
			],
		],
		[
			"B",
			"from=2026-10-01&to=2026-10-31&cat=food",
			["#15", "#21", "#24", "#25"],
		],
		["C", "from=2026-09-01&to=2026-10-31&cat=shopping", ["#6", "#17", "#18"]],
		["D", "q=swiggy", ["#4", "#24", "#25", "#26"]],
		[
			"E",
			"from=2026-10-01&to=2026-10-31&src=subscription",
			["#12", "#16", "#20"],
		],
		[
			"F",
			"type=goal_contribution,goal_withdrawal",
			["#3", "#9", "#14", "#22", "#23"],
		],
		["G", "q=groceries", ["#8", "#21"]],
		["H", "q=649", ["#5", "#16"]],
		["I", "from=2026-11-01&to=2026-11-02", ["#26", "#27", "P1"]],
	])("check %s (%s) selects %j", (_check, query, expected) => {
		expect(matching(filterOf(query))).toEqual(expected);
	});

	test("the empty filter selects every row", () => {
		expect(matching({})).toHaveLength(28);
	});
});

describe("text search (BR-F03-35)", () => {
	test("matches the payee, description or note as a substring", () => {
		expect(matches({ payee: "BigBasket" }, { q: "bas" })).toBe(true);
		expect(matches({ description: "Monthly groceries" }, { q: "groc" })).toBe(
			true,
		);
		expect(matches({ note: "Split with Asha" }, { q: "asha" })).toBe(true);
		expect(matches({ payee: "BigBasket" }, { q: "zomato" })).toBe(false);
	});

	test("ignores case, including letters outside ASCII", () => {
		expect(matches({ payee: "Swiggy" }, { q: "SWIGGY" })).toBe(true);
		expect(matches({ payee: "Café Coffee Day" }, { q: "CAFÉ" })).toBe(true);
	});

	// T1
	describe("search edge cases", () => {
		test.each(["baz", "BAZAAR", "g b", "big baz", "azaa"])(
			'"Big Bazaar" is found by %j, anywhere in the text',
			(q) => {
				expect(matches({ payee: "Big Bazaar" }, { q })).toBe(true);
			},
		);

		test("a decomposed search read from a URL finds the composed payee, since the reader normalizes it (BR-F03-33)", () => {
			const filter = filterOf("q=Cafe%CC%81");
			expect(filter.q).toBe("Caf\u00e9");
			expect(matches({ payee: "Caf\u00e9" }, filter)).toBe(true);
			expect(matches({ payee: "CAF\u00c9 Coffee Day" }, filter)).toBe(true);
		});

		// FIL-1: an empty list is a filter that nothing passes, not one that is switched off.
		test.each([
			["type", { type: [] }],
			["cat", { cat: [] }],
		] as [string, TransactionFilter][])(
			"an empty %s list matches no row",
			(_name, filter) => {
				expect(matching(filter)).toEqual([]);
				expect(matches({}, filter)).toBe(false);
			},
		);
	});

	// B9, D-497, BR-F03-43: the browser must find what SQL's `ILIKE` finds, letter for letter.
	describe("case folding the way Postgres does it", () => {
		test('"İstanbul Kebab" is found by "ist" and by "İST"', () => {
			expect(matches({ payee: "İstanbul Kebab" }, { q: "ist" })).toBe(true);
			expect(matches({ payee: "İstanbul Kebab" }, { q: "İST" })).toBe(true);
		});

		test('"ΟΔΟΣ" is found by "οδοσ", whatever the position of the sigma', () => {
			expect(matches({ payee: "ΟΔΟΣ" }, { q: "οδοσ" })).toBe(true);
			expect(matches({ payee: "οδοσ" }, { q: "ΟΔΟΣ" })).toBe(true);
			expect(matches({ description: "ΟΔΟΣ ΑΘΗΝΩΝ" }, { q: "οδοσ α" })).toBe(
				true,
			);
		});

		test('the final sigma "ς" is a different letter, as in Postgres', () => {
			expect(matches({ payee: "οδος" }, { q: "οδοσ" })).toBe(false);
		});

		test("a Unicode 17 letter that Postgres 18 leaves alone matches only itself", () => {
			expect(matches({ payee: "\u{16ea0}" }, { q: "\u{16ebb}" })).toBe(false);
			expect(matches({ payee: "\u{16ea0}" }, { q: "\u{16ea0}" })).toBe(true);
		});
	});

	// AC-F03-31
	test("never matches across two fields", () => {
		expect(
			matches(
				{ payee: "Swiggy", description: "Monthly groceries" },
				{ q: "swiggy monthly" },
			),
		).toBe(false);
		expect(
			matches({ payee: "Swiggy", description: "Monthly" }, { q: "ggymon" }),
		).toBe(false);
	});

	// AC-F03-16
	test("takes % literally: 50% matches 50% off and not 500", () => {
		expect(matches({ description: "50% off" }, { q: "50%" })).toBe(true);
		expect(matches({ description: "500 off" }, { q: "50%" })).toBe(false);
	});

	test("takes _ and \\ literally", () => {
		expect(matches({ note: "ref a_b" }, { q: "a_b" })).toBe(true);
		expect(matches({ note: "ref axb" }, { q: "a_b" })).toBe(false);
		expect(matches({ note: "C:\\docs" }, { q: ":\\d" })).toBe(true);
		expect(matches({ note: "C:docs" }, { q: ":\\d" })).toBe(false);
	});

	test("treats a missing description and note as empty", () => {
		expect(matches({ description: null, note: null }, { q: "swi" })).toBe(true);
		expect(
			matches({ payee: null, description: null, note: null }, { q: "swi" }),
		).toBe(false);
	});

	test("a Goal row has no text, so a text search skips it", () => {
		expect(matchesFilter(goldenRow(3), { q: "emergency" }, "INR")).toBe(false);
	});
});

describe("numeric search (BR-F03-35)", () => {
	test("also matches the exact amount", () => {
		expect(matches({ amountMinor: 64900, payee: "Netflix" }, { q: "649" })).toBe(
			true,
		);
		expect(matches({ amountMinor: 64000, payee: "Swiggy" }, { q: "649" })).toBe(
			false,
		);
		expect(matches({ amountMinor: 124050 }, { q: "1,240.50" })).toBe(true);
	});

	// golden: edge case "A numeric q such as 649 also matches any payee, description or note containing 649."
	test("of 3 characters or more also matches text", () => {
		expect(
			matches({ amountMinor: 100, description: "Order 64901" }, { q: "649" }),
		).toBe(true);
	});

	test("under 3 characters matches amounts only", () => {
		expect(matches({ amountMinor: 1200, payee: "Uber" }, { q: "12" })).toBe(
			true,
		);
		expect(
			matches({ amountMinor: 100, payee: "12th Street Cafe" }, { q: "12" }),
		).toBe(false);
	});

	test("uses the currency's exponent", () => {
		expect(matchesFilter(row({ amountMinor: 649 }), { q: "649" }, "JPY")).toBe(
			true,
		);
		expect(matchesFilter(row({ amountMinor: 649 }), { q: "649" }, "INR")).toBe(
			false,
		);
	});

	test("a number the amount field refuses is plain text", () => {
		expect(matches({ amountMinor: 0, note: "code 00x" }, { q: "000" })).toBe(
			false,
		);
		expect(matches({ note: "code 000" }, { q: "000" })).toBe(true);
	});
});

describe("each field", () => {
	test("dates are inclusive on occurredOn", () => {
		const range = { from: "2026-10-01", to: "2026-10-31" };
		expect(matches({ occurredOn: "2026-10-01" }, range)).toBe(true);
		expect(matches({ occurredOn: "2026-10-31" }, range)).toBe(true);
		expect(matches({ occurredOn: "2026-09-30" }, range)).toBe(false);
		expect(matches({ occurredOn: "2026-11-01" }, range)).toBe(false);
	});

	// golden: #26 at 00:30 on 1 November local counts in November, though its UTC instant is
	// in October (root success criterion 2).
	test("uses the local date, never the UTC instant", () => {
		expect(
			matchesFilter(
				goldenRow(26),
				{ from: "2026-10-01", to: "2026-10-31" },
				"INR",
			),
		).toBe(false);
		expect(
			matchesFilter(
				goldenRow(26),
				{ from: "2026-11-01", to: "2026-11-30" },
				"INR",
			),
		).toBe(true);
	});

	test("type takes any of the listed types", () => {
		expect(matches({ type: "refund" }, { type: ["expense", "refund"] })).toBe(
			true,
		);
		expect(matches({ type: "income" }, { type: ["expense", "refund"] })).toBe(
			false,
		);
	});

	test("category takes any of the listed categories", () => {
		expect(matches({ category: "food" }, { cat: ["food", "shopping"] })).toBe(
			true,
		);
		expect(matches({ category: "health" }, { cat: ["food", "shopping"] })).toBe(
			false,
		);
	});

	// FIL-6, BR-F03-37
	test("a category filter excludes Goal rows", () => {
		const goal = row({
			type: "goal_contribution",
			category: null,
			goalId: GOLDEN_GOALS.vacation.id,
			payee: null,
		});
		expect(matchesFilter(goal, { cat: ["food"] }, "INR")).toBe(false);
		expect(matchesFilter(goal, {}, "INR")).toBe(true);
	});

	test("a Goal filter keeps only that Goal's rows", () => {
		const filter = { goal: GOLDEN_GOALS.vacation.id };
		expect(matching(filter)).toEqual(["#9", "#22", "#23"]);
	});

	// golden edge case: "Category and Goal filters together ... the result is empty."
	test("a category and a Goal together select nothing", () => {
		expect(matching({ cat: ["food"], goal: GOLDEN_GOALS.vacation.id })).toEqual(
			[],
		);
	});

	// BR-F03-37, D-255
	test("a Subscription filter keeps only that Subscription's charges", () => {
		expect(matching({ sub: GOLDEN_SUBSCRIPTIONS.netflix.id })).toEqual([
			"#5",
			"#16",
		]);
	});

	test("a Goal or Subscription id that is not the user's matches nothing", () => {
		expect(matching({ goal: "0199a000-0000-7000-8001-999999999999" })).toEqual(
			[],
		);
	});

	test("source keeps manual rows or charges", () => {
		expect(matches({ source: "manual" }, { src: "manual" })).toBe(true);
		expect(matches({ source: "subscription" }, { src: "manual" })).toBe(false);
	});

	// BR-F03-36: inclusive bounds on the positive amount, for every type.
	test("amount bounds are inclusive", () => {
		const bounds = { minMinor: 50000, maxMinor: 64000 };
		expect(matches({ amountMinor: 50000 }, bounds)).toBe(true);
		expect(matches({ amountMinor: 64000 }, bounds)).toBe(true);
		expect(matches({ amountMinor: 49999 }, bounds)).toBe(false);
		expect(matches({ amountMinor: 64001 }, bounds)).toBe(false);
		expect(matches({ amountMinor: 64001 }, { minMinor: 50000 })).toBe(true);
		expect(matches({ amountMinor: 49999 }, { maxMinor: 64000 })).toBe(true);
	});

	test("amount bounds apply to income and Goal rows too", () => {
		expect(matching({ minMinor: 1000000 })).toEqual([
			"#1",
			"#2",
			"#11",
			"#12",
			"#13",
			"#27",
		]);
	});

	// FIL-1: fields combine with AND.
	test("every field must match", () => {
		const filter: TransactionFilter = {
			from: "2026-10-01",
			to: "2026-10-31",
			type: ["expense"],
			cat: ["food"],
			src: "manual",
			minMinor: 50000,
			q: "swi",
		};
		expect(matching(filter)).toEqual(["#24"]);
		expect(matches({}, filter)).toBe(true);
		expect(matches({ occurredOn: "2026-11-01" }, filter)).toBe(false);
		expect(matches({ type: "refund" }, filter)).toBe(false);
		expect(matches({ category: "shopping" }, filter)).toBe(false);
		expect(matches({ source: "subscription" }, filter)).toBe(false);
		expect(matches({ amountMinor: 100 }, filter)).toBe(false);
		expect(matches({ payee: "Zomato" }, filter)).toBe(false);
	});
});

describe("searchText", () => {
	test("joins payee, description and note with U+001F", () => {
		expect(searchText(row({ payee: "A", description: "B", note: "C" }))).toBe(
			"A\u001fB\u001fC",
		);
	});

	test("writes a missing field as an empty string", () => {
		expect(searchText(row({ payee: null, description: null, note: null }))).toBe(
			"\u001f\u001f",
		);
	});
});

describe("searchTerms (BR-F03-35)", () => {
	test.each([
		["swiggy", "INR", null, "swiggy"],
		["SWIGGY", "INR", null, "SWIGGY"],
		["649", "INR", 64900, "649"],
		["6.49", "INR", 649, "6.49"],
		["1,240.50", "INR", 124050, "1,240.50"],
		["1,23,456.50", "INR", 12345650, "1,23,456.50"],
		["649", "JPY", 649, "649"],
		["1.250", "KWD", 1250, "1.250"],
	] as const)(
		"%j in %s searches the amount %j and the text %j",
		(q, currency, amountMinor, text) => {
			expect(searchTerms(q, currency)).toEqual({ amountMinor, text });
		},
	);

	test.each([
		["64", "INR", 6400],
		["1", "INR", 100],
		["99", "JPY", 99],
	] as const)(
		"%j in %s is a number under 3 characters, so it searches the amount %j only",
		(q, currency, amountMinor) => {
			expect(searchTerms(q, currency)).toEqual({ amountMinor, text: null });
		},
	);

	test.each([
		["0", "a zero amount"],
		["6.499", "more decimals than INR allows"],
		["12,34", "a grouping that is neither thousands nor Indian"],
		["1.2.3", "two decimal signs"],
		["999999999999", "an amount above the INR maximum"],
		["ab", "two letters"],
		["50%", "a percent sign"],
	])("%j is text alone: %s", (q) => {
		expect(searchTerms(q, "INR")).toEqual({ amountMinor: null, text: q });
	});

	test("counts code points, so a 3-character number still searches text", () => {
		expect(searchTerms("100", "INR")).toEqual({
			amountMinor: 10000,
			text: "100",
		});
	});
});
