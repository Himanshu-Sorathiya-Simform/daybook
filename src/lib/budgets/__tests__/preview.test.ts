import { describe, expect, test, vi } from "vitest";

import { type BudgetRules, setMonth } from "../model";
import type { Month } from "../months";
import { type BudgetChange, type BudgetPreview, previewChange } from "../preview";
import { goldenBudget, goldenSpending } from "./golden";

// Expected figures are copied from F04 section 5 and docs/03-golden-dataset.md#budgets. The
// golden current month is November 2026.

const CURRENT = "2026-11";

const rulesOf = (category: Parameters<typeof goldenBudget>[0]): BudgetRules => {
	const { schedule, overrides } = goldenBudget(category);
	return { schedule, overrides };
};

/** The golden category spending of one category, month by month. */
const spendingOf =
	(category: Parameters<typeof goldenBudget>[0]) =>
	(month: Month): number =>
		goldenSpending(month)[category] ?? 0;

function preview(
	category: Parameters<typeof goldenBudget>[0],
	change: BudgetChange,
	rules: BudgetRules | null = rulesOf(category),
) {
	return previewChange({
		rules,
		change,
		spending: spendingOf(category),
		current: CURRENT,
	});
}

/** The preview, failing the test when it is blocked. */
function open(result: BudgetPreview) {
	if (result.blocked) throw new Error("The preview is blocked.");
	return result;
}

const months = (result: BudgetPreview) =>
	open(result).months.map((each) => [
		each.month,
		each.oldLimitMinor,
		each.newLimitMinor,
		each.spentMinor,
		each.oldTenths,
		each.newTenths,
		each.changed,
	]);

describe("a retroactive change: food at 7,000.00 from September (F04 section 5)", () => {
	const result = open(
		preview("food", { scope: "from", month: "2026-09", limitMinor: 700000 }),
	);

	// AC-F04-22
	test("lists September to November with old and new limits and utilization", () => {
		expect(months(result)).toEqual([
			["2026-09", 600000, 700000, 505000, 842, 721, true],
			["2026-10", 500000, 700000, 622000, 1244, 889, true],
			["2026-11", 500000, 700000, 42000, 84, 60, true],
		]);
	});

	// AC-F04-22
	test("notes the past months it changes and the entry it replaces", () => {
		expect(result.notes).toEqual([
			{ kind: "retroactive", months: ["2026-09", "2026-10"] },
			{ kind: "replaces", entries: [{ from: "2026-10", limitMinor: 500000 }] },
		]);
		expect(result.replaced).toEqual([{ from: "2026-10", limitMinor: 500000 }]);
		expect(result.keptOverrides).toEqual([]);
	});

	test("carries 7,000.00 on from December, and is a change", () => {
		expect(result.tail).toEqual({ month: "2026-12", limitMinor: 700000 });
		expect(result.next.schedule).toEqual([
			{ from: "2026-09", limitMinor: 700000 },
		]);
		expect(result.unchanged).toBe(false);
	});

	test("groups nothing, since every month spends differently", () => {
		expect(
			result.groups.map((group) => [group.first, group.last, group.count]),
		).toEqual([
			["2026-09", "2026-09", 1],
			["2026-10", "2026-10", 1],
			["2026-11", "2026-11", 1],
		]);
	});
});

describe("a long change: shopping at 4,000.00 from November 2023 (F04 section 5)", () => {
	const result = open(
		preview("shopping", { scope: "from", month: "2023-11", limitMinor: 400000 }),
	);

	// AC-F04-22
	test("covers 37 months, November 2023 to November 2026", () => {
		expect(result.months).toHaveLength(37);
		expect(result.months[0]?.month).toBe("2023-11");
		expect(result.months[36]?.month).toBe("2026-11");
	});

	// AC-F04-22
	test("groups them as 34 months, then September, October and November 2026", () => {
		expect(
			result.groups.map((group) => [
				group.first,
				group.last,
				group.count,
				group.oldLimitMinor,
				group.newLimitMinor,
				group.spentMinor,
				group.oldTenths,
				group.newTenths,
			]),
		).toEqual([
			["2023-11", "2026-08", 34, null, 400000, 0, null, 0],
			["2026-09", "2026-09", 1, 300000, 400000, 240000, 800, 600],
			["2026-10", "2026-10", 1, 300000, 400000, 300000, 1000, 750],
			["2026-11", "2026-11", 1, 300000, 400000, 0, 0, 0],
		]);
	});

	// AC-F04-22
	test("notes the past months, the 34 months gained, and the September entry replaced", () => {
		const retroactive = result.notes.find((note) => note.kind === "retroactive");
		expect(result.notes.map((note) => note.kind)).toEqual([
			"retroactive",
			"gains",
			"replaces",
		]);
		expect(retroactive).toMatchObject({ kind: "retroactive" });
		const past = retroactive?.kind === "retroactive" ? retroactive.months : [];
		expect(past).toHaveLength(36);
		expect([past[0], past[35]]).toEqual(["2023-11", "2026-10"]);
		expect(result.notes[1]).toEqual({ kind: "gains", count: 34 });
		expect(result.notes[2]).toEqual({
			kind: "replaces",
			entries: [{ from: "2026-09", limitMinor: 300000 }],
		});
	});

	test("carries 4,000.00 on from December 2026", () => {
		expect(result.tail).toEqual({ month: "2026-12", limitMinor: 400000 });
	});
});

describe("stopping from a month onward (BR-F04-21, BR-F04-27)", () => {
	// F04 section 5, Stopping.
	test("entertainment from November lists November alone and keeps earlier months", () => {
		const result = open(
			preview("entertainment", {
				scope: "from",
				month: "2026-11",
				limitMinor: null,
			}),
		);
		expect(months(result)).toEqual([
			["2026-11", 100000, null, 0, 0, null, true],
		]);
		expect(result.notes).toEqual([
			{ kind: "stopKeepsEarlier", movesToUnbudgeted: false },
		]);
		expect(result.tail).toEqual({ month: "2026-12", limitMinor: null });
	});

	test("a stop in a month with spending says the spending moves to Not budgeted", () => {
		const result = open(
			preview("food", { scope: "from", month: "2026-11", limitMinor: null }),
		);
		expect(result.notes[0]).toEqual({
			kind: "stopKeepsEarlier",
			movesToUnbudgeted: true,
		});
	});

	test("a retroactive stop notes the past months and the replaced entry, and gains nothing", () => {
		const result = open(
			preview("food", { scope: "from", month: "2026-10", limitMinor: null }),
		);
		expect(result.notes).toEqual([
			{ kind: "stopKeepsEarlier", movesToUnbudgeted: true },
			{ kind: "retroactive", months: ["2026-10"] },
		]);
		expect(result.next.schedule).toEqual([
			{ from: "2026-09", limitMinor: 600000 },
			{ from: "2026-10", limitMinor: null },
		]);
	});

	test("a stop in a month whose refunds exceed its expenses still moves it to Not budgeted", () => {
		const result = previewChange({
			rules: rulesOf("food"),
			change: { scope: "from", month: "2026-11", limitMinor: null },
			spending: () => -30000,
			current: CURRENT,
		});
		expect(open(result).notes[0]).toEqual({
			kind: "stopKeepsEarlier",
			movesToUnbudgeted: true,
		});
	});

	// AC-F04-04's refusal, before anything is sent.
	test.each(["2026-09", "2026-08", "2023-11"])(
		"is blocked from %s, at or before entertainment's first entry",
		(month) => {
			expect(
				preview("entertainment", { scope: "from", month, limitMinor: null }),
			).toEqual({
				blocked: true,
			});
		},
	);

	test("is blocked for a category with no Budget record", () => {
		expect(
			preview(
				"health",
				{ scope: "from", month: "2026-11", limitMinor: null },
				null,
			),
		).toEqual({ blocked: true });
	});
});

describe("one month only (BR-F04-24, BR-F04-26)", () => {
	// F04 flow 7.3
	test("food at 8,000.00 for October lists September, October and November", () => {
		const result = open(
			preview("food", {
				scope: "month",
				month: "2026-10",
				limitMinor: 800000,
			}),
		);
		expect(months(result)).toEqual([
			["2026-09", 600000, 600000, 505000, 842, 842, false],
			["2026-10", 500000, 800000, 622000, 1244, 778, true],
			["2026-11", 500000, 500000, 42000, 84, 84, false],
		]);
		expect(result.notes).toEqual([{ kind: "oneMonth", month: "2026-10" }]);
		expect(result.tail).toBeNull();
		expect(result.replaced).toEqual([]);
		expect(result.keptOverrides).toEqual([]);
		expect(result.next.overrides).toEqual([
			{ month: "2026-10", limitMinor: 800000 },
		]);
	});

	test("stopping entertainment for October only notes one month and gains nothing", () => {
		const result = open(
			preview("entertainment", {
				scope: "month",
				month: "2026-10",
				limitMinor: null,
			}),
		);
		expect(result.months.map((each) => each.newLimitMinor)).toEqual([
			100000,
			null,
			100000,
		]);
		expect(result.notes).toEqual([{ kind: "oneMonth", month: "2026-10" }]);
	});

	test("a one-month limit before a Budget starts notes the month gained", () => {
		const result = open(
			preview("transportation", {
				scope: "month",
				month: "2026-09",
				limitMinor: 50000,
			}),
		);
		expect(
			result.months.map((each) => [
				each.month,
				each.oldLimitMinor,
				each.newLimitMinor,
			]),
		).toEqual([
			["2026-08", null, null],
			["2026-09", null, 50000],
			["2026-10", 200000, 200000],
		]);
		expect(result.notes).toEqual([
			{ kind: "oneMonth", month: "2026-09" },
			{ kind: "gains", count: 1 },
		]);
	});

	// AC-F04-16: 5,000.00 for November on golden food stores nothing.
	test("a limit equal to the schedule's changes nothing", () => {
		const result = open(
			preview("food", {
				scope: "month",
				month: "2026-11",
				limitMinor: 500000,
			}),
		);
		expect(result.unchanged).toBe(true);
		expect(result.months.every((each) => !each.changed)).toBe(true);
	});

	test("leaves out a neighboring month outside the range", () => {
		const last = open(
			preview("food", { scope: "month", month: "2027-11", limitMinor: 1 }),
		);
		expect(last.months.map((each) => each.month)).toEqual([
			"2027-10",
			"2027-11",
		]);
		const first = open(
			preview("food", { scope: "month", month: "2023-11", limitMinor: 1 }),
		);
		expect(first.months.map((each) => each.month)).toEqual([
			"2023-11",
			"2023-12",
		]);
	});

	test("needs a Budget record", () => {
		expect(() =>
			preview(
				"health",
				{ scope: "month", month: "2026-11", limitMinor: 150000 },
				null,
			),
		).toThrow("A one-month limit needs a Budget record");
	});
});

describe("one-month limits a change from a month onward keeps (BR-F04-25)", () => {
	const raised = setMonth(rulesOf("food"), "2026-10", 800000);
	const result = open(
		preview(
			"food",
			{ scope: "from", month: "2026-09", limitMinor: 700000 },
			raised,
		),
	);

	// AC-F04-16, section 5's "Kept by a later schedule change".
	test("October keeps 8,000.00 and is not a changed month", () => {
		expect(months(result)).toEqual([
			["2026-09", 600000, 700000, 505000, 842, 721, true],
			["2026-10", 800000, 800000, 622000, 778, 778, false],
			["2026-11", 500000, 700000, 42000, 84, 60, true],
		]);
	});

	test("notes September as the past month changed, and October's kept limit last", () => {
		expect(result.notes).toEqual([
			{ kind: "retroactive", months: ["2026-09"] },
			{ kind: "replaces", entries: [{ from: "2026-10", limitMinor: 500000 }] },
			{ kind: "keeps", months: ["2026-10"] },
		]);
		expect(result.keptOverrides).toEqual([
			{ month: "2026-10", limitMinor: 800000 },
		]);
	});

	test("a one-month limit in the change's own month is kept, and keeps its month", () => {
		const own = open(
			preview(
				"food",
				{ scope: "from", month: "2026-10", limitMinor: 700000 },
				raised,
			),
		);
		expect(own.keptOverrides).toEqual([
			{ month: "2026-10", limitMinor: 800000 },
		]);
		expect(own.notes.at(-1)).toEqual({ kind: "keeps", months: ["2026-10"] });
		expect(own.months[0]).toMatchObject({
			month: "2026-10",
			oldLimitMinor: 800000,
			newLimitMinor: 800000,
			changed: false,
		});
	});

	test("one-month limits before the month are not listed as kept", () => {
		const early = setMonth(rulesOf("food"), "2026-09", 900000);
		const later = open(
			preview(
				"food",
				{ scope: "from", month: "2026-10", limitMinor: 700000 },
				early,
			),
		);
		expect(later.keptOverrides).toEqual([]);
		expect(later.notes.some((note) => note.kind === "keeps")).toBe(false);
	});
});

describe("other changes", () => {
	test("a later month lists that month alone and no past months", () => {
		const result = open(
			preview("food", { scope: "from", month: "2027-02", limitMinor: 700000 }),
		);
		expect(months(result)).toEqual([["2027-02", 500000, 700000, 0, 0, 0, true]]);
		expect(result.notes).toEqual([]);
		expect(result.tail).toEqual({ month: "2027-03", limitMinor: 700000 });
	});

	test("a new Budget has no old limits and no gains note", () => {
		const result = open(
			preview(
				"health",
				{ scope: "from", month: "2026-11", limitMinor: 150000 },
				null,
			),
		);
		expect(months(result)).toEqual([
			["2026-11", null, 150000, 0, null, 0, true],
		]);
		expect(result.notes).toEqual([]);
		expect(result.unchanged).toBe(false);
		expect(result.next).toEqual({
			schedule: [{ from: "2026-11", limitMinor: 150000 }],
			overrides: [],
		});
	});

	test("a new Budget from a past month notes the past months, but no gains", () => {
		const result = open(
			preview(
				"health",
				{ scope: "from", month: "2026-09", limitMinor: 150000 },
				null,
			),
		);
		expect(result.notes).toEqual([
			{ kind: "retroactive", months: ["2026-09", "2026-10"] },
		]);
	});

	test("an earlier start on a record notes the month gained", () => {
		const result = open(
			preview("transportation", {
				scope: "from",
				month: "2026-09",
				limitMinor: 200000,
			}),
		);
		expect(months(result)).toEqual([
			["2026-09", null, 200000, 45000, null, 225, true],
			["2026-10", 200000, 200000, 180000, 900, 900, false],
			["2026-11", 200000, 200000, 0, 0, 0, false],
		]);
		expect(result.notes).toEqual([
			{ kind: "retroactive", months: ["2026-09"] },
			{ kind: "gains", count: 1 },
			{ kind: "replaces", entries: [{ from: "2026-10", limitMinor: 200000 }] },
		]);
	});

	test("setting the limit already in force changes nothing", () => {
		const result = open(
			preview("food", { scope: "from", month: "2026-10", limitMinor: 500000 }),
		);
		expect(result.unchanged).toBe(true);
		expect(result.months.every((each) => !each.changed)).toBe(true);
	});

	test("the tail takes a one-month limit in its own month", () => {
		const raised = setMonth(rulesOf("food"), "2026-12", 900000);
		const result = open(
			preview(
				"food",
				{ scope: "from", month: "2026-11", limitMinor: 700000 },
				raised,
			),
		);
		expect(result.tail).toEqual({ month: "2026-12", limitMinor: 900000 });
	});

	test("months with equal figures group only when next to each other", () => {
		const result = previewChange({
			rules: null,
			change: { scope: "from", month: "2026-05", limitMinor: 100 },
			spending: (month) => (month === "2026-07" ? 5 : 0),
			current: "2026-09",
		});
		expect(
			open(result).groups.map((group) => [
				group.first,
				group.last,
				group.count,
			]),
		).toEqual([
			["2026-05", "2026-06", 2],
			["2026-07", "2026-07", 1],
			["2026-08", "2026-09", 2],
		]);
	});

	test("negative spending gives a negative utilization", () => {
		const result = previewChange({
			rules: rulesOf("food"),
			change: { scope: "from", month: "2026-11", limitMinor: 700000 },
			spending: () => -70000,
			current: CURRENT,
		});
		expect(open(result).months[0]).toMatchObject({
			oldTenths: -140,
			newTenths: -100,
		});
	});

	test("reads the spending of each listed month", () => {
		const spending = vi.fn<(month: Month) => number>(() => 0);
		previewChange({
			rules: rulesOf("food"),
			change: { scope: "from", month: "2026-09", limitMinor: 700000 },
			spending,
			current: CURRENT,
		});
		expect(spending.mock.calls.map(([month]) => month)).toEqual(
			expect.arrayContaining(["2026-09", "2026-10", "2026-11"]),
		);
	});

	test("leaves the rules it is given alone", () => {
		const rules = rulesOf("food");
		const before = JSON.stringify(rules);
		preview(
			"food",
			{ scope: "from", month: "2026-09", limitMinor: 700000 },
			rules,
		);
		preview(
			"food",
			{ scope: "month", month: "2026-10", limitMinor: 800000 },
			rules,
		);
		expect(JSON.stringify(rules)).toBe(before);
	});
});
