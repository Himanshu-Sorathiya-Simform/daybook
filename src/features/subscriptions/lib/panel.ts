import { CATEGORY_LABELS } from "@/lib/categories";
import { compareCodeUnits } from "@/lib/compare";
import { formatDateYear, formatDayHeader } from "@/lib/date-format";
import { formatPercent, percentTenths } from "@/lib/money";
import { costTotals, type ExpenseCategory } from "@/lib/subscriptions/model";
import {
	chargeableDates,
	inPause,
	NEXT_DUE_HORIZON_MONTHS,
} from "@/lib/subscriptions/schedule";
import { shiftDays, shiftMonths } from "@/lib/time";
import type { Transaction } from "@/lib/transactions/model";
import {
	type Formats,
	monthlyHint,
	money,
	relativeDay,
	scheduleText,
} from "./labels";
import { canPause } from "./menu";
import type { SubscriptionItem, SubscriptionList } from "./types";

/** The words of the panel that no figure changes (BR-F05-40). */
export const PANEL_TEXT = {
	summaryTitle: "Your Subscriptions",
	summarySubtitle: "Monthly cost by category",
	howTitle: "How charges work",
	how: [
		"Daybook adds each charge to Transactions as an expense on its due date. Future charges aren't added until they're due.",
		"Deleting a charge in Transactions skips it. Daybook won't add it again.",
		"Cancelling or deleting a Subscription keeps the charges that already happened.",
	],
	selectHint: "Select a Subscription to see its charges. Up and down arrows move.",
	label: "Subscription",
	close: "Close details",
	charges: "Charges",
	noCharges: "No charges yet.",
	note: "Note",
	addNote: "Add a note",
	keysHint: "E to edit · Up and down arrows move · Esc to close",
	keysHintNoEdit: "Up and down arrows move · Esc to close",
	chargesFailed: "Charges could not be loaded.",
	retry: "Retry",
	loadingCharges: "Loading charges",
	viewCharges: "View charges",
} as const;

/**
 * What the panel offers so far. Each later chunk turns on what it builds, so the panel never
 * shows a button, a link or a key that does nothing: the Edit key and "Add a note" with the
 * Edit dialog, the status box's buttons and the footer's with theirs, and Undo skip with the
 * Undo notices.
 */
export const READY_PANEL: {
	edit: boolean;
	undoSkip: boolean;
	status: ReadonlySet<StatusAction>;
	actions: ReadonlySet<PanelActionKey>;
} = {
	edit: true,
	undoSkip: false,
	status: new Set(),
	actions: new Set(["edit"]),
};

/** The hint at the foot of the panel: "E to edit · Up and down arrows move · Esc to close",
 * without the Edit key until Edit exists. */
export function keysHint(editReady: boolean = READY_PANEL.edit): string {
	return editReady ? PANEL_TEXT.keysHint : PANEL_TEXT.keysHintNoEdit;
}

/** One category's share of the monthly cost (BR-F05-40). */
export type CategoryCost = {
	category: ExpenseCategory;
	label: string;
	monthlyMinor: number;
	/** "₹773.92". */
	monthly: string;
	yearlyMinor: number;
	/** The share of the yearly total, in tenths of a percent. */
	shareTenths: number;
	/** "3.8%", or "—" with no total. */
	share: string;
};

/**
 * The monthly cost by category, for the panel with no selection (BR-F05-40): each category's
 * monthly equivalent and its share of the yearly total, largest first, then by label. Only
 * Subscriptions with a next due date count, as the page's totals do (BR-F05-17). A category's
 * costs are added before they are divided by 12 and rounded once (MON-7), so Netflix's and
 * Amazon Prime's 9,287.00 a year are ₹773.92 a month, not the sum of two rounded months.
 */
export function categoryCosts(
	list: Pick<SubscriptionList, "items" | "totals">,
	f: Formats,
): CategoryCost[] {
	const byCategory = new Map<ExpenseCategory, SubscriptionItem[]>();
	for (const item of list.items) {
		if (item.status === "ended" || item.nextDueOn === null) continue;
		byCategory.set(item.category, [
			...(byCategory.get(item.category) ?? []),
			item,
		]);
	}
	const total = list.totals.yearlyMinor;
	return [...byCategory.entries()]
		.map(([category, items]) => {
			const { monthlyMinor, yearlyMinor } = costTotals(items);
			return {
				category,
				label: CATEGORY_LABELS[category],
				monthlyMinor,
				monthly: money(monthlyMinor, f),
				yearlyMinor,
				shareTenths: total === 0 ? 0 : percentTenths(yearlyMinor, total),
				share: formatPercent(yearlyMinor, total, f.numberLocale),
			};
		})
		.sort(
			(a, b) =>
				b.yearlyMinor - a.yearlyMinor || compareCodeUnits(a.label, b.label),
		);
}

/** What the panel's header says under the name (BR-F05-40): "Every month on the 5th, since
 * 5 Sept 2026 · ₹7,788.00 a year", and "≈ ₹124.92 a month" after it for a cadence other than
 * monthly. */
export function detailLine(
	item: Pick<
		SubscriptionItem,
		"startDate" | "cadence" | "yearlyMinor" | "monthlyMinor"
	>,
	f: Formats,
): string {
	const hint = monthlyHint(item, f);
	return (
		`${scheduleText(item, f)}, since ${formatDateYear(item.startDate, f)}`
		+ ` · ${money(item.yearlyMinor, f)} a year${hint === null ? "" : ` · ${hint}`}`
	);
}

/** What a status box can offer (BR-F05-40). */
export type StatusAction = "skip" | "resumeNow" | "change" | "resume";

/** The box under the amount: its words, with the date in bold, and its actions. */
export type StatusBox = {
	segments: { text: string; strong?: true }[];
	/** The words as one line. */
	text: string;
	actions: StatusAction[];
};

function box(segments: StatusBox["segments"], actions: StatusAction[]): StatusBox {
	return { segments, text: segments.map((part) => part.text).join(""), actions };
}

/**
 * The box by status (BR-F05-40): "Next charge Thu, 5 Nov, in 3 days." with Skip this one (and
 * "Ends 31 Dec 2026." when ending); "Paused. Resumes Tue, 5 Jan 2027." with Resume now and
 * Change, or "Paused." with no next due date; "Starts Sat, 5 Dec, in 33 days."; "Ended 30 Sept
 * 2026." with Resume; and "No more charges. Ends 31 Dec 2026." with Resume. A Subscription
 * with no end date has nothing to resume, so its "No more charges." has no action.
 */
export function statusBox(
	item: Pick<SubscriptionItem, "status" | "nextDueOn" | "startDate" | "endDate">,
	f: Formats,
): StatusBox {
	const { status, nextDueOn, startDate, endDate } = item;
	if (status === "ended") {
		return box(
			[
				{
					text:
						endDate === null ? "Ended." : (
							`Ended ${formatDateYear(endDate, f)}.`
						),
				},
			],
			["resume"],
		);
	}
	if (status === "paused") {
		const resumes =
			nextDueOn === null ?
				[]
			:	[
					{ text: " Resumes " },
					{ text: formatDayHeader(nextDueOn, f), strong: true as const },
					{ text: "." },
				];
		return box([{ text: "Paused." }, ...resumes], ["resumeNow", "change"]);
	}
	if (status === "upcoming") {
		return box(
			[
				{ text: "Starts " },
				{ text: formatDayHeader(startDate, f), strong: true },
				{ text: `, ${relativeDay(startDate, f.today)}.` },
			],
			[],
		);
	}
	if (nextDueOn !== null) {
		const ends =
			status === "ending" && endDate !== null ?
				` Ends ${formatDateYear(endDate, f)}.`
			:	"";
		return box(
			[
				{ text: "Next charge " },
				{ text: formatDayHeader(nextDueOn, f), strong: true },
				{ text: `, ${relativeDay(nextDueOn, f.today)}.${ends}` },
			],
			["skip"],
		);
	}
	return box(
		[
			{
				text:
					endDate === null ? "No more charges." : (
						`No more charges. Ends ${formatDateYear(endDate, f)}.`
					),
			},
		],
		endDate === null ? [] : ["resume"],
	);
}

export type TimelineKind = "next" | "later" | "charged" | "skipped" | "paused";

/** One line of the charges timeline (BR-F05-40). */
export type TimelineLine = {
	key: string;
	date: string;
	/** The date with its year: "5 Nov 2026". */
	dateText: string;
	kind: TimelineKind;
	/** "₹649.00", or "Skipped" or "Paused" in place of the amount. */
	amount: string;
	caption: string;
	/** A skipped or paused date is struck through. */
	struck: boolean;
	/** The date the calendar's selection marks. */
	marked: boolean;
	/** "You skipped it." offers Undo skip, only for a date after today (BR-F05-27). */
	undoSkip: boolean;
	chargeId: string | null;
};

/** Seven lines show before "Show all" (BR-F05-40). */
export const TIMELINE_PREVIEW = 7;

type Coming = { date: string; kind: "due" | "paused" | "skipped" };

/**
 * The dates still to come, up to the second due one: chargeable dates from today with no charge,
 * each skipped (a tombstone after today), paused or due. A date on or before today with a
 * tombstone was deleted as a charge, and belongs to the past. An ended Subscription has none.
 * The search goes a year at a time up to the 120 months a next due date reaches (BR-F05-19), so
 * a long pause or many skips never cut it short.
 */
function comingDates(
	item: SubscriptionItem,
	charged: ReadonlySet<string>,
	today: string,
): Coming[] {
	if (item.status === "ended") return [];
	const skipped = new Set(item.skips);
	const horizon = shiftMonths(today, NEXT_DUE_HORIZON_MONTHS);
	const found: Coming[] = [];
	let dues = 0;
	for (let from = today; from <= horizon && dues < 2;) {
		const to = shiftDays(shiftMonths(from, 12), -1);
		for (const date of chargeableDates(item, from, to, { ignorePause: true })) {
			if (charged.has(date)) continue;
			if (skipped.has(date)) {
				if (date > today) found.push({ date, kind: "skipped" });
				continue;
			}
			if (inPause(item.pause, date)) {
				found.push({ date, kind: "paused" });
				continue;
			}
			found.push({ date, kind: "due" });
			dues += 1;
			if (dues === 2) break;
		}
		from = shiftDays(to, 1);
	}
	return found;
}

/**
 * The charges timeline, newest at the top (BR-F05-40): the coming dates up to the second due
 * one, the farthest first, then the past charges and the past skipped dates, newest first. The
 * first due date reads "Next. Added to Transactions on the day." and the second "After that";
 * a charge "Charged", or "Charged · edited"; a skipped date after today "You skipped it." and
 * one on or before today "You deleted this charge. Daybook won't add it again."; a paused one
 * "Not added while paused". `charges` are the Subscription's linked charges (BR-F05-48), and
 * `selectedDue` the date the calendar's selection marks.
 */
export function chargeTimeline(
	item: SubscriptionItem,
	charges: readonly Transaction[],
	f: Formats,
	{ selectedDue = null }: { selectedDue?: string | null } = {},
): TimelineLine[] {
	const linked = charges.filter(
		(charge): charge is Transaction & { dueOn: string } => charge.dueOn !== null,
	);
	const coming = comingDates(
		item,
		new Set(linked.map((charge) => charge.dueOn)),
		f.today,
	);
	const line = (
		fields: Pick<TimelineLine, "date" | "kind" | "amount" | "caption">
			& Partial<Pick<TimelineLine, "undoSkip" | "chargeId">>,
	): TimelineLine => ({
		key: `${fields.date} ${fields.kind}`,
		dateText: formatDateYear(fields.date, f),
		struck: fields.kind === "skipped" || fields.kind === "paused",
		marked: fields.date === selectedDue,
		undoSkip: false,
		chargeId: null,
		...fields,
	});
	let dues = 0;
	const ahead = coming.map(({ date, kind }): TimelineLine => {
		if (kind === "skipped") {
			return line({
				date,
				kind,
				amount: "Skipped",
				caption: "You skipped it.",
				undoSkip: true,
			});
		}
		if (kind === "paused") {
			return line({
				date,
				kind,
				amount: "Paused",
				caption: "Not added while paused",
			});
		}
		dues += 1;
		return line({
			date,
			kind: dues === 1 ? "next" : "later",
			amount: money(item.amountMinor, f),
			caption:
				dues === 1 ?
					"Next. Added to Transactions on the day."
				:	"After that",
		});
	});
	const past = [
		...linked.map((charge) =>
			line({
				date: charge.dueOn,
				kind: "charged",
				amount: money(charge.amountMinor, f),
				caption: charge.edited ? "Charged · edited" : "Charged",
				chargeId: charge.id,
			}),
		),
		...item.skips
			.filter((date) => date <= f.today)
			.map((date) =>
				line({
					date,
					kind: "skipped",
					amount: "Skipped",
					caption: "You deleted this charge. Daybook won't add it again.",
				}),
			),
	].sort((a, b) => compareCodeUnits(b.date, a.date));
	return [...ahead.reverse(), ...past];
}

/**
 * How many timeline lines the Subscription will have, known before its charges load, for the
 * skeleton that holds their place (BR-F05-40): every charge the list counts, every skipped
 * date, and the two due dates to come (none once ended). `count` is what shows at first, at most
 * 7; `toggle` says a Show all button follows.
 */
export function expectedLines(
	item: Pick<SubscriptionItem, "status" | "chargeCount" | "skips">,
): { count: number; toggle: boolean } {
	const coming = item.status === "ended" ? 0 : 2;
	const all = item.chargeCount + item.skips.length + coming;
	return {
		count: Math.min(all, TIMELINE_PREVIEW),
		toggle: all > TIMELINE_PREVIEW,
	};
}

/** The lines the panel shows: the first 7, or all of them (BR-F05-40). */
export function shownLines(
	lines: readonly TimelineLine[],
	all: boolean,
): TimelineLine[] {
	return all ? [...lines] : lines.slice(0, TIMELINE_PREVIEW);
}

/** The button under the timeline: "Show all 9" or "Show fewer", and none with 7 lines or fewer
 * (BR-F05-40). */
export function timelineToggle(count: number, all: boolean): string | null {
	if (count <= TIMELINE_PREVIEW) return null;
	return all ? "Show fewer" : `Show all ${count}`;
}

/** "Paid so far ₹1,298.00 · 2 charges" ("1 charge" for one), or `null` with no charge: View
 * charges goes beside it (BR-F05-40). */
export function paidSummary(
	item: Pick<SubscriptionItem, "chargeCount" | "paidMinor">,
	f: Formats,
): string | null {
	if (item.chargeCount === 0) return null;
	const noun = item.chargeCount === 1 ? "charge" : "charges";
	return `Paid so far ${money(item.paidMinor, f)} · ${item.chargeCount} ${noun}`;
}

export type PanelActionKey = "edit" | "pause" | "resume" | "cancel" | "delete";

export type PanelAction = {
	action: PanelActionKey;
	label: string;
	variant: "primary" | "secondary" | "danger";
};

/**
 * The buttons at the foot of the panel (BR-F05-40): Edit; Pause (active or ending, with a next
 * due date before the 24-month limit); Resume (ended, or ending with no next due date), else
 * "Cancel Subscription", read "Change end" when ending, and none for an upcoming Subscription;
 * and Delete.
 */
export function panelActions(
	item: Pick<SubscriptionItem, "status" | "nextDueOn">,
	f: Formats,
): PanelAction[] {
	const actions: PanelAction[] = [
		{ action: "edit", label: "Edit", variant: "primary" },
	];
	if (canPause(item, f.today)) {
		actions.push({ action: "pause", label: "Pause", variant: "secondary" });
	}
	if (
		item.status === "ended"
		|| (item.status === "ending" && item.nextDueOn === null)
	) {
		actions.push({ action: "resume", label: "Resume", variant: "secondary" });
	} else if (item.status !== "upcoming") {
		actions.push({
			action: "cancel",
			label: item.status === "ending" ? "Change end" : "Cancel Subscription",
			variant: "secondary",
		});
	}
	actions.push({ action: "delete", label: "Delete", variant: "danger" });
	return actions;
}

/** The footer's buttons that are ready: `panelActions` less what `ready` lacks. */
export function readyPanelActions(
	item: Pick<SubscriptionItem, "status" | "nextDueOn">,
	f: Formats,
	ready: ReadonlySet<PanelActionKey> = READY_PANEL.actions,
): PanelAction[] {
	return panelActions(item, f).filter((entry) => ready.has(entry.action));
}

/** The status box's buttons that are ready. */
export function readyStatusActions(
	actions: readonly StatusAction[],
	ready: ReadonlySet<StatusAction> = READY_PANEL.status,
): StatusAction[] {
	return actions.filter((action) => ready.has(action));
}
