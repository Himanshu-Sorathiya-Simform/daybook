import type { BudgetRules } from "@/lib/budgets/model";
import type { Month } from "@/lib/budgets/months";
import { formatMonth } from "@/lib/date-format";
import { formatMoney } from "@/lib/money";
import type { Formats } from "./labels";
import { historyItems } from "./panel";

const money = (minor: number, f: Formats) =>
	formatMoney(minor, f.currency, f.numberLocale);
const long = (month: Month, f: Formats) => formatMonth(month, f, "long");
const short = (month: Month, f: Formats) => formatMonth(month, f, "short");

/** F04's conflict view words (BR-F04-23, D-567, D-578). */
export const CONFLICT_TEXT = {
	title: "This Budget changed on another device",
	intro: "Your version and the saved one are side by side, with the differences marked.",
	deleteIntro:
		"It changed after you chose to delete it. Delete it anyway, or keep it as it is saved now.",
	month: "Month",
	mine: "Yours",
	theirs: "Saved now",
	differs: "Differs",
	keepMine: "Keep mine",
	keepTheirs: "Keep theirs",
	deleteAnyway: "Delete anyway",
	keepIt: "Keep it",
	undoLine: "Keep mine puts the Budget back as it was before your change.",
	none: "None",
} as const;

/** One row of the conflict table: a month holding a schedule entry or a one-month limit in
 * either version, each side worded as the limit history words it (BR-F04-30). */
export type ConflictRow = {
	month: Month;
	label: string;
	/** One line per item, "None" when this side has nothing in the month. */
	mine: string[];
	theirs: string[];
	differs: boolean;
};

/** What a side holds in `month`: its one-month limit above its schedule entry, as the limit
 * history words them, or "None". */
function cellLines(rules: BudgetRules, month: Month, f: Formats): string[] {
	const lines = historyItems(rules, month, f)
		.filter((item) => item.month === month)
		.map((item) => item.text);
	return lines.length > 0 ? lines : [CONFLICT_TEXT.none];
}

/**
 * The conflict table (BR-F04-23): one row per month that holds a schedule entry or a one-month
 * limit in either version, newest first. A row whose two sides read differently is marked
 * `differs`. `mine` is the user's version, `theirs` the Budget saved now.
 */
export function conflictRows(
	mine: BudgetRules,
	theirs: BudgetRules,
	f: Formats,
): ConflictRow[] {
	const months = new Set<Month>();
	for (const rules of [mine, theirs]) {
		for (const entry of rules.schedule) months.add(entry.from);
		for (const each of rules.overrides) months.add(each.month);
	}
	return [...months]
		.sort((a, b) => b.localeCompare(a))
		.map((month) => {
			const left = cellLines(mine, month, f);
			const right = cellLines(theirs, month, f);
			return {
				month,
				label: short(month, f),
				mine: left,
				theirs: right,
				differs: left.join("\n") !== right.join("\n"),
			};
		});
}

/** A change the user made, for the line under the table. */
export type ConflictChange =
	| {
			kind: "limit";
			scope: "onward" | "month";
			month: Month;
			/** `null` for a stop. */
			limitMinor: number | null;
	  }
	| { kind: "removal"; month: Month };

/** What Keep mine saves (BR-F04-23): "Keep mine applies your change, ₹7,000.00 from December
 * 2026, to the saved Budget.", "… ₹8,000.00 for October 2026 only …", "… the stop from
 * November 2026 …", "… no limit for October 2026 only …" or "… the removal of the one-month
 * limit for October 2026 …". */
export function keepMineLine(change: ConflictChange, f: Formats): string {
	let what: string;
	if (change.kind === "removal") {
		what = `the removal of the one-month limit for ${long(change.month, f)}`;
	} else if (change.limitMinor === null) {
		what =
			change.scope === "month" ?
				`no limit for ${long(change.month, f)} only`
			:	`the stop from ${long(change.month, f)}`;
	} else {
		const amount = money(change.limitMinor, f);
		what =
			change.scope === "month" ?
				`${amount} for ${long(change.month, f)} only`
			:	`${amount} from ${long(change.month, f)}`;
	}
	return `Keep mine applies your change, ${what}, to the saved Budget.`;
}
