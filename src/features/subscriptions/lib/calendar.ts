import {
	firstDayOf,
	lastDayOf,
	type Month,
	monthOf,
	monthsStarting,
	shiftMonth,
} from "@/lib/budgets/months";
import { CATEGORY_LABELS, type CategoryKey, categoryColor } from "@/lib/categories";
import {
	formatDayHeader,
	formatDayMonth,
	formatMonth,
	formatWeekday,
	formatYear,
} from "@/lib/date-format";
import type { WeekStart } from "@/lib/geo";
import { formatMoneyWhole, percentTenths } from "@/lib/money";
import {
	type MonthCharge,
	type MonthItem,
	type MonthItemKind,
	monthItems,
	monthTotals,
} from "@/lib/subscriptions/model";
import { shiftDays, weekdayIndex } from "@/lib/time";
import type { Transaction } from "@/lib/transactions/model";
import { type Formats, money, relativeDay } from "./labels";
import type { SubscriptionItem, SubscriptionMonthRow } from "./types";

/** The calendar's words that no figure changes (BR-F05-38). */
export const CALENDAR_TEXT = {
	monthRowLabel: "Month",
	earlier: "Earlier months",
	later: "Later months",
	weekColumn: "Week",
	popoverHint: "Select one to open it in the panel.",
	nothingDue: "Nothing due · Show days",
	loading: "Loading the month",
	deletedCharge:
		"This charge belongs to a deleted Subscription. It stays in Transactions as an ordinary expense.",
} as const;

/** The legend under the grid (BR-F05-38). "Dashed ring: pending sync" belongs to M5, which adds
 * pending Subscriptions, so it carries `fromM5` and the page leaves it out until then. */
export const LEGEND: readonly { text: string; fromM5?: true }[] = [
	{ text: "Filled dot: charged" },
	{ text: "Ring: due" },
	{ text: "Struck: skipped or paused" },
	{ text: "Dashed ring: pending sync", fromM5: true },
];

// --- The month row (BR-F05-38) ---------------------------------------------------------------

/** The row shows 4 to 8 months, as many as fit its width at `MONTH_CELL_WIDTH` each, so a figure
 * is never cut; Earlier months and Later months move by 3 (BR-F05-38). */
export const MONTHS_MIN = 4;
export const MONTHS_MAX = 8;
/** How many show before the row's width is known: the middle of the range. */
export const MONTHS_DEFAULT = 5;
export const MONTH_CELL_WIDTH = 88;
/** What a row's width holds besides its months: the two arrows and the gaps. */
export const MONTH_ROW_CHROME = 96;
export const MONTH_STEP = 3;
/** The months reads reach: within 120 months of the current one (BR-F05-36, D-596). */
export const MONTH_REACH = 120;

/** How many months a row `width` pixels wide shows (BR-F05-38): as many as fit, from 4 to 8;
 * `null`, before the width is known, shows the default. */
export function monthsFit(width: number | null): number {
	if (width === null || width <= 0) return MONTHS_DEFAULT;
	const fit = Math.floor((width - MONTH_ROW_CHROME) / MONTH_CELL_WIDTH);
	return Math.min(MONTHS_MAX, Math.max(MONTHS_MIN, fit));
}

/** How many of the shown months come before the current one at offset 0 (BR-F05-38): 1 for 4
 * or 5, 2 for 6 or 7 and 3 for 8, so the current month stays left of centre. */
export function monthsBefore(count: number): number {
	if (count <= 5) return 1;
	return count <= 7 ? 2 : 3;
}

/** The months the row shows: `count` of them, `offset` months on from the first position (a
 * multiple of `MONTH_STEP` once Earlier months or Later months were pressed). */
export function monthWindow(current: Month, offset: number, count: number): Month[] {
	return monthsStarting(shiftMonth(current, offset - monthsBefore(count)), count);
}

/** The months a read for the row covers at `offset`: the widest window, 8 months from 3 before,
 * which holds every narrower one. */
export function monthSpan(
	current: Month,
	offset: number,
): { from: Month; to: Month } {
	const months = monthWindow(current, offset, MONTHS_MAX);
	return { from: months[0]!, to: months.at(-1)! };
}

/** Whether Earlier months (`-1`) or Later months (`1`) can move the row by `MONTH_STEP`
 * without a month past the reach of BR-F05-36. */
export function canMoveMonths(
	current: Month,
	offset: number,
	direction: -1 | 1,
): boolean {
	const { from, to } = monthSpan(current, offset + direction * MONTH_STEP);
	return (
		from >= shiftMonth(current, -MONTH_REACH)
		&& to <= shiftMonth(current, MONTH_REACH)
	);
}

/** One month of the row (BR-F05-38). */
export type MonthCell = {
	month: Month;
	/** "Nov". */
	name: string;
	/** The year, "2027", when it is not the current one, else `null`. */
	year: string | null;
	/** Charged plus expected in whole units: "₹20,149". */
	figure: string;
	/** "November 2026, charged ₹18,000.00 of ₹20,149.00". */
	label: string;
	/** Whether `figure` is known: the months read failed when it is not, and the cell shows "—"
	 * and is named by its month alone. */
	hasFigure: boolean;
	/** A past month carries a check mark. */
	past: boolean;
	current: boolean;
	selected: boolean;
	/** The current month's bar: its charged share of the month, in tenths of a percent. The rest
	 * of the track is what is still to come. */
	chargedTenths: number | null;
};

/**
 * The cells of the month row (BR-F05-38) from `GET /api/subscriptions/months` (BR-F05-36): each
 * month's short name, its year when it differs from the current one, and charged plus expected
 * in whole units. Past months read "October 2026, charged ₹20,148.00", the current one
 * "November 2026, charged ₹18,000.00 of ₹20,149.00" and later ones "December 2026, expected
 * ₹20,149.00". A month `rows` does not hold has nothing charged or expected.
 */
export function monthCells(
	months: readonly Month[],
	rows: readonly SubscriptionMonthRow[] | undefined,
	{ current, selected }: { current: Month; selected: Month },
	f: Formats,
): MonthCell[] {
	const byMonth = new Map((rows ?? []).map((row) => [row.month, row]));
	return months.map((month) => {
		const charged = byMonth.get(month)?.chargedMinor ?? 0;
		const total = charged + (byMonth.get(month)?.expectedMinor ?? 0);
		const past = month < current;
		const now = month === current;
		const long = formatMonth(month, f, "long");
		let label = `${long}, expected ${money(total, f)}`;
		if (rows === undefined) label = long;
		else if (past) label = `${long}, charged ${money(charged, f)}`;
		else if (now)
			label = `${long}, charged ${money(charged, f)} of ${money(total, f)}`;
		const barTenths =
			now && rows !== undefined ?
				total === 0 ?
					0
				:	percentTenths(charged, total)
			:	null;
		return {
			month,
			name: formatMonth(month, f, "shortName"),
			year:
				month.slice(0, 4) === current.slice(0, 4) ?
					null
				:	formatYear(Number(month.slice(0, 4)), f),
			figure:
				rows === undefined ? "—" : (
					formatMoneyWhole(total, f.currency, f.numberLocale)
				),
			label,
			hasFigure: rows !== undefined,
			past,
			current: now,
			selected: month === selected,
			chargedTenths: barTenths,
		};
	});
}

// --- The items of a month (BR-F05-38) ---------------------------------------------------------

function toMonthCharge(row: Transaction): MonthCharge {
	return {
		id: row.id,
		subscriptionId: row.subscriptionId,
		occurredOn: row.occurredOn,
		payee: row.payee ?? "",
		category: row.category ?? "",
		amountMinor: row.amountMinor,
	};
}

/**
 * Everything in `month`, from the list and the month's charges (BR-F05-38, BR-F05-48): every
 * charge, deleted Subscriptions' included; skipped dates from `chargesFrom` to the end date;
 * paused dates from today on; and due dates from today on. Sorted by date, then amount, largest
 * first.
 */
export function calendarItems(
	items: readonly SubscriptionItem[],
	charges: readonly Transaction[],
	month: Month,
	today: string,
): MonthItem[] {
	return monthItems(
		items.map((item) => ({ ...item, skipped: item.skips })),
		charges.map(toMonthCharge),
		month,
		today,
	);
}

/** The month's title and its figures (BR-F05-38): "₹18,000.00 charged · ₹2,149.00 to come" for
 * the current month, "₹20,148.00 charged" for a past one and "₹20,149.00 expected, at today's
 * prices" for a later one. */
export function calendarTitle(
	month: Month,
	items: readonly MonthItem[],
	f: Formats,
): { title: string; figures: string } {
	const { chargedMinor, toComeMinor } = monthTotals(items);
	const current = monthOf(f.today);
	let figures = `${money(toComeMinor, f)} expected, at today's prices`;
	if (month < current) figures = `${money(chargedMinor, f)} charged`;
	else if (month === current) {
		figures = `${money(chargedMinor, f)} charged · ${money(toComeMinor, f)} to come`;
	}
	return { title: formatMonth(month, f, "long"), figures };
}

const WORDS: Record<MonthItemKind, string> = {
	charged: "charged",
	due: "due",
	skipped: "skipped",
	paused: "paused",
	pending: "pending sync",
};

/** An item's state in a word: "charged", "due", "skipped", "paused" or "pending sync". */
export const itemWord = (kind: MonthItemKind): string => WORDS[kind];

/** A skipped or paused item is drawn struck through (BR-F05-38). */
export const isStruck = (kind: MonthItemKind): boolean =>
	kind === "skipped" || kind === "paused";

/** Charged and due items make up a day's and a week's total (BR-F05-38). */
const counts = (kind: MonthItemKind): boolean =>
	kind === "charged" || kind === "due";

/** The sum of the charged and due items. */
export function countedMinor(items: readonly MonthItem[]): number {
	return items
		.filter((item) => counts(item.kind))
		.reduce((total, item) => total + item.amountMinor, 0);
}

/** A chip's name: "Netflix, ₹649.00, due" (BR-F05-38). */
export function chipLabel(item: MonthItem, f: Formats): string {
	return `${item.name}, ${money(item.amountMinor, f)}, ${itemWord(item.kind)}`;
}

/** A chip's amount, in whole units: "₹649". */
export function chipAmount(item: MonthItem, f: Formats): string {
	return formatMoneyWhole(item.amountMinor, f.currency, f.numberLocale);
}

/** The colour of a chip's dot, its category's (BR-F05-38). */
export const chipColor = (category: string): string =>
	categoryColor(category as CategoryKey);

const categoryLabel = (category: string): string =>
	CATEGORY_LABELS[category as CategoryKey] ?? category;

// --- The grid, from 768 px (BR-F05-38) -------------------------------------------------------

const START_INDEX: Record<WeekStart, number> = {
	sunday: 0,
	monday: 1,
	saturday: 6,
};

/** 31 October 2026 is a Saturday, 1 November a Sunday and 2 November a Monday: a week for each
 * start to name the weekdays from. */
const HEADER_ANCHOR: Record<WeekStart, string> = {
	saturday: "2026-10-31",
	sunday: "2026-11-01",
	monday: "2026-11-02",
};

/** The seven weekday names, from the week start: "Mon" to "Sun" (BR-F05-38). */
export function weekdayHeaders(weekStart: WeekStart, f: Formats): string[] {
	return Array.from({ length: 7 }, (_, index) =>
		formatWeekday(shiftDays(HEADER_ANCHOR[weekStart], index), f, "short"),
	);
}

export type GridDay = {
	date: string;
	inMonth: boolean;
	today: boolean;
	/** A past day is drawn lighter. */
	past: boolean;
	/** "5", or "1 Dec" for the first day of the next month. */
	label: string;
	/** Every item of the day; none for a day outside the month. */
	items: MonthItem[];
	/** The items drawn: up to two, or the first when there are more. */
	shown: MonthItem[];
	/** How many more the popover holds: the items beyond the first, when there are over two. */
	moreCount: number;
	/** The day's charged and due items. */
	totalMinor: number;
	/** "+2 more · ₹20,149", or `null`. */
	moreText: string | null;
};

export type GridWeek = {
	/** The week's first date. */
	key: string;
	days: GridDay[];
	/** The week's charged and due items on the month's own days. */
	totalMinor: number;
	/** "₹649.00", or "—" for none. */
	total: string;
};

/** More than this many items on a day are folded into "+N more" (BR-F05-38). */
const DAY_ITEMS = 2;

/**
 * The grid of a month (BR-F05-38): weeks from the profile's week start, each with its seven
 * days and a total. Days outside the month show only their date, "1 Dec" for a first day, and
 * no items. A day shows up to two items; with more, its first and "+2 more · ₹20,149". The week
 * total counts the month's own days; "—" for none.
 */
export function gridWeeks(
	month: Month,
	weekStart: WeekStart,
	items: readonly MonthItem[],
	f: Formats,
): GridWeek[] {
	const start = START_INDEX[weekStart];
	const first = firstDayOf(month);
	const last = lastDayOf(month);
	const back = (weekdayIndex(first) - start + 7) % 7;
	const byDate = new Map<string, MonthItem[]>();
	for (const item of items) {
		byDate.set(item.date, [...(byDate.get(item.date) ?? []), item]);
	}
	// The weeks that hold the days from the first row's start to the month's last day.
	const length = back + Number(last.slice(8));
	const weeks: GridWeek[] = [];
	for (let at = 0; at < length; at += 7) {
		const days = Array.from({ length: 7 }, (_, index): GridDay => {
			const date = shiftDays(first, at + index - back);
			const inMonth = monthOf(date) === month;
			const own = inMonth ? (byDate.get(date) ?? []) : [];
			const many = own.length > DAY_ITEMS;
			const totalMinor = countedMinor(own);
			const day = Number(date.slice(8));
			return {
				date,
				inMonth,
				today: date === f.today,
				past: date < f.today,
				label: !inMonth && day === 1 ? formatDayMonth(date, f) : String(day),
				items: own,
				shown: many ? own.slice(0, 1) : own,
				moreCount: many ? own.length - 1 : 0,
				totalMinor,
				moreText:
					many ?
						`+${own.length - 1} more · ${formatMoneyWhole(totalMinor, f.currency, f.numberLocale)}`
					:	null,
			};
		});
		// A day outside the month holds no item, so the sum is the month's own days'.
		const weekTotal = days.reduce((sum, day) => sum + day.totalMinor, 0);
		weeks.push({
			key: days[0]!.date,
			days,
			totalMinor: weekTotal,
			total: weekTotal === 0 ? "—" : money(weekTotal, f),
		});
	}
	return weeks;
}

/** What a day's popover shows (BR-F05-38): "Thu, 5 Nov" and the day's total, then every item with
 * its name, "Entertainment · due" and its amount. */
export function dayPopover(
	day: Pick<GridDay, "date" | "items" | "totalMinor">,
	f: Formats,
): {
	title: string;
	total: string;
	entries: { item: MonthItem; caption: string; amount: string }[];
} {
	return {
		title: formatDayHeader(day.date, f),
		total: money(day.totalMinor, f),
		entries: day.items.map((item) => ({
			item,
			caption: `${categoryLabel(item.category)} · ${itemWord(item.kind)}`,
			amount: money(item.amountMinor, f),
		})),
	};
}

// --- The days, below 768 px (BR-F05-38) -----------------------------------------------------

export type PhoneEntry = {
	item: MonthItem;
	/** A due item's relative date, "in 3 days"; the others "Charged", "Skipped", "Paused" or
	 * "Pending sync". */
	caption: string;
	amount: string;
	struck: boolean;
};

export type PhoneRow =
	/** A day with items: "Today", or "Mon 3". */
	| {
			kind: "items";
			date: string;
			today: boolean;
			label: string;
			entries: PhoneEntry[];
	  }
	/** A day with none that still shows: today, or one of fewer than three in a row. */
	| { kind: "empty"; date: string; today: boolean; label: string }
	/** Three or more empty days in a row: "Mon 3 to Wed 5". */
	| { kind: "run"; from: string; to: string; label: string };

export type PhoneWeek = {
	key: string;
	/** "2 to 8 Nov", or "1 Nov" for a week of one day. */
	label: string;
	totalMinor: number;
	/** "₹649.00", or `null` when nothing is charged or due. */
	total: string | null;
	/** The week holds an item of any kind. */
	hasItems: boolean;
	rows: PhoneRow[];
};

const CAPTIONS: Record<Exclude<MonthItemKind, "due">, string> = {
	charged: "Charged",
	skipped: "Skipped",
	paused: "Paused",
	pending: "Pending sync",
};

/** A run of days is folded from this many in a row (BR-F05-38). */
const RUN = 3;

/** The weekday and day: "Mon 3". */
const dayName = (date: string, f: Formats) =>
	`${formatWeekday(date, f, "short")} ${Number(date.slice(8))}`;

/** "2 to 8 Nov": the first day with no month when the last day's text starts with its day, as
 * `en-IN` writes it, else both in full, "Nov 2 to Nov 8" for `en-US`. */
function weekLabel(first: string, last: string, f: Formats): string {
	if (first === last) return formatDayMonth(first, f);
	const end = formatDayMonth(last, f);
	const start =
		/^\d/.test(end) ? String(Number(first.slice(8))) : formatDayMonth(first, f);
	return `${start} to ${end}`;
}

/**
 * The month day by day for a phone (BR-F05-38): weeks from the profile's week start, cut at the
 * month's ends. Each week has its label and total; a day with items shows them, today always
 * shows, a run of three or more other empty days is one line, and fewer show one line each. A
 * week of only skipped or paused items has them but no total.
 */
export function phoneWeeks(
	month: Month,
	weekStart: WeekStart,
	items: readonly MonthItem[],
	f: Formats,
): PhoneWeek[] {
	const start = START_INDEX[weekStart];
	const byDate = new Map<string, MonthItem[]>();
	for (const item of items) {
		byDate.set(item.date, [...(byDate.get(item.date) ?? []), item]);
	}
	const groups: string[][] = [];
	for (
		let date = firstDayOf(month);
		monthOf(date) === month;
		date = shiftDays(date, 1)
	) {
		if (groups.length === 0 || weekdayIndex(date) === start) groups.push([]);
		groups.at(-1)!.push(date);
	}
	return groups.map((days) => {
		const rows: PhoneRow[] = [];
		let run: string[] = [];
		const flush = () => {
			if (run.length >= RUN) {
				const from = run[0]!;
				const to = run.at(-1)!;
				rows.push({
					kind: "run",
					from,
					to,
					label: `${dayName(from, f)} to ${dayName(to, f)}`,
				});
			} else {
				for (const date of run) {
					rows.push({
						kind: "empty",
						date,
						today: false,
						label: dayName(date, f),
					});
				}
			}
			run = [];
		};
		for (const date of days) {
			const own = byDate.get(date) ?? [];
			const today = date === f.today;
			if (own.length === 0 && !today) {
				run.push(date);
				continue;
			}
			flush();
			rows.push(
				own.length === 0 ?
					{ kind: "empty", date, today, label: "Today" }
				:	{
						kind: "items",
						date,
						today,
						label: today ? "Today" : dayName(date, f),
						entries: own.map((item) => ({
							item,
							caption:
								item.kind === "due" ?
									relativeDay(date, f.today)
								:	CAPTIONS[item.kind],
							amount: money(item.amountMinor, f),
							struck: isStruck(item.kind),
						})),
					},
			);
		}
		flush();
		const totalMinor = countedMinor(
			days.flatMap((date) => byDate.get(date) ?? []),
		);
		return {
			key: days[0]!,
			label: weekLabel(days[0]!, days.at(-1)!, f),
			totalMinor,
			total: totalMinor === 0 ? null : money(totalMinor, f),
			hasItems: days.some((date) => (byDate.get(date) ?? []).length > 0),
			rows,
		};
	});
}

/** The rows a week shows: all of them, unless the week has no item and has not been opened, when
 * only today's line remains (BR-F05-38). */
export function phoneRows(week: PhoneWeek, expanded: boolean): PhoneRow[] {
	if (expanded || week.hasItems) return week.rows;
	return week.rows.filter((row) => row.kind === "empty" && row.today);
}

/** "Nothing due · Show days" for a week with no item that has not been opened; `null` otherwise
 * (BR-F05-38). */
export function phoneWeekHint(week: PhoneWeek, expanded: boolean): string | null {
	return !week.hasItems && !expanded ? CALENDAR_TEXT.nothingDue : null;
}
