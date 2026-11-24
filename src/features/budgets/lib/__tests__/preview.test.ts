import { describe, expect, test } from "vitest";

import { goldenBudget, goldenSpending } from "@/lib/budgets/__tests__/golden";
import { type BudgetRules, setMonth } from "@/lib/budgets/model";
import type { Month } from "@/lib/budgets/months";
import {
	type BudgetChange,
	type BudgetPreview,
	type PreviewMonth,
	previewChange,
} from "@/lib/budgets/preview";
import type { Formats } from "../labels";
import {
	figuresOf,
	groupText,
	historyWindow,
	limitText,
	monthList,
	newState,
	noteText,
	oldState,
	onwardCaption,
	onwardLabel,
	PREVIEW_TEXT,
	type PreviewContext,
	showMoreLabel,
	stripColumn,
	unchangedText,
} from "../preview";

// Expected texts are copied from F04 section 5 and BR-F04-26, BR-F04-27. The golden current
// month is November 2026 (TST-3).

const IN: Formats = {
	currency: "INR",
	numberLocale: "hi-IN-u-nu-latn",
	dateLocale: "en-IN",
};
const DE: Formats = { currency: "EUR", numberLocale: "de-DE", dateLocale: "de-DE" };
const NOW: Month = "2026-11";

const context = (
	category: PreviewContext["category"],
	formats: Formats = IN,
): PreviewContext => ({ category, current: NOW, formats });

type Category = Parameters<typeof goldenBudget>[0];

function preview(
	category: Category,
	change: BudgetChange,
	rules: BudgetRules | null = goldenBudget(category),
) {
	const result: BudgetPreview = previewChange({
		rules,
		change,
		spending: (month) => goldenSpending(month)[category] ?? 0,
		current: NOW,
	});
	if (result.blocked) throw new Error("The preview is blocked.");
	return result;
}

const FOOD = context("food");
const from = (month: Month, limitMinor: number | null): BudgetChange => ({
	scope: "from",
	month,
	limitMinor,
});
const only = (month: Month, limitMinor: number | null): BudgetChange => ({
	scope: "month",
	month,
	limitMinor,
});

/** Each month of a preview, as the card words it. */
const states = (
	result: ReturnType<typeof preview>,
	ctx: PreviewContext,
): Record<Month, string> =>
	Object.fromEntries(
		result.months.map((month) => {
			const before = oldState(month, ctx.formats);
			const was = before === null ? "" : `${before} → `;
			return [month.month, `${was}${newState(month, ctx).text}`];
		}),
	);

describe("the states of a retroactive change: food at 7,000.00 from September", () => {
	const result = preview("food", from("2026-09", 700000));

	// AC-F04-22
	test("says each month's new state, with the old one first when it changes", () => {
		expect(states(result, FOOD)).toEqual({
			"2026-09": "84.2% Nearing limit → 72.1% · On track",
			"2026-10": "124.4% Over budget → 88.9% · Nearing limit",
			"2026-11": "6.0% · On track",
		});
	});

	test("gives each new state's label for its colour", () => {
		expect(result.months.map((month) => newState(month, FOOD).label)).toEqual([
			"ok",
			"warning",
			"ok",
		]);
	});

	test("notes the past months and the entry it replaces", () => {
		expect(
			result.notes.map((note) =>
				noteText(note, from("2026-09", 700000), FOOD),
			),
		).toEqual([
			"This also changes September and October 2026.",
			"This replaces the change to ₹5,000.00 from October 2026.",
		]);
	});

	test("captions three months, then every month after", () => {
		expect(onwardCaption("2026-09", result.months.length, IN)).toBe(
			"3 months, then every month after",
		);
	});

	test("names the tail Dec 2026 onward", () => {
		expect(onwardLabel(result.tail!.month, IN)).toBe("Dec 2026 onward");
		expect(limitText(result.tail!.limitMinor, IN)).toBe("₹7,000.00");
	});
});

describe("the texts of a long change: shopping at 4,000.00 from November 2023", () => {
	const change = from("2023-11", 400000);
	const result = preview("shopping", change);
	const shopping = context("shopping");

	// AC-F04-22
	test("words the four groups", () => {
		expect(
			result.groups.map((group) => {
				const first = result.months.find(
					(each) => each.month === group.first,
				)!;
				const before = oldState(first, IN);
				const was = before === null ? "" : `${before} → `;
				return [
					groupText(group, IN),
					limitText(group.oldLimitMinor, IN),
					limitText(group.newLimitMinor, IN),
					`${was}${newState(first, shopping).text}`,
				];
			}),
		).toEqual([
			[
				{ range: "Nov 2023 to Aug 2026", count: "34 months" },
				"No Budget",
				"₹4,000.00",
				"No Shopping spending · On track",
			],
			[
				{ range: "Sept 2026", count: null },
				"₹3,000.00",
				"₹4,000.00",
				"80.0% Nearing limit → 60.0% · On track",
			],
			[
				{ range: "Oct 2026", count: null },
				"₹3,000.00",
				"₹4,000.00",
				"100.0% At limit → 75.0% · On track",
			],
			[
				{ range: "Nov 2026", count: null },
				"₹3,000.00",
				"₹4,000.00",
				"No Shopping spending · On track",
			],
		]);
	});

	test("notes the 34 months gained, with the range of months it changes", () => {
		expect(result.notes.map((note) => noteText(note, change, shopping))).toEqual(
			[
				"This also changes November 2023 to October 2026.",
				"Shopping gets a Budget in 34 months that had none.",
				"This replaces the change to ₹3,000.00 from September 2026.",
			],
		);
	});

	test("columns: spending over the new limit, the old limit as a share of it", () => {
		const columns = result.months.map(stripColumn);
		// 34 months with no old limit and no spending.
		expect(columns.slice(0, 34)).toEqual(
			Array(34).fill({ spendShare: 0, tickShare: null, noBudget: false }),
		);
		// September: 2,400.00 of 4,000.00, old limit 3,000.00 of it.
		expect(columns[34]).toEqual({
			spendShare: 0.6,
			tickShare: 0.75,
			noBudget: false,
		});
		// October: 3,000.00 of 4,000.00.
		expect(columns[35]).toEqual({
			spendShare: 0.75,
			tickShare: 0.75,
			noBudget: false,
		});
	});
});

describe("limitText", () => {
	test.each([
		[700000, IN, "₹7,000.00"],
		[null, IN, "No Budget"],
		[123456, DE, "1.234,56 €"],
	])("%s reads %s", (minor, formats, text) => {
		expect(limitText(minor, formats).replaceAll(" ", " ")).toBe(text);
	});
});

describe("onwardCaption (BR-F04-26)", () => {
	test("a single month names it, with its year", () => {
		expect(onwardCaption("2026-12", 1, IN)).toBe(
			"December 2026 and every month after",
		);
	});

	test("two months or more count them", () => {
		expect(onwardCaption("2026-10", 2, IN)).toBe(
			"2 months, then every month after",
		);
		expect(onwardCaption("2023-11", 37, IN)).toBe(
			"37 months, then every month after",
		);
	});

	test("follows the profile's language", () => {
		expect(onwardCaption("2026-12", 1, DE)).toBe(
			"Dezember 2026 and every month after",
		);
	});
});

/** A month as `previewChange` would list it, with `changes` over it. */
const month = (changes: Partial<PreviewMonth>): PreviewMonth => ({
	month: "2026-10",
	oldLimitMinor: 500000,
	newLimitMinor: 700000,
	spentMinor: 100000,
	oldTenths: 200,
	newTenths: 143,
	changed: true,
	own: false,
	...changes,
});

describe("newState (BR-F04-26)", () => {
	test("a month with spending reads its utilization and state", () => {
		expect(newState(month({ newTenths: 721 }), FOOD)).toEqual({
			text: "72.1% · On track",
			label: "ok",
		});
	});

	test.each([
		[1000, "100.0% · At limit", "at"],
		[1001, "100.1% · Over budget", "over"],
		[800, "80.0% · Nearing limit", "warning"],
		[799, "79.9% · On track", "ok"],
	])("%s tenths read %s", (tenths, text, label) => {
		expect(newState(month({ newTenths: tenths }), FOOD)).toEqual({
			text,
			label,
		});
	});

	test("no spending in a past or current month names the category", () => {
		expect(
			newState(month({ spentMinor: 0, newTenths: 0, month: "2026-11" }), FOOD),
		).toEqual({ text: "No Food spending · On track", label: "ok" });
		expect(
			newState(
				month({ spentMinor: 0, newTenths: 0, month: "2026-09" }),
				context("health"),
			).text,
		).toBe("No Health spending · On track");
	});

	test("no spending in a later month reads Nothing spent yet", () => {
		expect(
			newState(month({ spentMinor: 0, newTenths: 0, month: "2026-12" }), FOOD),
		).toEqual({ text: "Nothing spent yet", label: "ok" });
	});

	test("no new limit with spending moves to Not budgeted", () => {
		expect(
			newState(month({ newLimitMinor: null, newTenths: null }), FOOD),
		).toEqual({ text: "Moves to Not budgeted", label: null });
	});

	test("no new limit and no spending is No Budget", () => {
		expect(
			newState(
				month({ newLimitMinor: null, newTenths: null, spentMinor: 0 }),
				FOOD,
			),
		).toEqual({ text: "No Budget", label: null });
	});

	test("writes the percentage in the profile's number format", () => {
		expect(newState(month({ newTenths: 721 }), context("food", DE)).text).toBe(
			"72,1 % · On track",
		);
	});
});

describe("oldState (BR-F04-26)", () => {
	test("is the old utilization and state when the state changes", () => {
		expect(oldState(month({ oldTenths: 842, newTenths: 721 }), IN)).toBe(
			"84.2% Nearing limit",
		);
		expect(oldState(month({ oldTenths: 1244, newTenths: 889 }), IN)).toBe(
			"124.4% Over budget",
		);
		expect(oldState(month({ oldTenths: 1000, newTenths: 750 }), IN)).toBe(
			"100.0% At limit",
		);
	});

	test("is nothing when the state stays", () => {
		expect(oldState(month({ oldTenths: 84, newTenths: 60 }), IN)).toBeNull();
		expect(oldState(month({ oldTenths: 1300, newTenths: 1100 }), IN)).toBeNull();
	});

	test("has the old state before it moves to Not budgeted", () => {
		expect(
			oldState(
				month({ oldTenths: 900, newTenths: null, newLimitMinor: null }),
				IN,
			),
		).toBe("90.0% Nearing limit");
	});

	test("is nothing for a stop in a month with no spending", () => {
		expect(
			oldState(
				month({
					spentMinor: 0,
					oldTenths: 0,
					newTenths: null,
					newLimitMinor: null,
				}),
				IN,
			),
		).toBeNull();
	});

	test("is nothing without an old limit, or without spending", () => {
		expect(
			oldState(month({ oldTenths: null, oldLimitMinor: null }), IN),
		).toBeNull();
		expect(
			oldState(month({ spentMinor: 0, oldTenths: 0, newTenths: 0 }), IN),
		).toBeNull();
	});
});

describe("unchangedText (BR-F04-26)", () => {
	const kept = month({ changed: false, own: true });
	const plain = month({ changed: false });

	test("from a month onward: its own one-month limit is kept, else it is unchanged", () => {
		expect(unchangedText(kept, from("2026-09", 700000))).toBe(
			"Keeps its one-month limit",
		);
		expect(unchangedText(plain, from("2026-09", 700000))).toBe("Unchanged");
	});

	test("one month only: the month before is unchanged", () => {
		expect(
			unchangedText(
				month({ month: "2026-09", changed: false }),
				only("2026-10", 800000),
			),
		).toBe("Unchanged");
	});

	test("one month only: the month after goes back to the schedule", () => {
		expect(
			unchangedText(
				month({ month: "2026-11", changed: false }),
				only("2026-10", 800000),
			),
		).toBe("Back to the schedule");
	});

	test("one month only: the month after with its own one-month limit is unchanged", () => {
		expect(
			unchangedText(
				month({ month: "2026-11", changed: false, own: true }),
				only("2026-10", 800000),
			),
		).toBe("Unchanged");
	});

	test("one month only: the changed month itself, unchanged, reads Unchanged", () => {
		expect(
			unchangedText(month({ changed: false }), only("2026-10", 800000)),
		).toBe("Unchanged");
	});

	test("the cards of food at 8,000.00 for October one month only", () => {
		const change = only("2026-10", 800000);
		const result = preview("food", change);
		expect(
			result.months.map((each) =>
				each.changed ? "changed" : unchangedText(each, change),
			),
		).toEqual(["Unchanged", "changed", "Back to the schedule"]);
		expect(states(result, FOOD)["2026-10"]).toBe(
			"124.4% Over budget → 77.8% · On track",
		);
	});

	test("a kept one-month limit in a later schedule change", () => {
		const raised = setMonth(goldenBudget("food"), "2026-10", 800000);
		const change = from("2026-09", 700000);
		const result = preview("food", change, raised);
		expect(
			result.months.map((each) =>
				each.changed ? "changed" : unchangedText(each, change),
			),
		).toEqual(["changed", "Keeps its one-month limit", "changed"]);
		expect(result.notes.map((note) => noteText(note, change, FOOD))).toEqual([
			"This also changes September 2026.",
			"This replaces the change to ₹5,000.00 from October 2026.",
			"October 2026 keeps its one-month limit.",
		]);
	});
});

describe("groupText (BR-F04-26)", () => {
	const group = (first: Month, last: Month, count: number) => ({
		first,
		last,
		count,
	});

	test("one month is its short name with the year, and no count", () => {
		expect(groupText(group("2026-09", "2026-09", 1), IN)).toEqual({
			range: "Sept 2026",
			count: null,
		});
	});

	test("months across years carry both years", () => {
		expect(groupText(group("2023-11", "2026-08", 34), IN)).toEqual({
			range: "Nov 2023 to Aug 2026",
			count: "34 months",
		});
	});

	test("months inside a year carry the year once", () => {
		expect(groupText(group("2026-01", "2026-03", 3), IN)).toEqual({
			range: "Jan to Mar 2026",
			count: "3 months",
		});
	});

	test("two months count as months", () => {
		expect(groupText(group("2026-05", "2026-06", 2), IN).count).toBe("2 months");
	});

	test("follows the profile's language", () => {
		expect(groupText(group("2023-11", "2026-08", 34), DE).range).toBe(
			"Nov. 2023 to Aug. 2026",
		);
	});
});

describe("figuresOf (section 10)", () => {
	test("with the history in, the figures are ready", () => {
		expect(
			figuresOf({ data: { months: [] }, isError: false, fetchStatus: "idle" }),
		).toBe("ready");
	});

	test("data wins over an error from a later refetch", () => {
		expect(
			figuresOf({
				data: { months: [] },
				isError: true,
				fetchStatus: "paused",
			}),
		).toBe("ready");
	});

	test("a failed history is missing", () => {
		expect(
			figuresOf({ data: undefined, isError: true, fetchStatus: "idle" }),
		).toBe("missing");
	});

	test("a paused history, as when offline, is missing", () => {
		expect(
			figuresOf({ data: undefined, isError: false, fetchStatus: "paused" }),
		).toBe("missing");
	});

	test("a history on its way is loading", () => {
		expect(
			figuresOf({ data: undefined, isError: false, fetchStatus: "fetching" }),
		).toBe("loading");
	});
});

describe("showMoreLabel", () => {
	test.each([
		[3, "Show 3 more"],
		[1, "Show 1 more"],
	])("%s hidden reads %s", (count, text) => {
		expect(showMoreLabel(count)).toBe(text);
	});
});

describe("monthList (BR-F04-27)", () => {
	test.each([
		[["2026-10"], "October 2026"],
		[["2026-09", "2026-10"], "September and October 2026"],
		[["2026-10", "2026-12"], "October and December 2026"],
		[["2026-09", "2026-10", "2026-11"], "September to November 2026"],
		[["2023-11", "2023-12", "2024-01"], "November 2023 to January 2024"],
		[["2026-12", "2027-01"], "December 2026 and January 2027"],
		[["2026-01", "2026-03", "2026-05"], "January, March and May 2026"],
		[
			["2026-01", "2026-02", "2026-03", "2026-05"],
			"January to March 2026 and May 2026",
		],
		[
			["2026-01", "2026-05", "2026-06", "2026-07"],
			"January and May to July 2026",
		],
		[
			["2026-12", "2027-02", "2027-03"],
			"December 2026, February and March 2027",
		],
	] as const)("%j reads %s", (months, text) => {
		expect(monthList(months, IN)).toBe(text);
	});

	test("follows the profile's language", () => {
		expect(monthList(["2026-09", "2026-10"], DE)).toBe(
			"September and Oktober 2026",
		);
	});
});

describe("noteText (BR-F04-27)", () => {
	const onward = from("2026-11", 500000);

	test("a stop keeps earlier months, and names spending that moves", () => {
		expect(
			noteText(
				{ kind: "stopKeepsEarlier", movesToUnbudgeted: false },
				onward,
				FOOD,
			),
		).toBe("Earlier months keep their limits.");
		expect(
			noteText(
				{ kind: "stopKeepsEarlier", movesToUnbudgeted: true },
				onward,
				FOOD,
			),
		).toBe(
			"Earlier months keep their limits. November's spending moves to Not budgeted.",
		);
	});

	test("a month in another year carries its year", () => {
		expect(
			noteText(
				{ kind: "stopKeepsEarlier", movesToUnbudgeted: true },
				from("2027-01", null),
				FOOD,
			),
		).toBe(
			"Earlier months keep their limits. January 2027's spending moves to Not budgeted.",
		);
	});

	test("one month only names the month", () => {
		expect(
			noteText(
				{ kind: "oneMonth", month: "2026-10" },
				only("2026-10", 1),
				FOOD,
			),
		).toBe(
			"Only October 2026 changes. The limits for other months stay as they are.",
		);
	});

	test("gains counts months, one or more", () => {
		expect(noteText({ kind: "gains", count: 2 }, onward, FOOD)).toBe(
			"Food gets a Budget in 2 months that had none.",
		);
		expect(
			noteText({ kind: "gains", count: 1 }, onward, context("shopping")),
		).toBe("Shopping gets a Budget in 1 month that had none.");
	});

	test("one replaced change, a limit or a stop", () => {
		expect(
			noteText(
				{
					kind: "replaces",
					entries: [{ from: "2026-12", limitMinor: 700000 }],
				},
				onward,
				FOOD,
			),
		).toBe("This replaces the change to ₹7,000.00 from December 2026.");
		expect(
			noteText(
				{
					kind: "replaces",
					entries: [{ from: "2026-12", limitMinor: null }],
				},
				onward,
				FOOD,
			),
		).toBe("This replaces the stop from December 2026.");
	});

	test("several replaced changes list each one", () => {
		expect(
			noteText(
				{
					kind: "replaces",
					entries: [
						{ from: "2026-12", limitMinor: 700000 },
						{ from: "2027-03", limitMinor: null },
					],
				},
				onward,
				FOOD,
			),
		).toBe(
			"This replaces 2 later changes: ₹7,000.00 from Dec 2026, the stop from Mar 2027.",
		);
	});

	test("kept one-month limits, one or several", () => {
		expect(noteText({ kind: "keeps", months: ["2026-10"] }, onward, FOOD)).toBe(
			"October 2026 keeps its one-month limit.",
		);
		expect(
			noteText(
				{ kind: "keeps", months: ["2026-10", "2026-12"] },
				onward,
				FOOD,
			),
		).toBe("October and December 2026 keep their one-month limits.");
	});

	test("a retroactive note lists its months", () => {
		expect(
			noteText(
				{ kind: "retroactive", months: ["2026-09", "2026-10"] },
				onward,
				FOOD,
			),
		).toBe("This also changes September and October 2026.");
	});
});

describe("historyWindow (BR-F04-35)", () => {
	const LAST = "2027-11";

	test("from a past month: that month to the current one", () => {
		expect(historyWindow(from("2026-09", 1), NOW, LAST)).toEqual({
			to: "2026-11",
			months: 3,
		});
	});

	test("from the earliest month: 37 months", () => {
		expect(historyWindow(from("2023-11", 1), NOW, LAST)).toEqual({
			to: "2026-11",
			months: 37,
		});
	});

	test("from the current month: that month alone", () => {
		expect(historyWindow(from("2026-11", 1), NOW, LAST)).toEqual({
			to: "2026-11",
			months: 1,
		});
	});

	test("from a later month: that month alone, ending there", () => {
		expect(historyWindow(from("2027-03", 1), NOW, LAST)).toEqual({
			to: "2027-03",
			months: 1,
		});
	});

	test("one month only: the month before to the month after", () => {
		expect(historyWindow(only("2026-10", 1), NOW, LAST)).toEqual({
			to: "2026-11",
			months: 3,
		});
	});

	test("one month only in the last month of the range ends there", () => {
		expect(historyWindow(only("2027-11", 1), NOW, LAST)).toEqual({
			to: "2027-11",
			months: 3,
		});
	});

	test("a stop is asked for like a limit", () => {
		expect(historyWindow(from("2026-10", null), NOW, LAST)).toEqual({
			to: "2026-11",
			months: 2,
		});
	});
});

describe("stripColumn (BR-F04-26)", () => {
	test("spending and the old limit as shares of the new limit", () => {
		expect(
			stripColumn(
				month({
					newLimitMinor: 400000,
					oldLimitMinor: 300000,
					spentMinor: 240000,
				}),
			),
		).toEqual({ spendShare: 0.6, tickShare: 0.75, noBudget: false });
	});

	test("spending past the new limit is more than 1", () => {
		expect(
			stripColumn(
				month({
					newLimitMinor: 500000,
					oldLimitMinor: 500000,
					spentMinor: 622000,
				}),
			).spendShare,
		).toBe(1.244);
	});

	test("no old limit has no tick", () => {
		expect(stripColumn(month({ oldLimitMinor: null })).tickShare).toBeNull();
	});

	test("no new limit is a dashed empty column", () => {
		expect(stripColumn(month({ newLimitMinor: null }))).toEqual({
			spendShare: 0,
			tickShare: null,
			noBudget: true,
		});
	});

	test("refunds past the expenses draw no spending", () => {
		expect(stripColumn(month({ spentMinor: -5000 })).spendShare).toBe(0);
	});
});

describe("PREVIEW_TEXT", () => {
	test("holds the strip's caption as the spec words it", () => {
		expect(PREVIEW_TEXT.stripCaption).toBe(
			"One column per month: spending against the new limit. Black tick: the old limit.",
		);
		expect(PREVIEW_TEXT.heading).toBe("What changes");
	});
});
