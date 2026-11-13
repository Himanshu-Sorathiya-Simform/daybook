import {
	type BudgetRules,
	limitIn,
	type MonthLimit,
	sameRules,
	type ScheduleEntry,
	setFrom,
	setMonth,
	stopRemovesEveryMonth,
	utilizationTenths,
} from "./model";
import {
	inRange,
	type Month,
	monthRange,
	monthsFrom,
	monthsStarting,
	shiftMonth,
} from "./months";

/** A change the dialog previews: from a month onward, or for one month (BR-F04-20,
 * BR-F04-21). `limitMinor: null` stops. */
export type BudgetChange = {
	scope: "from" | "month";
	month: Month;
	limitMinor: number | null;
};

/** One month of the preview: its limit before and after, its spending, and the utilization of
 * each limit (`null` without a limit). */
export type PreviewMonth = {
	month: Month;
	oldLimitMinor: number | null;
	newLimitMinor: number | null;
	spentMinor: number;
	oldTenths: number | null;
	newTenths: number | null;
	changed: boolean;
};

/** Consecutive months with the same old limit, new limit and spending, as one row of "Months
 * that change" (BR-F04-26). */
export type PreviewGroup = Omit<PreviewMonth, "month"> & {
	first: Month;
	last: Month;
	count: number;
};

/** BR-F04-27's notes, in order, as data; the page writes their text. */
export type PreviewNote =
	| { kind: "stopKeepsEarlier"; movesToUnbudgeted: boolean }
	| { kind: "oneMonth"; month: Month }
	| { kind: "retroactive"; months: Month[] }
	| { kind: "gains"; count: number }
	| { kind: "replaces"; entries: ScheduleEntry[] }
	| { kind: "keeps"; months: Month[] };

export type BudgetPreview =
	| { blocked: true }
	| {
			blocked: false;
			/** The Budget's rules after the change. */
			next: BudgetRules;
			/** The change leaves the Budget as it is: Save is disabled (BR-F04-27). */
			unchanged: boolean;
			months: PreviewMonth[];
			groups: PreviewGroup[];
			/** The month after the last listed one and its limit, "carries on until you change
			 * it", for a change from a month onward; `null` for one month. */
			tail: { month: Month; limitMinor: number | null } | null;
			replaced: ScheduleEntry[];
			keptOverrides: MonthLimit[];
			notes: PreviewNote[];
	  };

const NO_RULES: BudgetRules = { schedule: [], overrides: [] };

/** The months the preview lists (BR-F04-26): from a month onward, M to the current month, or
 * M alone when M is later; for one month, M − 1, M and M + 1 inside the range. */
function listedMonths(change: BudgetChange, current: Month): Month[] {
	const { month } = change;
	if (change.scope === "month") {
		const range = monthRange(current);
		return [shiftMonth(month, -1), month, shiftMonth(month, 1)].filter((each) =>
			inRange(each, range),
		);
	}
	const count = month > current ? 1 : monthsFrom(month, current) + 1;
	return monthsStarting(month, count);
}

function groupMonths(months: readonly PreviewMonth[]): PreviewGroup[] {
	const groups: PreviewGroup[] = [];
	for (const { month, ...rest } of months) {
		const last = groups.at(-1);
		if (
			last?.oldLimitMinor === rest.oldLimitMinor
			&& last.newLimitMinor === rest.newLimitMinor
			&& last.spentMinor === rest.spentMinor
		) {
			last.last = month;
			last.count += 1;
		} else {
			groups.push({ ...rest, first: month, last: month, count: 1 });
		}
	}
	return groups;
}

const tenthsOf = (spent: number, limit: number | null) =>
	limit === null ? null : utilizationTenths(spent, limit);

/** BR-F04-27's notes for a change, in the order the spec lists them. `hasRecord` is whether the
 * category has a Budget record; `replaced` and `keptOverrides` are empty for one month. */
function previewNotes(input: {
	change: BudgetChange;
	hasRecord: boolean;
	months: readonly PreviewMonth[];
	replaced: ScheduleEntry[];
	keptOverrides: readonly MonthLimit[];
	spending: (month: Month) => number;
	current: Month;
}): PreviewNote[] {
	const { change, months, replaced, keptOverrides, current } = input;
	const onward = change.scope === "from";
	const stop = change.limitMinor === null;
	const notes: PreviewNote[] = [];
	if (onward && stop) {
		notes.push({
			kind: "stopKeepsEarlier",
			movesToUnbudgeted: input.spending(change.month) !== 0,
		});
	}
	if (!onward) notes.push({ kind: "oneMonth", month: change.month });
	const retroactive = months
		.filter((each) => each.changed && each.month < current)
		.map((each) => each.month);
	if (onward && retroactive.length > 0) {
		notes.push({ kind: "retroactive", months: retroactive });
	}
	const gains = months.filter(
		(each) => each.oldLimitMinor === null && each.newLimitMinor !== null,
	).length;
	if (input.hasRecord && !stop && gains > 0) {
		notes.push({ kind: "gains", count: gains });
	}
	if (replaced.length > 0) notes.push({ kind: "replaces", entries: replaced });
	if (keptOverrides.length > 0) {
		notes.push({
			kind: "keeps",
			months: keptOverrides.map((each) => each.month),
		});
	}
	return notes;
}

/**
 * What a change does to every month it touches (BR-F04-26, BR-F04-27, D-564). `rules` is the
 * Budget record, or `null` for a category without one; `spending` gives the category's
 * spending in a month (the history endpoint's); `current` is the user's current month. A stop
 * from a month onward at or before the first entry is `blocked` (BR-F04-21). A one-month
 * change needs a Budget record (BR-F04-24).
 */
export function previewChange(input: {
	rules: BudgetRules | null;
	change: BudgetChange;
	spending: (month: Month) => number;
	current: Month;
}): BudgetPreview {
	const { change, spending, current } = input;
	const base = input.rules ?? NO_RULES;
	const stop = change.limitMinor === null;
	if (change.scope === "month" && input.rules === null) {
		throw new Error("A one-month limit needs a Budget record (BR-F04-24).");
	}
	if (
		change.scope === "from"
		&& stop
		&& stopRemovesEveryMonth(base.schedule, change.month)
	) {
		return { blocked: true };
	}

	const next =
		change.scope === "from" ?
			setFrom(base, change.month, change.limitMinor)
		:	setMonth(base, change.month, change.limitMinor);
	const months = listedMonths(change, current).map((month): PreviewMonth => {
		const spentMinor = spending(month);
		const oldLimitMinor = limitIn(base, month);
		const newLimitMinor = limitIn(next, month);
		return {
			month,
			oldLimitMinor,
			newLimitMinor,
			spentMinor,
			oldTenths: tenthsOf(spentMinor, oldLimitMinor),
			newTenths: tenthsOf(spentMinor, newLimitMinor),
			changed: oldLimitMinor !== newLimitMinor,
		};
	});

	const onward = change.scope === "from";
	const replaced =
		onward ? base.schedule.filter((entry) => entry.from > change.month) : [];
	const keptOverrides =
		onward ? base.overrides.filter((each) => each.month >= change.month) : [];
	// From a month onward, the last listed month is M or the current month, whichever is later.
	const tailMonth = shiftMonth(change.month > current ? change.month : current, 1);
	const notes = previewNotes({
		change,
		hasRecord: input.rules !== null,
		months,
		replaced,
		keptOverrides,
		spending,
		current,
	});

	return {
		blocked: false,
		next,
		unchanged: input.rules !== null && sameRules(next, base),
		months,
		groups: groupMonths(months),
		tail:
			onward ?
				{ month: tailMonth, limitMinor: limitIn(next, tailMonth) }
			:	null,
		replaced: replaced.map(({ from, limitMinor }) => ({ from, limitMinor })),
		keptOverrides: keptOverrides.map(({ month, limitMinor }) => ({
			month,
			limitMinor,
		})),
		notes,
	};
}
