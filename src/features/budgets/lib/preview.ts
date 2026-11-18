import {
	type ExpenseCategory,
	STATE_LABELS,
	type StateLabel,
	stateLabel,
} from "@/lib/budgets/model";
import { type Month, monthsFrom, shiftMonth } from "@/lib/budgets/months";
import type {
	BudgetChange,
	PreviewGroup,
	PreviewMonth,
	PreviewNote,
} from "@/lib/budgets/preview";
import { categoryLabel } from "@/lib/categories";
import { formatMonth } from "@/lib/date-format";
import { formatMoney } from "@/lib/money";
import { monthName } from "./dialog";
import { type Formats, percentOf } from "./labels";

const money = (minor: number, f: Formats) =>
	formatMoney(minor, f.currency, f.numberLocale);

const long = (month: Month, f: Formats) => formatMonth(month, f, "long");
const short = (month: Month, f: Formats) => formatMonth(month, f, "short");

/** The preview's own words (BR-F04-26). */
export const PREVIEW_TEXT = {
	heading: "What changes",
	noBudget: "No Budget",
	movesToUnbudgeted: "Moves to Not budgeted",
	nothingSpent: "Nothing spent yet",
	unchanged: "Unchanged",
	backToSchedule: "Back to the schedule",
	keepsOwn: "Keeps its one-month limit",
	carriesOn: "Carries on until you change it",
	carriesOnLower: "carries on until you change it",
	stripCaption:
		"One column per month: spending against the new limit. Black tick: the old limit.",
	tableCaption: "Months that change",
	months: "Months",
	limit: "Limit",
	state: "State",
	showFewer: "Show fewer",
} as const;

/** What the preview knows of the spending: the history is still loading, could not be read
 * (offline included), or is in. Without it each month shows its old and new limit alone
 * (section 10). */
export type Figures = "loading" | "missing" | "ready";

/** What the preview knows, from the history query: `ready` with its data, `missing` when it
 * failed or is paused offline, else `loading`. */
export function figuresOf(history: {
	data: unknown;
	isError: boolean;
	fetchStatus: "fetching" | "paused" | "idle";
}): Figures {
	if (history.data) return "ready";
	return history.isError || history.fetchStatus === "paused" ?
			"missing"
		:	"loading";
}

/** What the preview words a month with: the category, the user's current month, the formats. */
export type PreviewContext = {
	category: ExpenseCategory;
	current: Month;
	formats: Formats;
};

/** A limit as the preview writes it: "₹7,000.00", or "No Budget" without one. */
export function limitText(limitMinor: number | null, f: Formats): string {
	return limitMinor === null ? PREVIEW_TEXT.noBudget : money(limitMinor, f);
}

/** The caption of a change from a month onward: "3 months, then every month after", or "November
 * 2026 and every month after" for one month (BR-F04-26). */
export function onwardCaption(first: Month, count: number, f: Formats): string {
	return count > 1 ?
			`${count} months, then every month after`
		:	`${long(first, f)} and every month after`;
}

/** A month's new state (BR-F04-26): "72.1% · On track", "No Food spending · On track",
 * "Nothing spent yet" for a later month with no spending, "Moves to Not budgeted" for no new
 * limit with spending, or "No Budget". `label` is the state for the colour, `null` without a
 * limit. */
export function newState(
	month: PreviewMonth,
	{ category, current, formats }: PreviewContext,
): { text: string; label: StateLabel | null } {
	if (month.newTenths === null) {
		return {
			text:
				month.spentMinor === 0 ?
					PREVIEW_TEXT.noBudget
				:	PREVIEW_TEXT.movesToUnbudgeted,
			label: null,
		};
	}
	const label = stateLabel(month.newTenths);
	if (month.spentMinor === 0) {
		return {
			label,
			text:
				month.month > current ?
					PREVIEW_TEXT.nothingSpent
				:	`No ${categoryLabel(category)} spending · ${STATE_LABELS[label]}`,
		};
	}
	return {
		label,
		text: `${percentOf(month.newTenths, formats)} · ${STATE_LABELS[label]}`,
	};
}

/** The state a month leaves, shown first when the state changes: "84.2% Nearing limit"
 * (BR-F04-26). `null` when it has no limit before, no spending, or the same state. */
export function oldState(month: PreviewMonth, f: Formats): string | null {
	if (month.oldTenths === null || month.spentMinor === 0) return null;
	const before = stateLabel(month.oldTenths);
	const after = month.newTenths === null ? null : stateLabel(month.newTenths);
	if (before === after) return null;
	return `${percentOf(month.oldTenths, f)} ${STATE_LABELS[before]}`;
}

/** What an unchanged month's card says (BR-F04-26): for a change from a month onward,
 * "Keeps its one-month limit" or "Unchanged"; for one month only, "Back to the schedule" for the
 * month after the changed one, unless it holds a one-month limit, and "Unchanged" otherwise. */
export function unchangedText(month: PreviewMonth, change: BudgetChange): string {
	if (change.scope === "from") {
		return month.own ? PREVIEW_TEXT.keepsOwn : PREVIEW_TEXT.unchanged;
	}
	return month.month > change.month && !month.own ?
			PREVIEW_TEXT.backToSchedule
		:	PREVIEW_TEXT.unchanged;
}

/** A card's or row's first line of the tail: "Dec 2026 onward". */
export function onwardLabel(month: Month, f: Formats): string {
	return `${short(month, f)} onward`;
}

/** A group's months: "Sept 2026", "Nov 2023 to Aug 2026", or "Jan to Mar 2026" inside a year,
 * and its count, "34 months", for more than one (BR-F04-26). */
export function groupText(
	group: Pick<PreviewGroup, "first" | "last" | "count">,
	f: Formats,
): { range: string; count: string | null } {
	if (group.count === 1) return { range: short(group.first, f), count: null };
	const sameYear = group.first.slice(0, 4) === group.last.slice(0, 4);
	const first =
		sameYear ? formatMonth(group.first, f, "shortName") : short(group.first, f);
	return {
		range: `${first} to ${short(group.last, f)}`,
		count: `${group.count} months`,
	};
}

/** "Show 3 more" (BR-F04-26). */
export function showMoreLabel(hidden: number): string {
	return `Show ${hidden} more`;
}

/** Months as a sentence part, with a year only where it is needed: "September and October 2026",
 * "October and December 2026", "November 2023 to October 2026", "December 2026 and January
 * 2027". Three or more months in a row read as a range. */
export function monthList(months: readonly Month[], f: Formats): string {
	const segments: { first: Month; last: Month }[] = [];
	let run: Month[] = [];
	const closeRun = () => {
		if (run.length >= 3) {
			segments.push({ first: run[0]!, last: run.at(-1)! });
		} else {
			for (const month of run) segments.push({ first: month, last: month });
		}
		run = [];
	};
	for (const month of months) {
		if (run.length > 0 && shiftMonth(run.at(-1)!, 1) !== month) closeRun();
		run.push(month);
	}
	closeRun();
	const texts = segments.map((segment, at) => {
		if (segment.first === segment.last) {
			const next = segments[at + 1];
			// A year follows the last month of each year.
			const yearFollows =
				next?.first.slice(0, 4) !== segment.first.slice(0, 4);
			return formatMonth(segment.first, f, yearFollows ? "long" : "name");
		}
		const sameYear = segment.first.slice(0, 4) === segment.last.slice(0, 4);
		return `${formatMonth(segment.first, f, sameYear ? "name" : "long")} to ${long(segment.last, f)}`;
	});
	const last = texts.pop();
	return texts.length === 0 ? last! : `${texts.join(", ")} and ${last}`;
}

/** One note as a sentence (BR-F04-27). */
export function noteText(
	note: PreviewNote,
	change: BudgetChange,
	{ category, current, formats: f }: PreviewContext,
): string {
	switch (note.kind) {
		case "stopKeepsEarlier": {
			const earlier = "Earlier months keep their limits.";
			return note.movesToUnbudgeted ?
					`${earlier} ${monthName(change.month, current, f)}'s spending moves to Not budgeted.`
				:	earlier;
		}
		case "oneMonth":
			return `Only ${long(note.month, f)} changes. The limits for other months stay as they are.`;
		case "retroactive":
			return `This also changes ${monthList(note.months, f)}.`;
		case "gains":
			return `${categoryLabel(category)} gets a Budget in ${note.count} ${note.count === 1 ? "month" : "months"} that had none.`;
		case "replaces": {
			const [only] = note.entries;
			if (note.entries.length === 1 && only) {
				return only.limitMinor === null ?
						`This replaces the stop from ${long(only.from, f)}.`
					:	`This replaces the change to ${money(only.limitMinor, f)} from ${long(only.from, f)}.`;
			}
			const each = note.entries.map((entry) =>
				entry.limitMinor === null ?
					`the stop from ${short(entry.from, f)}`
				:	`${money(entry.limitMinor, f)} from ${short(entry.from, f)}`,
			);
			return `This replaces ${note.entries.length} later changes: ${each.join(", ")}.`;
		}
		case "keeps":
			return note.months.length === 1 ?
					`${monthList(note.months, f)} keeps its one-month limit.`
				:	`${monthList(note.months, f)} keep their one-month limits.`;
	}
}

/** What the history is asked for, so the preview has each listed month's spending (BR-F04-35):
 * the month it ends at, and how many months back from there. A change from a month onward
 * covers M to the current month, or M alone when it is later; one month only covers M − 1 to
 * M + 1, ending at the range's last month when M + 1 would be past it. */
export function historyWindow(
	change: BudgetChange,
	current: Month,
	lastInRange: Month,
): { to: Month; months: number } {
	const { month } = change;
	if (change.scope === "month") {
		const after = shiftMonth(month, 1);
		return { to: after > lastInRange ? lastInRange : after, months: 3 };
	}
	if (month > current) return { to: month, months: 1 };
	return { to: current, months: monthsFrom(month, current) + 1 };
}

/** A strip column's figures (BR-F04-26): spending as a share of the new limit, the old limit as
 * a share of the new one (`null` without both), and whether the month has no new limit, which
 * draws an empty dashed column. */
export function stripColumn(month: PreviewMonth): {
	spendShare: number;
	tickShare: number | null;
	noBudget: boolean;
} {
	if (month.newLimitMinor === null) {
		return { spendShare: 0, tickShare: null, noBudget: true };
	}
	return {
		spendShare: Math.max(0, month.spentMinor) / month.newLimitMinor,
		tickShare:
			month.oldLimitMinor === null ?
				null
			:	month.oldLimitMinor / month.newLimitMinor,
		noBudget: false,
	};
}
