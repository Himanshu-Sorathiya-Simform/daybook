import { describe, expect, test } from "vitest";

import { EXPENSE_CATEGORIES } from "@/lib/categories";

import { GOLDEN_BUDGETS } from "../../../../seed/golden";
import {
	budgetState,
	type BudgetRules,
	categoryOrder,
	changeCount,
	inactiveStatus,
	limitIn,
	limitSource,
	nextEntry,
	normalizeSchedule,
	removeMonth,
	sameRules,
	type ScheduleEntry,
	scheduleEntryIn,
	setFrom,
	setMonth,
	STATE_LABELS,
	stateLabel,
	stopRemovesEveryMonth,
	utilizationTenths,
} from "../model";

// Every expected value is from docs/features/F04-budgets.md or docs/03-golden-dataset.md.

const golden = (category: string): BudgetRules => {
	const budget = GOLDEN_BUDGETS.find((each) => each.category === category);
	if (!budget) throw new Error(`No golden ${category} Budget`);
	return { schedule: budget.schedule, overrides: budget.overrides };
};
const FOOD = golden("food");
const ENTERTAINMENT = golden("entertainment");
const TRANSPORTATION = golden("transportation");

const entry = (from: string, limitMinor: number | null): ScheduleEntry => ({
	from,
	limitMinor,
});
const rules = (
	schedule: ScheduleEntry[],
	overrides: { month: string; limitMinor: number | null }[] = [],
): BudgetRules => ({ schedule, overrides });

/** A deep copy, to prove a function left its input alone. */
const snapshot = (value: BudgetRules) =>
	JSON.parse(JSON.stringify(value)) as BudgetRules;

describe("scheduleEntryIn", () => {
	test("is null before the first entry and with no schedule", () => {
		expect(scheduleEntryIn(FOOD.schedule, "2026-08")).toBeNull();
		expect(scheduleEntryIn([], "2026-11")).toBeNull();
	});

	test("is the entry from its own month, and carries forward", () => {
		expect(scheduleEntryIn(FOOD.schedule, "2026-09")).toEqual(
			entry("2026-09", 600000),
		);
		expect(scheduleEntryIn(FOOD.schedule, "2026-10")).toEqual(
			entry("2026-10", 500000),
		);
		expect(scheduleEntryIn(FOOD.schedule, "2026-11")).toEqual(
			entry("2026-10", 500000),
		);
		expect(scheduleEntryIn(FOOD.schedule, "2099-12")).toEqual(
			entry("2026-10", 500000),
		);
	});

	test("returns a stop entry like any other", () => {
		const stopped = [entry("2026-09", 100000), entry("2026-11", null)];
		expect(scheduleEntryIn(stopped, "2026-12")).toEqual(entry("2026-11", null));
	});
});

describe("limitIn and limitSource (BR-F04-02)", () => {
	// Golden: September uses 6,000.00 and November inherits 5,000.00.
	test("golden food: none before September, 6,000.00, then 5,000.00 carried forward", () => {
		expect(limitIn(FOOD, "2026-08")).toBeNull();
		expect(limitIn(FOOD, "2026-09")).toBe(600000);
		expect(limitIn(FOOD, "2026-10")).toBe(500000);
		expect(limitIn(FOOD, "2026-11")).toBe(500000);
		expect(limitIn(FOOD, "2030-01")).toBe(500000);
	});

	test("the source names the schedule entry in force", () => {
		expect(limitSource(FOOD, "2026-09")).toEqual({
			kind: "schedule",
			from: "2026-09",
			limitMinor: 600000,
		});
		expect(limitSource(FOOD, "2026-11")).toEqual({
			kind: "schedule",
			from: "2026-10",
			limitMinor: 500000,
		});
		expect(limitSource(FOOD, "2026-08")).toBeNull();
	});

	test("a one-month limit decides its month only", () => {
		const raised = rules(FOOD.schedule.slice(), [
			{ month: "2026-10", limitMinor: 800000 },
		]);
		expect(limitIn(raised, "2026-10")).toBe(800000);
		expect(limitSource(raised, "2026-10")).toEqual({
			kind: "override",
			month: "2026-10",
			limitMinor: 800000,
		});
		expect(limitIn(raised, "2026-09")).toBe(600000);
		expect(limitIn(raised, "2026-11")).toBe(500000);
	});

	test("a null one-month limit removes its month's limit", () => {
		const skipped = rules(ENTERTAINMENT.schedule.slice(), [
			{ month: "2026-10", limitMinor: null },
		]);
		expect(limitIn(skipped, "2026-10")).toBeNull();
		expect(limitSource(skipped, "2026-10")).toEqual({
			kind: "override",
			month: "2026-10",
			limitMinor: null,
		});
		expect(limitIn(skipped, "2026-11")).toBe(100000);
	});

	test("a one-month limit gives a month before the first entry, or a stopped one, a limit", () => {
		const early = rules(TRANSPORTATION.schedule.slice(), [
			{ month: "2026-09", limitMinor: 50000 },
		]);
		expect(limitIn(early, "2026-09")).toBe(50000);
		const stopped = rules(
			[entry("2026-09", 100000), entry("2026-11", null)],
			[{ month: "2026-12", limitMinor: 150000 }],
		);
		expect(limitIn(stopped, "2026-11")).toBeNull();
		expect(limitIn(stopped, "2026-12")).toBe(150000);
		expect(limitIn(stopped, "2027-01")).toBeNull();
	});

	test("a stop entry gives no limit from its month on", () => {
		const stopped = rules([entry("2026-09", 100000), entry("2026-11", null)]);
		expect(limitIn(stopped, "2026-10")).toBe(100000);
		expect(limitIn(stopped, "2026-11")).toBeNull();
		expect(limitSource(stopped, "2026-12")).toEqual({
			kind: "schedule",
			from: "2026-11",
			limitMinor: null,
		});
	});
});

describe("nextEntry (F04 section 3)", () => {
	test("is the first schedule entry after the month", () => {
		expect(nextEntry(FOOD, "2026-09")).toEqual(entry("2026-10", 500000));
		expect(nextEntry(FOOD, "2026-08")).toEqual(entry("2026-09", 600000));
	});

	test("is null after the last entry, and in the last entry's own month", () => {
		expect(nextEntry(FOOD, "2026-10")).toBeNull();
		expect(nextEntry(FOOD, "2026-11")).toBeNull();
	});

	test("counts a stop as the next entry", () => {
		const stopping = rules([entry("2026-09", 100000), entry("2026-12", null)]);
		expect(nextEntry(stopping, "2026-11")).toEqual(entry("2026-12", null));
	});

	test("ignores one-month limits", () => {
		const raised = rules(FOOD.schedule.slice(), [
			{ month: "2026-12", limitMinor: 1 },
		]);
		expect(nextEntry(raised, "2026-11")).toBeNull();
	});
});

describe("normalizeSchedule (BR-F04-05)", () => {
	// AC-F04-05
	test("removes an entry that repeats the previous limit", () => {
		expect(
			normalizeSchedule([...FOOD.schedule, entry("2026-11", 500000)]),
		).toEqual(FOOD.schedule);
	});

	// AC-F04-05
	test("removes a leading null", () => {
		expect(
			normalizeSchedule([entry("2026-08", null), entry("2026-09", 600000)]),
		).toEqual([entry("2026-09", 600000)]);
	});

	test("removes every leading null, and a null after a null", () => {
		expect(
			normalizeSchedule([
				entry("2026-07", null),
				entry("2026-08", null),
				entry("2026-09", 600000),
				entry("2026-10", null),
				entry("2026-11", null),
				entry("2027-01", 400000),
			]),
		).toEqual([
			entry("2026-09", 600000),
			entry("2026-10", null),
			entry("2027-01", 400000),
		]);
	});

	test("keeps a change back to an earlier limit that is not a neighbor's", () => {
		const back = [
			entry("2026-09", 600000),
			entry("2026-10", 500000),
			entry("2026-11", 600000),
		];
		expect(normalizeSchedule(back)).toEqual(back);
	});

	test("sorts entries by month first", () => {
		expect(
			normalizeSchedule([entry("2026-10", 500000), entry("2026-09", 600000)]),
		).toEqual(FOOD.schedule);
	});

	test("leaves nothing of an empty schedule, or of nulls alone", () => {
		expect(normalizeSchedule([])).toEqual([]);
		expect(
			normalizeSchedule([entry("2026-09", null), entry("2026-10", null)]),
		).toEqual([]);
	});

	test("returns new entries with only from and limitMinor, and leaves its input alone", () => {
		const input = [
			{ ...entry("2026-09", 600000), extra: true } as ScheduleEntry,
		];
		const result = normalizeSchedule(input);
		expect(result).toEqual([entry("2026-09", 600000)]);
		expect(Object.keys(result[0] as object)).toEqual(["from", "limitMinor"]);
		expect(result[0]).not.toBe(input[0]);
		expect(input).toEqual([{ ...entry("2026-09", 600000), extra: true }]);
	});
});

describe("setFrom (BR-F04-03, BR-F04-04)", () => {
	// AC-F04-03: food at 7,000.00 from 2026-09 replaces the October entry.
	test("replaces every entry from the month on with one", () => {
		expect(setFrom(FOOD, "2026-09", 700000).schedule).toEqual([
			entry("2026-09", 700000),
		]);
	});

	test("adds an entry for a later month and keeps earlier ones", () => {
		expect(setFrom(FOOD, "2026-12", 700000).schedule).toEqual([
			...FOOD.schedule,
			entry("2026-12", 700000),
		]);
	});

	test("replaces an entry in its own month", () => {
		expect(setFrom(FOOD, "2026-10", 450000).schedule).toEqual([
			entry("2026-09", 600000),
			entry("2026-10", 450000),
		]);
	});

	test("a month before the first entry makes it the only one", () => {
		expect(setFrom(FOOD, "2023-11", 400000).schedule).toEqual([
			entry("2023-11", 400000),
		]);
	});

	// AC-F04-05: 5,000.00 from 2026-11 on a schedule already at 5,000.00 adds no entry.
	test("a limit equal to the one in force adds nothing", () => {
		expect(setFrom(FOOD, "2026-11", 500000)).toEqual(FOOD);
	});

	test("going back to the previous entry's limit merges the two", () => {
		expect(setFrom(FOOD, "2026-10", 600000).schedule).toEqual([
			entry("2026-09", 600000),
		]);
	});

	// F04 section 5, Stopping.
	test("stopping adds a null entry and keeps earlier months", () => {
		const stopped = setFrom(ENTERTAINMENT, "2026-11", null);
		expect(stopped.schedule).toEqual([
			entry("2026-09", 100000),
			entry("2026-11", null),
		]);
		expect(limitIn(stopped, "2026-10")).toBe(100000);
		expect(limitIn(stopped, "2026-11")).toBeNull();
	});

	// F04 section 13: stopped from November, set again from February.
	test("a limit after a stop restarts the Budget", () => {
		const restarted = setFrom(setFrom(FOOD, "2026-11", null), "2027-02", 400000);
		expect(restarted.schedule).toEqual([
			...FOOD.schedule,
			entry("2026-11", null),
			entry("2027-02", 400000),
		]);
		expect(limitIn(restarted, "2026-12")).toBeNull();
		expect(limitIn(restarted, "2027-01")).toBeNull();
		expect(limitIn(restarted, "2027-02")).toBe(400000);
	});

	test("stopping again after a stop changes nothing", () => {
		const stopped = setFrom(ENTERTAINMENT, "2026-11", null);
		expect(setFrom(stopped, "2027-01", null)).toEqual(stopped);
	});

	test("a limit at the stop month replaces the stop", () => {
		const stopped = setFrom(ENTERTAINMENT, "2026-11", null);
		expect(setFrom(stopped, "2026-11", 120000).schedule).toEqual([
			entry("2026-09", 100000),
			entry("2026-11", 120000),
		]);
	});

	test("keeps every one-month limit, those at or after the month included (BR-F04-25)", () => {
		const raised = rules(FOOD.schedule.slice(), [
			{ month: "2026-12", limitMinor: 900000 },
			{ month: "2026-10", limitMinor: 800000 },
		]);
		const changed = setFrom(raised, "2026-09", 700000);
		expect(changed.overrides).toEqual([
			{ month: "2026-10", limitMinor: 800000 },
			{ month: "2026-12", limitMinor: 900000 },
		]);
		expect(limitIn(changed, "2026-10")).toBe(800000);
		expect(limitIn(changed, "2026-11")).toBe(700000);
	});

	test("leaves its input alone", () => {
		const before = snapshot(FOOD);
		setFrom(FOOD, "2026-09", 700000);
		expect(FOOD).toEqual(before);
	});
});

describe("stopRemovesEveryMonth (BR-F04-04)", () => {
	// AC-F04-04: stopping entertainment from 2026-09, its first month, is refused.
	test("is true at or before the first entry", () => {
		expect(stopRemovesEveryMonth(ENTERTAINMENT.schedule, "2026-09")).toBe(true);
		expect(stopRemovesEveryMonth(ENTERTAINMENT.schedule, "2026-08")).toBe(true);
		expect(stopRemovesEveryMonth(ENTERTAINMENT.schedule, "2023-11")).toBe(true);
	});

	test("is false after the first entry", () => {
		expect(stopRemovesEveryMonth(ENTERTAINMENT.schedule, "2026-10")).toBe(false);
		expect(stopRemovesEveryMonth(FOOD.schedule, "2026-10")).toBe(false);
	});

	test("is true with no schedule", () => {
		expect(stopRemovesEveryMonth([], "2026-11")).toBe(true);
	});
});

describe("setMonth (BR-F04-24, BR-F04-25)", () => {
	// AC-F04-14
	test("sets a limit for one month and leaves the schedule alone", () => {
		const raised = setMonth(FOOD, "2026-10", 800000);
		expect(raised.schedule).toEqual(FOOD.schedule);
		expect(raised.overrides).toEqual([{ month: "2026-10", limitMinor: 800000 }]);
	});

	// AC-F04-16: 5,000.00 for 2026-11 on golden food stores nothing.
	test("a limit equal to the schedule's stores nothing", () => {
		expect(setMonth(FOOD, "2026-11", 500000)).toEqual(FOOD);
	});

	// AC-F04-15
	test("stores a null for a month the schedule budgets", () => {
		expect(setMonth(ENTERTAINMENT, "2026-10", null).overrides).toEqual([
			{ month: "2026-10", limitMinor: null },
		]);
	});

	test("stores no null for a month the schedule doesn't budget", () => {
		expect(setMonth(TRANSPORTATION, "2026-09", null)).toEqual(TRANSPORTATION);
		const stopped = setFrom(ENTERTAINMENT, "2026-11", null);
		expect(setMonth(stopped, "2026-12", null)).toEqual(stopped);
	});

	test("replaces the month's own one-month limit", () => {
		const raised = setMonth(FOOD, "2026-10", 800000);
		expect(setMonth(raised, "2026-10", 900000).overrides).toEqual([
			{ month: "2026-10", limitMinor: 900000 },
		]);
	});

	test("setting the schedule's limit removes the month's one-month limit", () => {
		const raised = setMonth(FOOD, "2026-10", 800000);
		expect(setMonth(raised, "2026-10", 500000)).toEqual(FOOD);
	});

	test("keeps other months' one-month limits, in month order", () => {
		const two = setMonth(setMonth(FOOD, "2026-12", 900000), "2026-10", 800000);
		expect(two.overrides).toEqual([
			{ month: "2026-10", limitMinor: 800000 },
			{ month: "2026-12", limitMinor: 900000 },
		]);
	});

	test("compares with the schedule, not with another one-month limit", () => {
		const raised = setMonth(FOOD, "2026-11", 900000);
		expect(setMonth(raised, "2026-11", 900000).overrides).toEqual([
			{ month: "2026-11", limitMinor: 900000 },
		]);
	});

	test("leaves its input alone", () => {
		const before = snapshot(FOOD);
		setMonth(FOOD, "2026-10", 800000);
		expect(FOOD).toEqual(before);
	});
});

describe("removeMonth (BR-F04-25)", () => {
	test("removes one month's one-month limit and keeps the rest", () => {
		const two = setMonth(setMonth(FOOD, "2026-12", 900000), "2026-10", 800000);
		expect(removeMonth(two, "2026-10")).toEqual(
			setMonth(FOOD, "2026-12", 900000),
		);
	});

	test("is null when the month has none", () => {
		expect(removeMonth(FOOD, "2026-10")).toBeNull();
		expect(removeMonth(setMonth(FOOD, "2026-12", 900000), "2026-10")).toBeNull();
	});

	test("removes a null one-month limit too", () => {
		const skipped = setMonth(ENTERTAINMENT, "2026-10", null);
		expect(removeMonth(skipped, "2026-10")).toEqual(ENTERTAINMENT);
	});
});

describe("sameRules (BR-F04-36)", () => {
	test("is true for equal rules", () => {
		expect(sameRules(FOOD, snapshot(FOOD))).toBe(true);
	});

	test("is false when a limit, a month or the number of entries differs", () => {
		expect(sameRules(FOOD, setFrom(FOOD, "2026-10", 450000))).toBe(false);
		expect(
			sameRules(
				FOOD,
				rules([entry("2026-09", 600000), entry("2026-11", 500000)]),
			),
		).toBe(false);
		expect(sameRules(FOOD, rules([entry("2026-09", 600000)]))).toBe(false);
	});

	test("compares one-month limits, in any order", () => {
		const a = rules(FOOD.schedule.slice(), [
			{ month: "2026-10", limitMinor: 800000 },
			{ month: "2026-12", limitMinor: null },
		]);
		const b = rules(FOOD.schedule.slice(), [
			{ month: "2026-12", limitMinor: null },
			{ month: "2026-10", limitMinor: 800000 },
		]);
		expect(sameRules(a, b)).toBe(true);
		expect(sameRules(a, FOOD)).toBe(false);
		expect(sameRules(a, setMonth(a, "2026-12", 1))).toBe(false);
	});

	test("tells a null limit from a missing one-month limit", () => {
		expect(
			sameRules(
				ENTERTAINMENT,
				rules(ENTERTAINMENT.schedule.slice(), [
					{ month: "2026-10", limitMinor: null },
				]),
			),
		).toBe(false);
	});
});

describe("changeCount (BR-F04-06)", () => {
	test("counts schedule entries and one-month limits", () => {
		expect(changeCount(FOOD)).toBe(2);
		expect(changeCount(ENTERTAINMENT)).toBe(1);
		expect(changeCount(setMonth(ENTERTAINMENT, "2026-10", null))).toBe(2);
	});
});

describe("utilizationTenths (BR-F04-08)", () => {
	// AC-F04-06
	test("rounds half away from zero at the 80% boundary", () => {
		expect(utilizationTenths(239850, 300000)).toBe(800);
		expect(utilizationTenths(239849, 300000)).toBe(799);
	});

	// AC-F04-06
	test("is negative for negative spending", () => {
		expect(utilizationTenths(-100000, 1000000)).toBe(-100);
		expect(utilizationTenths(-239850, 300000)).toBe(-800);
	});

	test("gives section 5's golden values", () => {
		expect(utilizationTenths(505000, 600000)).toBe(842);
		expect(utilizationTenths(240000, 300000)).toBe(800);
		expect(utilizationTenths(64900, 100000)).toBe(649);
		expect(utilizationTenths(622000, 500000)).toBe(1244);
		expect(utilizationTenths(300000, 300000)).toBe(1000);
		expect(utilizationTenths(214800, 100000)).toBe(2148);
		expect(utilizationTenths(180000, 200000)).toBe(900);
		expect(utilizationTenths(42000, 500000)).toBe(84);
		expect(utilizationTenths(809900, 1000000)).toBe(810);
		expect(utilizationTenths(1316800, 1100000)).toBe(1197);
		expect(utilizationTenths(42000, 1100000)).toBe(38);
	});

	test("is 0 for nothing spent, and never −0", () => {
		expect(utilizationTenths(0, 500000)).toBe(0);
		expect(Object.is(utilizationTenths(-1, 500000), 0)).toBe(true);
	});

	test("stays exact for the largest amounts", () => {
		expect(utilizationTenths(99999999999, 1)).toBe(99999999999000);
		expect(utilizationTenths(1, 99999999999)).toBe(0);
		expect(utilizationTenths(99999999999, 99999999999)).toBe(1000);
	});
});

describe("budgetState and stateLabel (BR-F04-09)", () => {
	test.each([
		[-500, "ok", "ok"],
		[0, "ok", "ok"],
		[799, "ok", "ok"],
		[800, "warning", "warning"],
		[999, "warning", "warning"],
		[1000, "over", "at"],
		[1001, "over", "over"],
		[2148, "over", "over"],
	] as const)("%i tenths is %s, labeled %s", (tenths, state, label) => {
		expect(budgetState(tenths)).toBe(state);
		expect(stateLabel(tenths)).toBe(label);
	});

	// AC-F04-23
	test("labels read as F04 section 3 says", () => {
		expect(STATE_LABELS[stateLabel(1000)]).toBe("At limit");
		expect(STATE_LABELS[stateLabel(1001)]).toBe("Over budget");
		expect(STATE_LABELS[stateLabel(999)]).toBe("Nearing limit");
		expect(STATE_LABELS[stateLabel(799)]).toBe("On track");
	});
});

describe("inactiveStatus (BR-F04-34)", () => {
	test("is null in a month with a limit", () => {
		expect(inactiveStatus(FOOD, "2026-10")).toBeNull();
	});

	// AC-F04-13: golden transportation in September.
	test("a Budget that starts later reads starts, with its first month", () => {
		expect(inactiveStatus(TRANSPORTATION, "2026-09")).toEqual({
			status: "starts",
			from: "2026-10",
		});
	});

	// AC-F04-27
	test("a stopped Budget reads stopped, with the month it starts again", () => {
		const restarted = rules([
			entry("2026-09", 600000),
			entry("2026-11", null),
			entry("2027-02", 400000),
		]);
		expect(inactiveStatus(restarted, "2026-12")).toEqual({
			status: "stopped",
			from: "2026-11",
			restartsFrom: "2027-02",
		});
		expect(inactiveStatus(restarted, "2026-11")).toEqual({
			status: "stopped",
			from: "2026-11",
			restartsFrom: "2027-02",
		});
		expect(inactiveStatus(restarted, "2027-02")).toBeNull();
	});

	test("a stop with no later limit has no restart month", () => {
		expect(
			inactiveStatus(setFrom(ENTERTAINMENT, "2026-11", null), "2026-12"),
		).toEqual({
			status: "stopped",
			from: "2026-11",
			restartsFrom: null,
		});
	});

	test("restarts from the next entry with a limit, past a later stop", () => {
		const twice = rules([
			entry("2026-01", 100000),
			entry("2026-03", null),
			entry("2026-06", 100000),
			entry("2026-09", null),
		]);
		expect(inactiveStatus(twice, "2026-04")).toEqual({
			status: "stopped",
			from: "2026-03",
			restartsFrom: "2026-06",
		});
	});

	test("a null one-month limit reads skipped", () => {
		expect(
			inactiveStatus(setMonth(ENTERTAINMENT, "2026-10", null), "2026-10"),
		).toEqual({
			status: "skipped",
		});
	});

	test("a one-month limit in a stopped month makes it active", () => {
		const stopped = setFrom(ENTERTAINMENT, "2026-11", null);
		expect(
			inactiveStatus(setMonth(stopped, "2026-12", 150000), "2026-12"),
		).toBeNull();
	});
});

test("categoryOrder follows CAT-2", () => {
	expect(EXPENSE_CATEGORIES.map(categoryOrder)).toEqual(
		EXPENSE_CATEGORIES.map((_, index) => index),
	);
	expect(categoryOrder("food")).toBeLessThan(categoryOrder("entertainment"));
});
