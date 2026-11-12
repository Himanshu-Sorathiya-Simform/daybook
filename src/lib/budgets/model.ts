import { compareCodeUnits } from "@/lib/compare";
import { EXPENSE_CATEGORIES } from "@/lib/categories";
import { percentTenths } from "@/lib/money";

import type { Month } from "./months";

/** A category a Budget can hold (CAT-2). */
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

/** One limit change: `limitMinor` from `from` onward, or `null` for "stopped from this month"
 * (F04 section 3). */
export type ScheduleEntry = { from: Month; limitMinor: number | null };

/** A one-month limit: `limitMinor` for `month` alone, or `null` for "no limit this month
 * only" (BR-F04-24). */
export type MonthLimit = { month: Month; limitMinor: number | null };

/** What decides a Budget's limit in every month: its schedule and its one-month limits. */
export type BudgetRules = {
	schedule: readonly ScheduleEntry[];
	overrides: readonly MonthLimit[];
};

/** What decides month M's limit (BR-F04-02, BR-F04-34). */
export type LimitSource =
	| { kind: "schedule"; from: Month; limitMinor: number | null }
	| { kind: "override"; month: Month; limitMinor: number | null };

/** The schedule entry in force in `month`: the last one from `month` or earlier, or `null`
 * before the first. */
export function scheduleEntryIn(
	schedule: readonly ScheduleEntry[],
	month: Month,
): ScheduleEntry | null {
	let found: ScheduleEntry | null = null;
	for (const entry of schedule) {
		if (entry.from <= month) found = entry;
	}
	return found;
}

/** What decides `month`'s limit: its one-month limit if it has one, else the schedule entry in
 * force, else `null` (before the first entry). */
export function limitSource(rules: BudgetRules, month: Month): LimitSource | null {
	const override = rules.overrides.find((each) => each.month === month);
	if (override) {
		return { kind: "override", month, limitMinor: override.limitMinor };
	}
	const entry = scheduleEntryIn(rules.schedule, month);
	return entry ? { kind: "schedule", ...entry } : null;
}

/** `month`'s limit, or `null` when the category has no Budget that month (BR-F04-02). */
export function limitIn(rules: BudgetRules, month: Month): number | null {
	return limitSource(rules, month)?.limitMinor ?? null;
}

/** The first schedule entry after `month`, or `null` (F04 section 3, Next). */
export function nextEntry(rules: BudgetRules, month: Month): ScheduleEntry | null {
	return rules.schedule.find((entry) => entry.from > month) ?? null;
}

/** BR-F04-05: in month order, entries that repeat the previous entry's limit are removed, and
 * so is a `null` that comes first. The result starts with a limit and never holds two equal
 * neighbors. */
export function normalizeSchedule(
	schedule: readonly ScheduleEntry[],
): ScheduleEntry[] {
	const sorted = [...schedule].sort((a, b) => compareCodeUnits(a.from, b.from));
	const result: ScheduleEntry[] = [];
	for (const entry of sorted) {
		const previous = result.at(-1);
		if (previous === undefined && entry.limitMinor === null) continue;
		if (previous?.limitMinor === entry.limitMinor) continue;
		result.push({ from: entry.from, limitMinor: entry.limitMinor });
	}
	return result;
}

function sortOverrides(overrides: readonly MonthLimit[]): MonthLimit[] {
	return [...overrides]
		.sort((a, b) => compareCodeUnits(a.month, b.month))
		.map(({ month, limitMinor }) => ({ month, limitMinor }));
}

/** Whether stopping "from `from`" would leave no month with a limit (BR-F04-04): `from` is at
 * or before the first entry, or there is no schedule. */
export function stopRemovesEveryMonth(
	schedule: readonly ScheduleEntry[],
	from: Month,
): boolean {
	const first = schedule[0];
	return first === undefined || from <= first.from;
}

/** A change "from `from` onward" (BR-F04-03, BR-F04-04): every entry from `from` on is
 * replaced by one, then the schedule is normalized. One-month limits stay as they are
 * (BR-F04-25). A stop that would remove every month is the caller's to refuse first. */
export function setFrom(
	rules: BudgetRules,
	from: Month,
	limitMinor: number | null,
): BudgetRules {
	return {
		schedule: normalizeSchedule([
			...rules.schedule.filter((entry) => entry.from < from),
			{ from, limitMinor },
		]),
		overrides: sortOverrides(rules.overrides),
	};
}

/** A one-month limit for `month` (BR-F04-24, BR-F04-25): set, or removed instead when it
 * equals what the schedule gives that month. The schedule stays as it is. */
export function setMonth(
	rules: BudgetRules,
	month: Month,
	limitMinor: number | null,
): BudgetRules {
	const others = rules.overrides.filter((each) => each.month !== month);
	const fromSchedule = scheduleEntryIn(rules.schedule, month)?.limitMinor ?? null;
	return {
		schedule: rules.schedule.map(({ from, limitMinor: limit }) => ({
			from,
			limitMinor: limit,
		})),
		overrides: sortOverrides(
			fromSchedule === limitMinor ? others : (
				[...others, { month, limitMinor }]
			),
		),
	};
}

/** The rules without `month`'s one-month limit, or `null` when it has none (BR-F04-25). */
export function removeMonth(rules: BudgetRules, month: Month): BudgetRules | null {
	if (!rules.overrides.some((each) => each.month === month)) return null;
	return {
		schedule: rules.schedule.map(({ from, limitMinor }) => ({
			from,
			limitMinor,
		})),
		overrides: sortOverrides(
			rules.overrides.filter((each) => each.month !== month),
		),
	};
}

/** Whether two sets of rules are the same: a write between them changes nothing
 * (BR-F04-36). */
export function sameRules(a: BudgetRules, b: BudgetRules): boolean {
	const same = <T extends object>(
		x: readonly T[],
		y: readonly T[],
		keys: (keyof T)[],
	) =>
		x.length === y.length
		&& x.every((item, index) =>
			keys.every((key) => item[key] === y[index]?.[key]),
		);
	return (
		same(a.schedule, b.schedule, ["from", "limitMinor"])
		&& same(sortOverrides(a.overrides), sortOverrides(b.overrides), [
			"month",
			"limitMinor",
		])
	);
}

/** How many changes the Delete confirmation counts: schedule entries plus one-month limits
 * (BR-F04-06). */
export function changeCount(rules: BudgetRules): number {
	return rules.schedule.length + rules.overrides.length;
}

/** Spent ÷ limit in tenths of a percent, rounded half away from zero (BR-F04-08). A negative
 * spent gives a negative value. */
export function utilizationTenths(spentMinor: number, limitMinor: number): number {
	return percentTenths(spentMinor, limitMinor);
}

export type BudgetState = "ok" | "warning" | "over";

/** The state from the rounded value (BR-F04-09, D-248): `warning` from 800, `over` from
 * 1000. */
export function budgetState(tenths: number): BudgetState {
	if (tenths >= 1000) return "over";
	return tenths >= 800 ? "warning" : "ok";
}

/** What a state reads as: `at` is the state `over` at exactly 1000 (BR-F04-09). */
export type StateLabel = "ok" | "warning" | "at" | "over";

export function stateLabel(tenths: number): StateLabel {
	return tenths === 1000 ? "at" : budgetState(tenths);
}

/** F04 section 3's labels. */
export const STATE_LABELS = {
	ok: "On track",
	warning: "Nearing limit",
	at: "At limit",
	over: "Over budget",
} as const satisfies Record<StateLabel, string>;

/** Why a Budget record has no limit in M (BR-F04-34). */
export type InactiveStatus =
	| { status: "starts"; from: Month }
	| { status: "stopped"; from: Month; restartsFrom: Month | null }
	| { status: "skipped" };

/** Why `rules` give no limit in `month`, or `null` when they do. */
export function inactiveStatus(
	rules: BudgetRules,
	month: Month,
): InactiveStatus | null {
	const source = limitSource(rules, month);
	if (source?.limitMinor != null) return null;
	if (source?.kind === "override") return { status: "skipped" };
	if (source === null) {
		return { status: "starts", from: (rules.schedule[0] as ScheduleEntry).from };
	}
	const restart = rules.schedule.find(
		(entry) => entry.from > month && entry.limitMinor !== null,
	);
	return {
		status: "stopped",
		from: source.from,
		restartsFrom: restart?.from ?? null,
	};
}

/** A category's place in CAT-2's order, for stable ties. */
export function categoryOrder(category: ExpenseCategory): number {
	return EXPENSE_CATEGORIES.indexOf(category);
}
