import { hashKey } from "@tanstack/react-query";
import { describe, expect, test } from "vitest";

import { isUnder, QUERY_ROOTS } from "@/lib/api/query-keys";
import {
	readFilterParams,
	type ListParams,
	type TransactionFilter,
} from "@/lib/transactions/url";
import { payeeKeys, transactionKeys, viewKeys, withoutAmounts } from "../keys";

const DEFAULT_LIST: ListParams = { sort: "date", dir: "desc", group: "day" };
const OCTOBER: TransactionFilter = { from: "2026-10-01", to: "2026-10-31" };

/** The key the page builds for a URL: through the same reader as the API (BR-F03-33). */
function listKeyOf(query: string) {
	const { filter, list } = readFilterParams(new URLSearchParams(query), {
		currency: "INR",
	});
	return hashKey(transactionKeys.list(filter, list));
}

describe("withoutAmounts", () => {
	test("drops both amount bounds and keeps every other field", () => {
		const filter: TransactionFilter = {
			...OCTOBER,
			type: ["expense"],
			cat: ["food"],
			src: "manual",
			minMinor: 100,
			maxMinor: 500,
			q: "swiggy",
		};
		expect(withoutAmounts(filter)).toEqual({
			...OCTOBER,
			type: ["expense"],
			cat: ["food"],
			src: "manual",
			q: "swiggy",
		});
	});

	test("drops a bound given alone", () => {
		expect(withoutAmounts({ minMinor: 100 })).toEqual({});
		expect(withoutAmounts({ maxMinor: 100 })).toEqual({});
	});

	test("never changes the filter it was given", () => {
		const filter: TransactionFilter = { minMinor: 100, maxMinor: 500 };
		withoutAmounts(filter);
		expect(filter).toEqual({ minMinor: 100, maxMinor: 500 });
	});

	test("an empty filter stays empty", () => {
		expect(withoutAmounts({})).toEqual({});
	});
});

describe("transactionKeys (STATE-5)", () => {
	test("every key starts with the transactions root", () => {
		const keys = [
			transactionKeys.all,
			transactionKeys.list(OCTOBER, DEFAULT_LIST),
			transactionKeys.summary(OCTOBER, []),
			transactionKeys.facets(OCTOBER),
			transactionKeys.histogram(OCTOBER),
			transactionKeys.detail("0192f0c4-7a1e-7c3b-9d2a-5b8e1f0a1c24"),
		];
		for (const key of keys) {
			expect(key[0]).toBe(QUERY_ROOTS.transactions);
			expect(isUnder(key, "transactions")).toBe(true);
		}
	});

	test("the list key holds the kind, the filter and the list parameters", () => {
		expect(transactionKeys.list(OCTOBER, DEFAULT_LIST)).toEqual([
			"transactions",
			"list",
			OCTOBER,
			DEFAULT_LIST,
		]);
	});

	// AC-F03-15
	test("equivalent URLs share one list key", () => {
		expect(listKeyOf("cat=food,food&dir=desc&sort=date")).toBe(
			listKeyOf("cat=food"),
		);
		expect(listKeyOf("cat=shopping,food")).toBe(listKeyOf("cat=food,shopping"));
		expect(listKeyOf("group=day")).toBe(listKeyOf(""));
		expect(listKeyOf("sort=amount&group=none")).toBe(listKeyOf("sort=amount"));
		expect(listKeyOf("q=%20Swiggy%20")).toBe(listKeyOf("q=Swiggy"));
	});

	test("interface parameters and unknown names never change the list key (D-454)", () => {
		const plain = listKeyOf("cat=food");
		expect(listKeyOf("cat=food&view=0192f0c4-7a1e-7c3b-9d2a-5b8e1f0a1c02")).toBe(
			plain,
		);
		expect(listKeyOf("cat=food&txn=abc")).toBe(plain);
		expect(listKeyOf("cat=food&new=1")).toBe(plain);
		expect(listKeyOf("cat=food&utm_source=mail")).toBe(plain);
	});

	test("filters and list parameters that select or order differently get other keys", () => {
		const base = listKeyOf("");
		expect(listKeyOf("cat=food")).not.toBe(base);
		expect(listKeyOf("sort=amount")).not.toBe(base);
		expect(listKeyOf("dir=asc")).not.toBe(base);
		expect(listKeyOf("group=payee")).not.toBe(base);
		expect(listKeyOf("q=swiggy")).not.toBe(listKeyOf("q=Swiggy"));
	});

	test("the summary key ignores list parameters, and the order and repeats of `by`", () => {
		expect(transactionKeys.summary(OCTOBER, ["payee", "category"])).toEqual(
			transactionKeys.summary(OCTOBER, ["category", "payee", "payee"]),
		);
		expect(transactionKeys.summary(OCTOBER, ["category", "payee"])).toEqual([
			"transactions",
			"summary",
			OCTOBER,
			["category", "payee"],
		]);
	});

	test("a summary with breakdowns is not the summary without them", () => {
		expect(hashKey(transactionKeys.summary(OCTOBER, []))).not.toBe(
			hashKey(transactionKeys.summary(OCTOBER, ["category"])),
		);
	});

	test("the summary, counts and histogram keys never hold list parameters", () => {
		for (const key of [
			transactionKeys.summary(OCTOBER, []),
			transactionKeys.facets(OCTOBER),
			transactionKeys.histogram(OCTOBER),
		]) {
			expect(JSON.stringify(key)).not.toMatch(/sort|dir|group/);
		}
	});

	test("the histogram key is the same whatever the amount bounds (BR-F03-60)", () => {
		expect(transactionKeys.histogram({ ...OCTOBER, minMinor: 100000 })).toEqual(
			transactionKeys.histogram(OCTOBER),
		);
		expect(
			transactionKeys.histogram({ ...OCTOBER, minMinor: 1, maxMinor: 2 }),
		).toEqual(["transactions", "histogram", OCTOBER]);
	});

	test("the histogram key still follows every other filter", () => {
		expect(hashKey(transactionKeys.histogram({ cat: ["food"] }))).not.toBe(
			hashKey(transactionKeys.histogram({})),
		);
	});

	test("the counts key follows the amount bounds, which the counts apply", () => {
		expect(hashKey(transactionKeys.facets({ minMinor: 100 }))).not.toBe(
			hashKey(transactionKeys.facets({})),
		);
	});

	test("the detail key is the id in lowercase, as the API reads it", () => {
		expect(
			transactionKeys.detail("0192F0C4-7A1E-7C3B-9D2A-5B8E1F0A1C24"),
		).toEqual([
			"transactions",
			"detail",
			"0192f0c4-7a1e-7c3b-9d2a-5b8e1f0a1c24",
		]);
	});

	test("the kinds of read never collide", () => {
		const hashes = [
			transactionKeys.list({}, DEFAULT_LIST),
			transactionKeys.summary({}, []),
			transactionKeys.facets({}),
			transactionKeys.histogram({}),
		].map(hashKey);
		expect(new Set(hashes).size).toBe(hashes.length);
	});
});

describe("payeeKeys", () => {
	test("every key starts with the payees root", () => {
		for (const key of [
			payeeKeys.all,
			payeeKeys.list(),
			payeeKeys.search("swi"),
			payeeKeys.history("Swiggy", 3),
		]) {
			expect(key[0]).toBe(QUERY_ROOTS.payees);
		}
	});

	test("a search is keyed by its text lowered, as the server matches it", () => {
		expect(payeeKeys.search("SWI")).toEqual(payeeKeys.search("swi"));
		expect(payeeKeys.search("swi")).toEqual(["payees", "search", "swi"]);
	});

	test("lowering follows Postgres, so İ is i (D-497)", () => {
		expect(payeeKeys.search("İstanbul")).toEqual([
			"payees",
			"search",
			"istanbul",
		]);
	});

	// AC-F03-43
	test("Swiggy and swiggy share one history key", () => {
		expect(payeeKeys.history("Swiggy", 3)).toEqual(
			payeeKeys.history("swiggy", 3),
		);
	});

	test("the history key holds its months", () => {
		expect(payeeKeys.history("Swiggy", 3)).toEqual([
			"payees",
			"history",
			"swiggy",
			3,
		]);
		expect(hashKey(payeeKeys.history("Swiggy", 1))).not.toBe(
			hashKey(payeeKeys.history("Swiggy", 3)),
		);
	});

	test("the list, a search and a history never collide", () => {
		const hashes = [
			payeeKeys.list(),
			payeeKeys.search("list"),
			payeeKeys.history("list", 3),
		].map(hashKey);
		expect(new Set(hashes).size).toBe(3);
	});
});

describe("viewKeys", () => {
	test("the list is under the saved views root, apart from Transactions", () => {
		expect(viewKeys.list()).toEqual(["transactionViews", "list"]);
		expect(isUnder(viewKeys.list(), "transactions")).toBe(false);
	});
});
