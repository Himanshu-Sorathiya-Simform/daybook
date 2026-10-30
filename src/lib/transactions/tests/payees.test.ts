import { describe, expect, test } from "vitest";

import {
	PAYEE_WINDOW_DAYS,
	payeeMatches,
	payeeWindowStart,
} from "@/lib/transactions/payees";

describe("payeeMatches (BR-F03-45, BR-F03-61, D-481)", () => {
	// AC-F03-44
	test.each([
		["Sunrise Apartments", "apart", true, "a later word starts with it"],
		["Indian Oil", "o", true, "the second word starts with it"],
		["Sunrise Apartments", "rise", false, "it sits inside a word"],
		["Sunrise Apartments", "sun", true, "the payee starts with it"],
		[
			"Sunrise Apartments",
			"SUNRISE APART",
			true,
			"it spans words from the start",
		],
		["Swiggy", "SWIG", true, "case does not count"],
		["CAFÉ Ümit", "ümit", true, "letters outside ASCII lower too"],
		["% Club", "%", true, "% is a plain character"],
		["50% Off", "%", false, "% inside a word starts no word"],
		["a_b", "a_", true, "_ is a plain character"],
		["axb", "a_", false, "_ is not a wildcard"],
		["Big  Basket", "basket", true, "any space starts a word"],
		["Big-Basket", "basket", false, "a hyphen does not start a word"],
		["Zeta", "zetas", false, "a longer query never matches"],
		// B9, D-497: Postgres's `lower()`, not JavaScript's, so both sides agree.
		["İstanbul Kebab", "ist", true, "İ lowers to a plain i"],
		["Big İstanbul", "ist", true, "İ lowers to a plain i in a later word"],
		["ΟΔΟΣ", "οδοσ", true, "a capital sigma lowers to σ at the end of a word"],
		["οδος", "οδοσ", false, "the final sigma ς is another letter"],
	])("%j and %j: %s, %s", (payee, q, expected) => {
		expect(payeeMatches(payee, q)).toBe(expected);
	});
});

describe("payeeWindowStart (BR-F03-44, D-481)", () => {
	test("is 364 days before today, so the window holds 365 days", () => {
		expect(PAYEE_WINDOW_DAYS).toBe(365);
		// golden: 2 November 2026 gives a window from 3 November 2025.
		expect(payeeWindowStart("2026-11-02")).toBe("2025-11-03");
	});

	test("counts a leap day as a day", () => {
		expect(payeeWindowStart("2028-03-01")).toBe("2027-03-03");
	});
});
