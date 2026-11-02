import { describe, expect, test } from "vitest";

import { initials } from "@/lib/initials";

describe("two or more words", () => {
	test.each([
		["Chai Point", "CP"],
		["Amazon Pay India", "AP"],
		["Tata Consultancy Services Limited", "TC"],
		["chai point", "CP"],
		["CHAI POINT", "CP"],
		["Chai  Point", "CP"],
		["  Chai Point  ", "CP"],
		["Chai\tPoint", "CP"],
		["Chai\nPoint", "CP"],
		["A B", "AB"],
	])("%j is %s", (payee, letters) => {
		expect(initials(payee)).toBe(letters);
	});
});

describe("one word", () => {
	test.each([
		["BigBasket", "BI"],
		["Netflix", "NE"],
		["x", "X"],
		["xy", "XY"],
		["7", "7"],
		["42", "42"],
		["IKEA", "IK"],
	])("%j is %s", (payee, letters) => {
		expect(initials(payee)).toBe(letters);
	});
});

describe("only letters, marks and digits count", () => {
	test.each([
		["7-Eleven", "7E"],
		["  McDonald's  ", "MC"],
		["- Chai", "CH"],
		["Chai - Point", "CP"],
		["(Chai) [Point]", "CP"],
		["Chai & Co.", "CC"],
		["Chai.Point", "CH"],
		["@chai", "CH"],
		["Chai, Point", "CP"],
		["***Chai***", "CH"],
		["_Chai", "CH"],
		["$$ Chai", "CH"],
	])("%j is %s", (payee, letters) => {
		expect(initials(payee)).toBe(letters);
	});

	test.each(["", " ", "   ", "--", "...", "!!! ???", "😀", "😀 🎉", "\t\n"])(
		"%j has no initials",
		(payee) => {
			expect(initials(payee)).toBe("");
		},
	);

	test("an emoji beside a word is skipped", () => {
		expect(initials("😀 Lunch")).toBe("LU");
		expect(initials("Lunch 😀")).toBe("LU");
		expect(initials("Lunch 😀 Break")).toBe("LB");
	});
});

describe("other scripts", () => {
	test("keeps accented letters whole and capitalizes them", () => {
		expect(initials("café du monde")).toBe("CD");
		expect(initials("éa")).toBe("ÉA");
		expect(initials("Zoë Ångström")).toBe("ZÅ");
	});

	test("keeps a letter and its combining mark together", () => {
		expect(initials("école")).toBe("ÉC");
		expect(initials("राम")).toBe("राम");
		expect(initials("राम कुमार")).toBe("राकु");
	});

	test("takes Chinese and Japanese characters one at a time", () => {
		expect(initials("山田 太郎")).toBe("山太");
		expect(initials("山田")).toBe("山田");
	});

	test("takes Cyrillic and Greek", () => {
		expect(initials("Иван Петров")).toBe("ИП");
		expect(initials("Αθήνα Πόλη")).toBe("ΑΠ");
	});

	test("takes digits of other scripts", () => {
		expect(initials("١٢٣")).toBe("١٢");
	});

	test("capitalizes a letter that becomes two (ß)", () => {
		expect(initials("ßa")).toBe("SSA");
	});
});

describe("never throws", () => {
	test("handles a very long payee", () => {
		expect(initials("a".repeat(10_000))).toBe("AA");
		expect(initials("word ".repeat(2_000))).toBe("WW");
	});

	test("handles a lone surrogate", () => {
		expect(() => initials("\ud83d")).not.toThrow();
	});
});
