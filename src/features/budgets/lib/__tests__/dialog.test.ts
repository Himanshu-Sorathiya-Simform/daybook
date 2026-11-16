import { describe, expect, test } from "vitest";

import { goldenBudget } from "@/lib/budgets/__tests__/golden";
import { type BudgetRules, setFrom, setMonth } from "@/lib/budgets/model";
import {
	addCategories,
	buttonName,
	deleteBody,
	deleteHistory,
	deleteTitle,
	DIALOG_TEXT,
	dialogTitle,
	fieldMessages,
	limitMessage,
	limitOf,
	monthChips,
	monthLabel,
	monthName,
	nothingChanges,
	oneMonthDetail,
	planChange,
	planOf,
	rangeCaption,
	recordIn,
	rulesAfter,
	spentHint,
	startLimit,
	tileCaptions,
} from "../dialog";
import type { Formats } from "../labels";
import { monthAnswer } from "./fixtures";

const IN: Formats = {
	currency: "INR",
	numberLocale: "hi-IN-u-nu-latn",
	dateLocale: "en-IN",
};
const DE: Formats = { currency: "EUR", numberLocale: "de-DE", dateLocale: "de-DE" };
// The golden clock's month (TST-3).
const NOW = "2026-11";
const ID = "0192f1a0-0000-7000-8000-000000000001";

describe("titles and labels (BR-F04-19 to BR-F04-21)", () => {
	test.each([
		["add", null, "Add a Budget"],
		["add", "health", "Add a Budget"],
		["change", "food", "Change the Food limit"],
		["stop", "food", "Stop budgeting Food"],
		["change", null, "Add a Budget"],
	] as const)("%s for %s reads %s", (kind, category, title) => {
		expect(dialogTitle(kind, category)).toBe(title);
	});

	test.each([
		["add", "onward", "Apply from"],
		["change", "onward", "Apply from"],
		["stop", "onward", "Stop from"],
		["change", "month", "Month"],
		["stop", "month", "Month"],
	] as const)("the month field of %s, %s, is %s", (kind, scope, label) => {
		expect(monthLabel(kind, scope)).toBe(label);
	});

	test("the fixed words", () => {
		expect(DIALOG_TEXT).toMatchObject({
			monthlyLimit: "Monthly limit",
			newLimit: "New limit",
			forHowLong: "For how long",
			onward: "From a month onward",
			onwardDetail: "Carries on until you change it",
			oneMonth: "One month only",
			otherMonth: "Other month",
			deleteInstead: "Delete Budget instead",
			deleteBudget: "Delete Budget",
			offline: "You are offline. Connect to save.",
		});
	});
});

describe("month names (BR-F04-28)", () => {
	test("this year's months by name, others with their year", () => {
		expect(monthName("2026-12", NOW, IN)).toBe("December");
		expect(monthName("2027-01", NOW, IN)).toBe("January 2027");
		expect(monthName("2025-08", NOW, IN)).toBe("August 2025");
	});

	test("viewing November: This month, Next month and Other month", () => {
		expect(monthChips({ current: NOW, viewed: NOW, picked: NOW }, IN)).toEqual([
			{ value: "2026-11", label: "This month (November)" },
			{ value: "2026-12", label: "Next month (December)" },
			{ value: "other", label: "Other month" },
		]);
	});

	test("viewing October adds October (viewing)", () => {
		expect(
			monthChips({ current: NOW, viewed: "2026-10", picked: NOW }, IN).map(
				(chip) => chip.label,
			),
		).toEqual([
			"This month (November)",
			"Next month (December)",
			"October (viewing)",
			"Other month",
		]);
	});

	test("viewing next month adds nothing", () => {
		expect(
			monthChips({ current: NOW, viewed: "2026-12", picked: NOW }, IN),
		).toHaveLength(3);
	});

	test("a month picked in the grid is a chip of its own, with its year when not this one", () => {
		expect(
			monthChips(
				{ current: NOW, viewed: "2025-08", picked: "2027-02" },
				IN,
			).map((chip) => chip.label),
		).toEqual([
			"This month (November)",
			"Next month (December)",
			"August 2025 (viewing)",
			"February 2027",
			"Other month",
		]);
	});

	test("a picked month that already has a chip adds none", () => {
		expect(
			monthChips({ current: NOW, viewed: "2026-10", picked: "2026-10" }, IN),
		).toHaveLength(4);
	});

	test("in January, next month carries no year either", () => {
		expect(
			monthChips(
				{ current: "2027-01", viewed: "2027-01", picked: "2027-01" },
				IN,
			)[1],
		).toEqual({ value: "2027-02", label: "Next month (February)" });
		expect(
			monthChips(
				{ current: "2026-12", viewed: "2026-12", picked: "2026-12" },
				IN,
			)[1],
		).toEqual({ value: "2027-01", label: "Next month (January 2027)" });
	});

	test("the grid's caption names the range", () => {
		expect(rangeCaption("2023-11", "2027-11", IN)).toBe(
			"From Nov 2023 to Nov 2027.",
		);
	});
});

describe("One month only's detail (BR-F04-20)", () => {
	const food = goldenBudget("food");

	// Flow 7.3: October, then November goes back to 5,000.00
	test("the next month goes back to its limit", () => {
		expect(oneMonthDetail(food, "2026-10", NOW, IN)).toBe(
			"November goes back to ₹5,000.00",
		);
		expect(oneMonthDetail(food, "2026-12", NOW, IN)).toBe(
			"January 2027 goes back to ₹5,000.00",
		);
	});

	test("a next month with no limit has no Budget again", () => {
		expect(oneMonthDetail(food, "2026-07", NOW, IN)).toBe(
			"August has no Budget again",
		);
	});

	test("the next month's own one-month limit counts", () => {
		const rules: BudgetRules = {
			...food,
			overrides: [{ month: "2026-12", limitMinor: 700000 }],
		};
		expect(oneMonthDetail(rules, "2026-11", NOW, IN)).toBe(
			"December goes back to ₹7,000.00",
		);
	});
});

describe("the limit (BR-F04-19, BR-F04-20)", () => {
	// F04 section 5: food spent 6,220.00 in October, 5,050.00 in September
	test("the hint names the viewed month, then the one before", () => {
		expect(
			spentHint(
				[
					{ month: "2026-09", spentMinor: 505000 },
					{ month: "2026-10", spentMinor: 622000 },
				],
				IN,
			),
		).toBe("Spent ₹6,220.00 in October and ₹5,050.00 in September.");
	});

	test("no hint without both months", () => {
		expect(spentHint([], IN)).toBeUndefined();
		expect(spentHint([{ month: "2026-10", spentMinor: 0 }], IN)).toBeUndefined();
	});

	test("Change limit starts at the viewed month's limit", () => {
		expect(startLimit(goldenBudget("food"), "2026-09", NOW)).toBe(600000);
	});

	test("else the current month's", () => {
		expect(startLimit(goldenBudget("transportation"), "2026-09", NOW)).toBe(
			200000,
		);
	});

	test("else the latest limit in the schedule", () => {
		const stopped: BudgetRules = {
			schedule: [
				{ from: "2026-01", limitMinor: 100000 },
				{ from: "2026-03", limitMinor: 200000 },
				{ from: "2026-05", limitMinor: null },
			],
			overrides: [],
		};
		expect(startLimit(stopped, "2026-08", NOW)).toBe(200000);
	});

	test("nothing when no entry has a limit", () => {
		expect(
			startLimit({ schedule: [], overrides: [] }, "2026-08", NOW),
		).toBeNull();
	});

	test("an empty limit asks for one; others are F03's amount messages", () => {
		expect(limitMessage({ ok: false, error: "required" }, IN)).toBe(
			"Enter a limit.",
		);
		expect(limitMessage({ ok: false, error: "zero" }, IN)).toBe(
			"Enter an amount above zero.",
		);
		expect(limitMessage({ ok: true, minor: 100 }, IN)).toBeUndefined();
	});
});

describe("Add's categories (BR-F04-19)", () => {
	test("golden October offers every expense category but the four budgeted", () => {
		expect(addCategories(monthAnswer("2026-10"))).toEqual([
			"utilities",
			"housing",
			"health",
			"education",
			"travel",
			"insurance",
			"personal_care",
			"gifts_donations",
			"fees_taxes",
			"loans",
			"other",
		]);
	});

	// F04 section 5: September's Not budgeted
	test("each with spending in the viewed month says how much", () => {
		expect(tileCaptions(monthAnswer("2026-09"), IN)).toEqual({
			housing: "₹18,000.00 in Sept",
			health: "₹1,500.00 in Sept",
			transportation: "₹450.00 in Sept",
		});
	});

	test("in the profile's formats", () => {
		expect(tileCaptions(monthAnswer("2026-10"), DE)).toEqual({
			housing: "18.000,00 € in Okt",
		});
	});

	test("a category's record: a Budget, a Not active one, or none", () => {
		const september = monthAnswer("2026-09");
		expect(recordIn(september, "food")?.id).toBe(goldenBudget("food").id);
		expect(recordIn(september, "transportation")?.id).toBe(
			goldenBudget("transportation").id,
		);
		expect(recordIn(september, "health")).toBeNull();
	});
});

describe("the button and Nothing changes (BR-F04-27)", () => {
	test.each([
		["add", "onward", "2026-11", "Add Budget from November"],
		["add", "month", "2026-11", "Add for November only"],
		["change", "onward", "2026-09", "Change from September"],
		["change", "month", "2026-10", "Change October only"],
		["stop", "onward", "2026-11", "Stop from November"],
		["stop", "month", "2027-01", "Stop January 2027 only"],
	] as const)("%s, %s, %s: %s", (kind, scope, month, name) => {
		expect(buttonName(kind, scope, month, NOW, IN)).toBe(name);
	});

	test("Nothing changes, from a month or in one", () => {
		expect(nothingChanges("food", "onward", "2026-11", IN)).toBe(
			"Food already has this limit from November 2026. Nothing changes.",
		);
		expect(nothingChanges("food", "month", "2026-11", IN)).toBe(
			"Food already has this limit in November 2026. Nothing changes.",
		);
	});
});

describe("planChange (BR-F04-19 to BR-F04-21, D-561)", () => {
	const food = goldenBudget("food");
	const base = { id: ID, currency: "INR" as const, limitMinor: 700000 };

	// Flow 7.1
	test("Add for a category with no record creates it from the month", () => {
		expect(
			planChange({
				...base,
				kind: "add",
				record: null,
				category: "health",
				scope: "onward",
				month: "2026-11",
				limitMinor: 150000,
			}),
		).toEqual({
			kind: "create",
			body: {
				id: ID,
				category: "health",
				from: "2026-11",
				limitMinor: 150000,
				currency: "INR",
			},
		});
	});

	// Flow 7.2
	test("a change from a month onward", () => {
		expect(
			planChange({
				...base,
				kind: "change",
				record: food,
				category: "food",
				scope: "onward",
				month: "2026-09",
			}),
		).toEqual({
			kind: "edit",
			body: { from: "2026-09", limitMinor: 700000, currency: "INR" },
			blocked: false,
			unchanged: false,
		});
	});

	// Flow 7.3
	test("one month only", () => {
		expect(
			planChange({
				...base,
				kind: "change",
				record: food,
				category: "food",
				scope: "month",
				month: "2026-10",
				limitMinor: 800000,
			}),
		).toEqual({
			kind: "edit",
			body: {
				month: "2026-10",
				limitMinor: 800000,
				currency: "INR",
				scope: "month",
			},
			blocked: false,
			unchanged: false,
		});
	});

	test("Add for a category with a record changes it", () => {
		const plan = planChange({
			...base,
			kind: "add",
			record: goldenBudget("transportation"),
			category: "transportation",
			scope: "onward",
			month: "2026-09",
		});
		expect(plan.kind).toBe("edit");
	});

	// Flow 7.4
	test("a stop sends no limit, whatever was typed", () => {
		expect(
			planChange({
				...base,
				kind: "stop",
				record: goldenBudget("entertainment"),
				category: "entertainment",
				scope: "onward",
				month: "2026-11",
			}),
		).toEqual({
			kind: "edit",
			body: { from: "2026-11", limitMinor: null, currency: "INR" },
			blocked: false,
			unchanged: false,
		});
	});

	// BR-F04-21
	test("a stop at or before the first entry is blocked", () => {
		for (const month of ["2026-09", "2026-06"]) {
			const plan = planChange({
				...base,
				kind: "stop",
				record: food,
				category: "food",
				scope: "onward",
				month,
			});
			expect(plan).toMatchObject({ blocked: true, unchanged: false });
		}
	});

	test("stopping one month at the first entry is not blocked", () => {
		expect(
			planChange({
				...base,
				kind: "stop",
				record: food,
				category: "food",
				scope: "month",
				month: "2026-09",
			}),
		).toMatchObject({ blocked: false });
	});

	// BR-F04-27, section 8
	test("the same limit from a month changes nothing", () => {
		expect(
			planChange({
				...base,
				kind: "change",
				record: food,
				category: "food",
				scope: "onward",
				month: "2026-11",
				limitMinor: 500000,
			}),
		).toMatchObject({ unchanged: true });
	});

	test("the schedule's limit for one month changes nothing", () => {
		expect(
			planChange({
				...base,
				kind: "change",
				record: food,
				category: "food",
				scope: "month",
				month: "2026-11",
				limitMinor: 500000,
			}),
		).toMatchObject({ unchanged: true });
	});

	test("one month at the schedule's limit changes nothing, though from that month it would", () => {
		const plan = {
			...base,
			kind: "change" as const,
			record: food,
			category: "food" as const,
			month: "2026-09",
			limitMinor: 600000,
		};
		expect(planChange({ ...plan, scope: "month" })).toMatchObject({
			unchanged: true,
		});
		expect(planChange({ ...plan, scope: "onward" })).toMatchObject({
			unchanged: false,
		});
	});

	test("a stop where the Budget already stops changes nothing", () => {
		const stopped: BudgetRules = {
			schedule: [
				{ from: "2026-09", limitMinor: 600000 },
				{ from: "2026-11", limitMinor: null },
			],
			overrides: [],
		};
		expect(
			planChange({
				...base,
				kind: "stop",
				record: stopped,
				category: "food",
				scope: "onward",
				month: "2026-12",
			}),
		).toMatchObject({ blocked: false, unchanged: true });
	});
});

describe("limitOf (BR-F04-19 to BR-F04-21)", () => {
	test("a stop has no limit, whatever the field holds", () => {
		expect(limitOf("stop", { ok: true, minor: 700000 })).toBeNull();
		expect(limitOf("stop", { ok: false, error: "required" })).toBeNull();
	});

	test.each(["add", "change"] as const)("%s takes the typed amount", (kind) => {
		expect(limitOf(kind, { ok: true, minor: 700000 })).toBe(700000);
	});

	test.each(["add", "change"] as const)(
		"%s with no valid amount has no limit yet",
		(kind) => {
			expect(limitOf(kind, { ok: false, error: "required" })).toBeUndefined();
		},
	);
});

describe("rulesAfter (BR-F04-20, BR-F04-23)", () => {
	const food = goldenBudget("food");

	test("from a month onward, the rules of a change from it", () => {
		expect(
			rulesAfter(food, {
				scope: "onward",
				month: "2026-09",
				limitMinor: 700000,
			}),
		).toEqual(setFrom(food, "2026-09", 700000));
	});

	test("for one month only, the rules of a one-month limit", () => {
		expect(
			rulesAfter(food, {
				scope: "month",
				month: "2026-10",
				limitMinor: 800000,
			}),
		).toEqual(setMonth(food, "2026-10", 800000));
	});

	test("a stop is a null limit in either scope", () => {
		expect(
			rulesAfter(food, {
				scope: "onward",
				month: "2026-12",
				limitMinor: null,
			}),
		).toEqual(setFrom(food, "2026-12", null));
		expect(
			rulesAfter(food, { scope: "month", month: "2026-12", limitMinor: null }),
		).toEqual(setMonth(food, "2026-12", null));
	});
});

describe("planOf (BR-F04-19 to BR-F04-21)", () => {
	const base = {
		id: ID,
		currency: "INR" as const,
		scope: "onward" as const,
		month: "2026-11",
	};

	test("without a category there is no plan", () => {
		expect(
			planOf({
				...base,
				kind: "add",
				record: null,
				category: null,
				typed: { ok: true, minor: 150000 },
			}),
		).toBeNull();
	});

	test("an Add or a Change without a valid limit has no plan", () => {
		for (const kind of ["add", "change"] as const) {
			expect(
				planOf({
					...base,
					kind,
					record: null,
					category: "health",
					typed: { ok: false, error: "required" },
				}),
			).toBeNull();
		}
	});

	test("with a category and a valid limit, the plan of planChange", () => {
		const input = {
			...base,
			kind: "add" as const,
			record: null,
			category: "health" as const,
		};
		expect(planOf({ ...input, typed: { ok: true, minor: 150000 } })).toEqual(
			planChange({ ...input, limitMinor: 150000 }),
		);
	});

	test("a stop needs no limit", () => {
		const food = goldenBudget("food");
		expect(
			planOf({
				...base,
				month: "2026-12",
				kind: "stop",
				record: food,
				category: "food",
				typed: { ok: false, error: "required" },
			}),
		).toMatchObject({
			kind: "edit",
			body: { from: "2026-12", limitMinor: null },
		});
	});
});

describe("fieldMessages (BR-F04-19, section 8)", () => {
	const none = { ok: false, error: "required" } as const;

	test("an Add without a category asks for one, and without a limit for a limit", () => {
		expect(
			fieldMessages(
				{ server: {}, kind: "add", category: null, typed: none },
				IN,
			),
		).toEqual({
			category: "Choose a category.",
			limitMinor: "Enter a limit.",
			month: undefined,
		});
	});

	test("a valid Change says nothing", () => {
		expect(
			fieldMessages(
				{
					server: {},
					kind: "change",
					category: "food",
					typed: { ok: true, minor: 700000 },
				},
				IN,
			),
		).toEqual({ category: undefined, limitMinor: undefined, month: undefined });
	});

	test("a stop has no limit to check", () => {
		expect(
			fieldMessages(
				{ server: {}, kind: "stop", category: "food", typed: none },
				IN,
			).limitMinor,
		).toBeUndefined();
	});

	test("the server's message comes before the dialog's own", () => {
		expect(
			fieldMessages(
				{
					server: {
						category: "Pick another.",
						limitMinor: "Too large.",
						month: "Out of range.",
					},
					kind: "add",
					category: null,
					typed: none,
				},
				IN,
			),
		).toEqual({
			category: "Pick another.",
			limitMinor: "Too large.",
			month: "Out of range.",
		});
	});
});

describe("the Delete confirmation (BR-F04-06)", () => {
	test("its title and line", () => {
		expect(deleteTitle("food")).toBe("Delete the Food Budget?");
		expect(deleteBody("food")).toBe(
			"Every month, including past ones, loses its Food limit.",
		);
	});

	test("with more than one change, the limit history's line", () => {
		expect(deleteHistory(goldenBudget("food"), IN)).toBe(
			"Its limit history (2 changes since September 2026) goes too. To keep it, stop the Budget from a month instead.",
		);
	});

	test("one-month limits count as changes", () => {
		const rules: BudgetRules = {
			schedule: [{ from: "2026-10", limitMinor: 200000 }],
			overrides: [{ month: "2026-12", limitMinor: null }],
		};
		expect(deleteHistory(rules, IN)).toContain("(2 changes since October 2026)");
	});

	test("one change has no line", () => {
		expect(deleteHistory(goldenBudget("transportation"), IN)).toBeNull();
		expect(deleteHistory({ schedule: [], overrides: [] }, IN)).toBeNull();
	});
});
