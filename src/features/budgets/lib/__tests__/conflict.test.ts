import { describe, expect, test } from "vitest";

import { goldenBudget } from "@/lib/budgets/__tests__/golden";
import type { BudgetRules } from "@/lib/budgets/model";
import { CONFLICT_TEXT, conflictRows, keepMineLine } from "../conflict";
import type { Formats } from "../labels";

// AC-F04-30's figures: golden food's schedule is 6,000.00 from September and 5,000.00 from
// October; the user's change adds 7,000.00 from December, the saved Budget 5,500.00 from
// November.

const IN: Formats = {
	currency: "INR",
	numberLocale: "hi-IN-u-nu-latn",
	dateLocale: "en-IN",
};
const DE: Formats = { currency: "EUR", numberLocale: "de-DE", dateLocale: "de-DE" };

const FOOD = goldenBudget("food");
const rules = (
	schedule: BudgetRules["schedule"],
	overrides: BudgetRules["overrides"] = [],
): BudgetRules => ({ schedule, overrides });

const MINE = rules([...FOOD.schedule, { from: "2026-12", limitMinor: 700000 }]);
const THEIRS = rules([...FOOD.schedule, { from: "2026-11", limitMinor: 550000 }]);

describe("conflictRows (BR-F04-23)", () => {
	// AC-F04-30
	test("a row per month either version holds an item in, newest first", () => {
		const result = conflictRows(MINE, THEIRS, IN);
		expect(result.map((row) => row.month)).toEqual([
			"2026-12",
			"2026-11",
			"2026-10",
			"2026-09",
		]);
		expect(result.map((row) => row.label)).toEqual([
			"Dec 2026",
			"Nov 2026",
			"Oct 2026",
			"Sept 2026",
		]);
	});

	// AC-F04-30
	test("December and November differ: the item against None", () => {
		const [december, november] = conflictRows(MINE, THEIRS, IN);
		expect(december).toMatchObject({
			mine: ["₹7,000.00 from Dec 2026"],
			theirs: ["None"],
			differs: true,
		});
		expect(november).toMatchObject({
			mine: ["None"],
			theirs: ["₹5,500.00 from Nov 2026"],
			differs: true,
		});
	});

	test("months both versions hold alike are not marked", () => {
		const [, , october, september] = conflictRows(MINE, THEIRS, IN);
		expect(october).toMatchObject({
			mine: ["₹5,000.00 from Oct 2026"],
			theirs: ["₹5,000.00 from Oct 2026"],
			differs: false,
		});
		expect(september).toMatchObject({
			mine: ["₹6,000.00 from Sept 2026"],
			differs: false,
		});
	});

	test("identical versions have no marked row", () => {
		expect(conflictRows(FOOD, FOOD, IN).some((row) => row.differs)).toBe(false);
	});

	test("a stop reads Stopped from, a month's own limit reads in … only", () => {
		const mine = rules(
			[
				{ from: "2026-09", limitMinor: 600000 },
				{ from: "2026-11", limitMinor: null },
			],
			[{ month: "2026-10", limitMinor: 800000 }],
		);
		const theirs = rules(
			[{ from: "2026-09", limitMinor: 600000 }],
			[{ month: "2026-10", limitMinor: null }],
		);
		const [november, october] = conflictRows(mine, theirs, IN);
		expect(november).toMatchObject({
			mine: ["Stopped from Nov 2026"],
			theirs: ["None"],
			differs: true,
		});
		expect(october).toMatchObject({
			mine: ["₹8,000.00 in Oct 2026 only"],
			theirs: ["No limit in Oct 2026 only"],
			differs: true,
		});
	});

	test("a month holding both kinds has one line each, the one-month limit first", () => {
		const both = rules(
			[
				{ from: "2026-09", limitMinor: 600000 },
				{ from: "2026-10", limitMinor: 500000 },
			],
			[{ month: "2026-10", limitMinor: 800000 }],
		);
		const [october] = conflictRows(both, FOOD, IN);
		expect(october).toMatchObject({
			mine: ["₹8,000.00 in Oct 2026 only", "₹5,000.00 from Oct 2026"],
			theirs: ["₹5,000.00 from Oct 2026"],
			differs: true,
		});
	});

	test("a month only in one version's one-month limits has its own row", () => {
		const mine = rules(FOOD.schedule, [
			{ month: "2026-12", limitMinor: 700000 },
		]);
		const result = conflictRows(mine, FOOD, IN);
		expect(result[0]).toMatchObject({
			month: "2026-12",
			mine: ["₹7,000.00 in Dec 2026 only"],
			theirs: ["None"],
			differs: true,
		});
	});

	test("the same month's rows join their two sides once", () => {
		const result = conflictRows(MINE, MINE, IN);
		expect(new Set(result.map((row) => row.month)).size).toBe(result.length);
	});

	test("words months and figures in the profile's language", () => {
		const [december] = conflictRows(MINE, THEIRS, DE);
		expect(december?.label).toBe("Dez. 2026");
		expect(december?.mine[0]?.replaceAll(" ", " ")).toBe(
			"7.000,00 € from Dez. 2026",
		);
	});
});

describe("keepMineLine (BR-F04-23)", () => {
	test.each([
		[
			{ kind: "limit", scope: "onward", month: "2026-12", limitMinor: 700000 },
			"Keep mine applies your change, ₹7,000.00 from December 2026, to the saved Budget.",
		],
		[
			{ kind: "limit", scope: "month", month: "2026-10", limitMinor: 800000 },
			"Keep mine applies your change, ₹8,000.00 for October 2026 only, to the saved Budget.",
		],
		[
			{ kind: "limit", scope: "onward", month: "2026-11", limitMinor: null },
			"Keep mine applies your change, the stop from November 2026, to the saved Budget.",
		],
		[
			{ kind: "limit", scope: "month", month: "2026-10", limitMinor: null },
			"Keep mine applies your change, no limit for October 2026 only, to the saved Budget.",
		],
		[
			{ kind: "removal", month: "2026-10" },
			"Keep mine applies your change, the removal of the one-month limit for October 2026, to the saved Budget.",
		],
	] as const)("%j", (change, line) => {
		expect(keepMineLine(change, IN)).toBe(line);
	});

	test("names a year even in the current one", () => {
		expect(
			keepMineLine(
				{
					kind: "limit",
					scope: "onward",
					month: "2026-11",
					limitMinor: 100,
				},
				IN,
			),
		).toContain("November 2026");
	});
});

describe("CONFLICT_TEXT", () => {
	test("holds BR-F04-23's words", () => {
		expect(CONFLICT_TEXT.title).toBe("This Budget changed on another device");
		expect(CONFLICT_TEXT.intro).toBe(
			"Your version and the saved one are side by side, with the differences marked.",
		);
		expect(CONFLICT_TEXT.undoLine).toBe(
			"Keep mine puts the Budget back as it was before your change.",
		);
		expect([
			CONFLICT_TEXT.mine,
			CONFLICT_TEXT.theirs,
			CONFLICT_TEXT.differs,
		]).toEqual(["Yours", "Saved now", "Differs"]);
		expect([CONFLICT_TEXT.deleteAnyway, CONFLICT_TEXT.keepIt]).toEqual([
			"Delete anyway",
			"Keep it",
		]);
	});
});
