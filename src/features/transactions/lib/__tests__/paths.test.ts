import { describe, expect, test } from "vitest";

import type { ListParams, TransactionFilter } from "@/lib/transactions/url";
import {
	facetsPath,
	histogramPath,
	listPath,
	payeeHistoryPath,
	payeesPath,
	summaryPath,
	transactionPath,
	viewPath,
	VIEWS_PATH,
} from "../paths";

const DEFAULT_LIST: ListParams = { sort: "date", dir: "desc", group: "day" };
const CHECK_B: TransactionFilter = {
	from: "2026-10-01",
	to: "2026-10-31",
	cat: ["food"],
};

/** The query of a path, read back the way the server reads it. */
const queryOf = (path: string) => new URL(path, "http://daybook.test").searchParams;

describe("listPath", () => {
	test("the first page has no cursor and no default list parameters", () => {
		expect(
			listPath(CHECK_B, DEFAULT_LIST, { currency: "INR", cursor: null }),
		).toBe("/api/transactions?from=2026-10-01&to=2026-10-31&cat=food");
	});

	test("an empty filter on the defaults asks for the bare list", () => {
		expect(listPath({}, DEFAULT_LIST, { currency: "INR", cursor: null })).toBe(
			"/api/transactions",
		);
	});

	test("the cursor comes after the filter and list parameters", () => {
		expect(
			listPath(CHECK_B, DEFAULT_LIST, {
				currency: "INR",
				cursor: "eyJzb3J0Ijo",
			}),
		).toBe(
			"/api/transactions?from=2026-10-01&to=2026-10-31&cat=food&cursor=eyJzb3J0Ijo",
		);
	});

	test("a cursor alone still makes a query", () => {
		expect(listPath({}, DEFAULT_LIST, { currency: "INR", cursor: "abc" })).toBe(
			"/api/transactions?cursor=abc",
		);
	});

	test("a cursor the server never wrote is escaped, never read as more parameters", () => {
		const path = listPath({}, DEFAULT_LIST, {
			currency: "INR",
			cursor: "a&limit=100",
		});
		expect(queryOf(path).getAll("cursor")).toEqual(["a&limit=100"]);
		expect(queryOf(path).has("limit")).toBe(false);
	});

	test("list parameters other than the defaults are sent in BR-F03-33's order", () => {
		expect(
			listPath(
				{},
				{ sort: "amount", dir: "asc", group: "payee" },
				{
					currency: "INR",
					cursor: null,
				},
			),
		).toBe("/api/transactions?sort=amount&dir=asc&group=payee");
	});

	test("the amount sort's own default group is left out", () => {
		expect(
			listPath(
				{},
				{ sort: "amount", dir: "desc", group: "none" },
				{
					currency: "INR",
					cursor: null,
				},
			),
		).toBe("/api/transactions?sort=amount");
	});

	test.each([
		["INR", 50000, "500.00"],
		["JPY", 500, "500"],
		["KWD", 1250, "1.250"],
	] as const)(
		"amounts in %s are written with its decimals",
		(currency, minor, text) => {
			expect(
				queryOf(
					listPath({ minMinor: minor }, DEFAULT_LIST, {
						currency,
						cursor: null,
					}),
				).get("min"),
			).toBe(text);
		},
	);

	test("the search text is escaped and read back unchanged", () => {
		const q = "50% off & more #1";
		expect(
			queryOf(
				listPath({ q }, DEFAULT_LIST, { currency: "INR", cursor: null }),
			).get("q"),
		).toBe(q);
	});
});

describe("summaryPath", () => {
	test("asks for the breakdowns last (D-500)", () => {
		expect(summaryPath(CHECK_B, ["category", "payee"], "INR")).toBe(
			"/api/transactions/summary?from=2026-10-01&to=2026-10-31&cat=food&by=category,payee",
		);
	});

	test("no breakdowns sends no `by`, which the server would refuse empty", () => {
		expect(summaryPath(CHECK_B, [], "INR")).toBe(
			"/api/transactions/summary?from=2026-10-01&to=2026-10-31&cat=food",
		);
	});

	test("a breakdown named twice is sent once, which the server would refuse", () => {
		expect(summaryPath({}, ["payee", "payee"], "INR")).toBe(
			"/api/transactions/summary?by=payee",
		);
	});

	test("an empty filter with breakdowns sends `by` alone", () => {
		expect(summaryPath({}, ["category"], "INR")).toBe(
			"/api/transactions/summary?by=category",
		);
	});
});

describe("facetsPath", () => {
	test("sends the whole filter, amount bounds included", () => {
		expect(facetsPath({ ...CHECK_B, minMinor: 100000 }, "INR")).toBe(
			"/api/transactions/facets?from=2026-10-01&to=2026-10-31&cat=food&min=1000.00",
		);
	});

	test("an empty filter asks for the bare counts", () => {
		expect(facetsPath({}, "INR")).toBe("/api/transactions/facets");
	});
});

describe("histogramPath", () => {
	test("leaves out the amount bounds, which it ignores (BR-F03-60)", () => {
		expect(
			histogramPath({ ...CHECK_B, minMinor: 100000, maxMinor: 200000 }, "INR"),
		).toBe(
			"/api/transactions/amount-histogram?from=2026-10-01&to=2026-10-31&cat=food",
		);
	});

	test("keeps every other filter", () => {
		expect(histogramPath({ src: "subscription", q: "649" }, "INR")).toBe(
			"/api/transactions/amount-histogram?src=subscription&q=649",
		);
	});
});

describe("transactionPath", () => {
	test("names the row", () => {
		expect(transactionPath("0192f0c4-7a1e-7c3b-9d2a-5b8e1f0a1c24")).toBe(
			"/api/transactions/0192f0c4-7a1e-7c3b-9d2a-5b8e1f0a1c24",
		);
	});

	test("an id from a link cannot reach another path", () => {
		expect(transactionPath("../payees")).toBe("/api/transactions/..%2Fpayees");
		expect(transactionPath("a?b#c")).toBe("/api/transactions/a%3Fb%23c");
	});
});

describe("payeesPath", () => {
	test("the list has no query", () => {
		expect(payeesPath()).toBe("/api/payees");
	});

	test("a search sends `q`, escaped", () => {
		expect(payeesPath("swi")).toBe("/api/payees?q=swi");
		expect(queryOf(payeesPath("50% & Sons #2")).get("q")).toBe("50% & Sons #2");
	});

	test("an emoji payee travels whole", () => {
		expect(queryOf(payeesPath("☕ Café")).get("q")).toBe("☕ Café");
	});
});

describe("payeeHistoryPath", () => {
	test("sends the payee and the months", () => {
		expect(payeeHistoryPath("Swiggy", 3)).toBe(
			"/api/payees/history?payee=Swiggy&months=3",
		);
	});

	test.each(["A/B", "What?", "#1 Shop", "100% Pure", "Tom & Jerry", "a+b"])(
		"a payee with %s reads back unchanged (section 13)",
		(payee) => {
			const query = queryOf(payeeHistoryPath(payee, 12));
			expect(query.get("payee")).toBe(payee);
			expect(query.get("months")).toBe("12");
		},
	);
});

describe("views paths", () => {
	test("the list and one view", () => {
		expect(VIEWS_PATH).toBe("/api/transaction-views");
		expect(viewPath("0192f0c4-7a1e-7c3b-9d2a-5b8e1f0a1c02")).toBe(
			"/api/transaction-views/0192f0c4-7a1e-7c3b-9d2a-5b8e1f0a1c02",
		);
	});

	test("an id cannot reach another path", () => {
		expect(viewPath("../x")).toBe("/api/transaction-views/..%2Fx");
	});
});
