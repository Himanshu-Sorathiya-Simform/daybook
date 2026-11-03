import { describe, expect, test } from "vitest";
import { compareCodeUnits } from "../compare";

describe("compareCodeUnits", () => {
	test("is negative, zero or positive as the first string comes before, equals or follows the second", () => {
		expect(compareCodeUnits("a", "b")).toBe(-1);
		expect(compareCodeUnits("b", "a")).toBe(1);
		expect(compareCodeUnits("a", "a")).toBe(0);
	});

	test("compares the empty string as the smallest", () => {
		expect(compareCodeUnits("", "")).toBe(0);
		expect(compareCodeUnits("", "a")).toBe(-1);
		expect(compareCodeUnits("a", "")).toBe(1);
	});

	test("puts a prefix before the longer string", () => {
		expect(compareCodeUnits("FLAG_A", "FLAG_AB")).toBe(-1);
		expect(compareCodeUnits("FLAG_AB", "FLAG_A")).toBe(1);
	});

	test("puts capitals before lowercase letters", () => {
		expect(compareCodeUnits("Zebra", "apple")).toBe(-1);
		expect(compareCodeUnits("Australia/NSW", "Australia/North")).toBe(-1);
	});

	test("puts _ after capitals and - before digits and letters", () => {
		expect(compareCodeUnits("FLAG_AB", "FLAG_A_B")).toBe(-1);
		expect(
			compareCodeUnits("America/Port-au-Prince", "America/Port_of_Spain"),
		).toBe(-1);
	});

	test("compares by code unit, not by code point", () => {
		// U+FF5E is one code unit above the surrogate range; U+1F600 is the pair D83D DE00.
		expect(compareCodeUnits("\u{1F600}", "～")).toBe(-1);
		expect("\u{1F600}".codePointAt(0)! > "～".codePointAt(0)!).toBe(true);
	});

	test("does not fold case or accents", () => {
		expect(compareCodeUnits("a", "A")).toBe(1);
		expect(compareCodeUnits("e", "é")).toBe(-1);
		expect(compareCodeUnits("é", "f")).toBe(1);
	});

	test("sorts exactly as a bare sort() does", () => {
		const names = [
			"b",
			"B",
			"a_b",
			"a-b",
			"aB",
			"ab",
			"",
			"\u{1F600}",
			"～",
			"é",
			"10",
			"9",
		];
		expect([...names].sort(compareCodeUnits)).toEqual([...names].sort());
	});

	test("is stable for equal strings and gives the same order for any input order", () => {
		const names = ["US", "DE", "AU", "BR", "DE"];
		const forward = [...names].sort(compareCodeUnits);
		const backward = [...names].reverse().sort(compareCodeUnits);
		expect(forward).toEqual(["AU", "BR", "DE", "DE", "US"]);
		expect(backward).toEqual(forward);
	});

	test("differs from the locale order where identifiers mix case and punctuation", () => {
		const names = ["FLAG_A_B", "FLAG_AB"];
		expect([...names].sort(compareCodeUnits)).toEqual(["FLAG_AB", "FLAG_A_B"]);
		expect([...names].sort((a, b) => a.localeCompare(b, "en"))).toEqual([
			"FLAG_A_B",
			"FLAG_AB",
		]);
	});
});
