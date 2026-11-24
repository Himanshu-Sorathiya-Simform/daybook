import { describe, expect, test } from "vitest";

import { duplicateSearchText, sameNameExpenses } from "../duplicates";
import { charge } from "./fixtures";

describe("duplicateSearchText (BR-F05-48, BR-F03-34, BR-F03-35)", () => {
	// AC-F05-33
	test.each(["Netflix", "Cult Gym", "abc", "Room 101", "1e5", "a-1"])(
		"%j is read as it is",
		(name) => {
			expect(duplicateSearchText(name, "INR")).toBe(name);
		},
	);

	test("the name is trimmed", () => {
		expect(duplicateSearchText("  Netflix \t", "INR")).toBe("Netflix");
	});

	test("the name is in NFC, as it is stored", () => {
		// "e" and a combining acute accent become the one character é.
		expect(duplicateSearchText("Café", "INR")).toBe("Café");
	});

	// AC-F05-33: "TV" reads no duplicates and shows no note.
	test.each(["TV", "AC", "ab", "a", "é"])(
		"%j is under 3 characters, so no note",
		(name) => {
			expect(duplicateSearchText(name, "INR")).toBeNull();
		},
	);

	test("3 characters is enough", () => {
		expect(duplicateSearchText("TVs", "INR")).toBe("TVs");
	});

	test("length counts code points, not UTF-16 units", () => {
		// Two emoji are four UTF-16 units but two characters; three are enough.
		expect(duplicateSearchText("😀😀", "INR")).toBeNull();
		expect(duplicateSearchText("😀😀😀", "INR")).toBe("😀😀😀");
		expect(duplicateSearchText("日本", "INR")).toBeNull();
		expect(duplicateSearchText("日本語", "INR")).toBe("日本語");
	});

	// AC-F05-33: "99" reads no duplicates and shows no note.
	test.each(["99", "100", "1,000", "12.50", "1,00,000", "649"])(
		"%j is a number, so it is no text search",
		(name) => {
			expect(duplicateSearchText(name, "INR")).toBeNull();
		},
	);

	test("what is a number follows the currency's decimals", () => {
		// Yen has no decimals, so "12.5" is text; rupees have two, so it is a number.
		expect(duplicateSearchText("12.5", "INR")).toBeNull();
		expect(duplicateSearchText("12.5", "JPY")).toBe("12.5");
		// Dinars have three.
		expect(duplicateSearchText("1.234", "KWD")).toBeNull();
		expect(duplicateSearchText("1.234", "INR")).toBe("1.234");
	});

	test.each(["", "   ", "\t\n"])("%j is empty, so no note", (name) => {
		expect(duplicateSearchText(name, "INR")).toBeNull();
	});

	test("a name of invisible characters only is empty", () => {
		expect(duplicateSearchText("​​​", "INR")).toBeNull();
	});

	test.each(["ab\u0001c", "net\nflix", "bad\u0000"])(
		"%j holds a control character, which F03 refuses",
		(name) => {
			expect(duplicateSearchText(name, "INR")).toBeNull();
		},
	);

	test("a lone surrogate is refused", () => {
		expect(duplicateSearchText("Net\ud800flix", "INR")).toBeNull();
	});
});

describe("sameNameExpenses (BR-F05-04)", () => {
	const netflix = (changes: Parameters<typeof charge>[0] = {}) =>
		charge({
			source: "manual",
			subscriptionId: null,
			subscription: null,
			dueOn: null,
			...changes,
		});

	test("keeps the expenses whose payee is the name", () => {
		const a = netflix({ occurredOn: "2026-09-05" });
		const b = netflix({ occurredOn: "2026-10-05" });
		expect(sameNameExpenses([a, b], "Netflix")).toEqual([a, b]);
	});

	// AC-F05-33: a "Netflix Premium" expense is not a duplicate of "Netflix".
	test("leaves out a payee that only holds the name", () => {
		const rows = [
			netflix({ payee: "Netflix Premium" }),
			netflix({ payee: "Netflix India" }),
			netflix({ payee: "My Netflix" }),
			netflix({ payee: "Netflix." }),
			netflix({ payee: "Netflix " }),
		];
		expect(sameNameExpenses(rows, "Netflix")).toEqual([]);
	});

	test("ignores case", () => {
		const row = netflix({ payee: "NETFLIX" });
		expect(sameNameExpenses([row], "netflix")).toEqual([row]);
		expect(
			sameNameExpenses([netflix({ payee: "netflix" })], "NetFlix"),
		).toHaveLength(1);
	});

	test("folds case as Postgres does (D-497): a capital dotted I is an i", () => {
		const row = netflix({ payee: "Istanbul Kebab" });
		expect(sameNameExpenses([row], "İstanbul Kebab")).toEqual([row]);
	});

	test("a payee with another letter is no match", () => {
		expect(sameNameExpenses([netflix({ payee: "Netfl1x" })], "Netflix")).toEqual(
			[],
		);
	});

	test("leaves out refunds and income, which are no past charge", () => {
		const rows = [
			netflix({ type: "refund" }),
			netflix({ type: "income" }),
			netflix({ type: "goal_contribution", payee: null }),
		];
		expect(sameNameExpenses(rows, "Netflix")).toEqual([]);
	});

	test("leaves out a row with no payee", () => {
		expect(sameNameExpenses([netflix({ payee: null })], "Netflix")).toEqual([]);
	});

	test("counts a charge of another Subscription with the same payee as well", () => {
		const row = charge({ payee: "Netflix" });
		expect(sameNameExpenses([row], "Netflix")).toEqual([row]);
	});

	test("keeps the order it was given", () => {
		const newer = netflix({ occurredOn: "2026-10-05" });
		const older = netflix({ occurredOn: "2026-09-05" });
		expect(sameNameExpenses([newer, older], "Netflix")).toEqual([newer, older]);
	});

	test("an empty list has none", () => {
		expect(sameNameExpenses([], "Netflix")).toEqual([]);
	});
});
