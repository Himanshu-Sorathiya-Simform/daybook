import { amountMessage, formatAmountInput, parseAmount } from "@/lib/amount";
import { categoryLabel } from "@/lib/categories";
import { formatDateYear, formatDayHeader } from "@/lib/date-format";
import { normalizeText } from "@/lib/text";
import { daysInRange, shiftDays } from "@/lib/time";
import type { ExpenseCategory } from "@/lib/subscriptions/model";
import { monthlyMinor, yearlyMinor } from "@/lib/subscriptions/model";
import { startDateRangeMessage } from "@/lib/subscriptions/messages";
import { backfillPreview, nextChargeDates } from "@/lib/subscriptions/rules";
import {
	type Cadence,
	type CadenceUnit,
	MAX_EVERY,
	presetOf,
	PRESETS,
	type PresetKey,
	sameCadence,
} from "@/lib/subscriptions/schedule";
import {
	startDateWindow,
	subscriptionCreateSchema,
	type SubscriptionCreateInput,
	subscriptionEditSchema,
} from "@/lib/subscriptions/schemas";
import {
	cadenceLabel,
	type Formats,
	money,
	scheduleText,
	shortDate,
} from "./labels";
import type { SubscriptionItem, SubscriptionsLocale } from "./types";

/** Which dialog the page has open (BR-F05-24, BR-F05-41 to BR-F05-44). */
export type DialogKind = "add" | "edit" | "cancel" | "resume" | "pause" | "delete";

/** The Add and Edit dialog's own words (BR-F05-24, section 8). */
export const DIALOG_TEXT = {
	addTitle: "Add a Subscription",
	editTitle: (name: string) => `Edit ${name}`,
	add: "Add Subscription",
	save: "Save changes",
	cancel: "Cancel",
	offline: "You are offline. Connect to save.",
	conflict:
		"This Subscription changed on another device. Close this and open it again to see it as it is now.",
	name: "Name",
	namePlaceholder: "Netflix, rent, insurance…",
	payeesHeading: "Payees you've paid",
	amount: "Amount",
	howOften: "How often",
	every: "Every",
	unit: "Unit",
	customHint: "Every 2 months, every 6 months, every 2 weeks…",
	startedOn: "Started on",
	startedHint: "The date of the first charge. Daybook repeats from this date.",
	addNote: "Add a note",
	note: "Note",
	whatChanges: "What changes",
	stripLabel: "Charges around today",
	today: "Today",
	schedule:
		"Past charges stay as they are. The new schedule applies from tomorrow.",
	noteOnly: "Only the note changes. Charges stay as they are.",
	chargesFailed: "Charges could not be loaded.",
	loadingCharges: "Loading charges",
	retry: "Retry",
	alsoPastDetail: "Name and category only. Past amounts never change.",
	pastNo: "No, start with the next one",
	pastNoNote:
		"Pick this if the past payments are already in Transactions, or you don't need them.",
	pastYesNote: "They count in those months' spending, Budgets and reports.",
} as const;

/** The choices of "How often" (BR-F05-24), in order. */
export const CADENCE_CHOICES: readonly { value: CadenceChoice; label: string }[] = [
	{ value: "weekly", label: "Weekly" },
	{ value: "monthly", label: "Monthly" },
	{ value: "quarterly", label: "Every 3 months" },
	{ value: "yearly", label: "Yearly" },
	{ value: "custom", label: "Custom" },
];

export type CadenceChoice = PresetKey | "custom";

/** The units a custom cadence counts in, as "Unit" lists them. */
export const UNIT_CHOICES: readonly { value: CadenceUnit; label: string }[] = [
	{ value: "week", label: "weeks" },
	{ value: "month", label: "months" },
];

/** The fields the user fills in: the form's values (D-169). The amount is the text as typed,
 * the custom number is its digits, and the past-charges choice, the double-charge skip and
 * "Also change the past charges" are the choices the dialog may show. */
export type DialogValues = {
	name: string;
	amount: string;
	preset: CadenceChoice;
	every: string;
	unit: CadenceUnit;
	category: ExpenseCategory | null;
	startDate: string;
	note: string;
	past: "no" | "yes";
	skipDouble: boolean;
	alsoPast: boolean;
};

/** The fields that show a message. */
export type DialogField =
	"name" | "amount" | "cadence" | "category" | "startDate" | "note";

export type DialogMessages = Partial<Record<DialogField, string>>;

/** The values a dialog opens with: Add's are empty, monthly and today; Edit's are the
 * Subscription's own (BR-F05-24). A custom number and unit start at 2 months. */
export function startValues(
	item: SubscriptionItem | null,
	locale: SubscriptionsLocale,
): DialogValues {
	const base = {
		past: "no",
		skipDouble: true,
		alsoPast: false,
	} as const;
	if (item === null) {
		return {
			...base,
			name: "",
			amount: "",
			preset: "monthly",
			every: "2",
			unit: "month",
			category: null,
			startDate: locale.today,
			note: "",
		};
	}
	const preset = presetOf(item.cadence);
	return {
		...base,
		name: item.name,
		amount: formatAmountInput(item.amountMinor, locale),
		preset,
		every: preset === "custom" ? String(item.cadence.every) : "2",
		unit: preset === "custom" ? item.cadence.unit : "month",
		category: item.category,
		startDate: item.startDate,
		note: item.note ?? "",
	};
}

/** The cadence the choice makes, or `null` for a custom number out of range. A custom cadence
 * equal to a preset is the preset, since a cadence holds no preset name (BR-F05-24). */
export function cadenceOf(
	values: Pick<DialogValues, "preset" | "every" | "unit">,
): Cadence | null {
	if (values.preset !== "custom") return { ...PRESETS[values.preset] };
	if (!/^\d+$/.test(values.every)) return null;
	const every = Number(values.every);
	return every >= 1 && every <= MAX_EVERY[values.unit] ?
			{ unit: values.unit, every }
		:	null;
}

/** The custom number as typed: digits only, at most two (BR-F05-24). */
export function everyText(text: string): string {
	return text.replaceAll(/\D/g, "").slice(0, 2);
}

/** The note as typed, at most 500 characters (F03's note rules). */
export const NOTE_MAX = 500;

/** A fixed, valid id and instant for the checks that only judge the fields. */
const CHECK = { id: "01900000-0000-7000-8000-000000000000" };

const FIELDS: Record<string, DialogField> = {
	name: "name",
	amountMinor: "amount",
	cadence: "cadence",
	category: "category",
	startDate: "startDate",
	note: "note",
};

/** Whether a Started on date passes: within 10 years back and 1 year ahead of today, an
 * Edit's only when it changed (BR-F05-24, BR-F05-46). */
export function startDateOk(
	startDate: string,
	locale: Pick<SubscriptionsLocale, "today">,
	edited: Pick<SubscriptionItem, "startDate"> | null,
): boolean {
	if (edited !== null && startDate === edited.startDate) return true;
	const { min, max } = startDateWindow(locale.today);
	return startDate >= min && startDate <= max;
}

/**
 * The message under each field, from F05's shared checks (BR-F05-24, section 8): the amount as
 * F03 reads it, then the schema of an Add or of an Edit for the rest, so the dialog and the
 * server say the same words. A Started on date is judged against 10 years back and 1 year
 * ahead of today, an Edit's only when it changed (BR-F05-46).
 */
export function fieldMessages(
	values: DialogValues,
	locale: SubscriptionsLocale,
	edited: SubscriptionItem | null,
): DialogMessages {
	const typed = parseAmount(values.amount, locale);
	const messages: DialogMessages = {};
	if (!typed.ok) messages.amount = amountMessage(typed.error, locale);
	const fields = {
		name: values.name,
		amountMinor: typed.ok ? typed.minor : 1,
		currency: locale.currency,
		cadence: cadenceOf(values) ?? {
			unit: values.unit,
			every: Number(values.every),
		},
		startDate: values.startDate,
		category: values.category,
		note: values.note,
	};
	const instant = new Date().toISOString();
	const result =
		edited === null ?
			subscriptionCreateSchema.safeParse({
				...fields,
				...CHECK,
				createdAt: instant,
			})
		:	subscriptionEditSchema.safeParse({ ...fields, changedAt: instant });
	if (!result.success) {
		for (const issue of result.error.issues) {
			const field = FIELDS[String(issue.path[0])];
			if (field !== undefined) messages[field] ??= issue.message;
		}
	}
	if (
		messages.startDate === undefined
		&& !startDateOk(values.startDate, locale, edited)
	) {
		const { min, max } = startDateWindow(locale.today);
		messages.startDate = startDateRangeMessage(min, max);
	}
	return messages;
}

/** The hints of an Edit's changed fields, "Was 649.00", in place of the field's own help text
 * (BR-F05-24). */
export function wasHints(
	item: SubscriptionItem,
	values: DialogValues,
	locale: SubscriptionsLocale,
): Partial<Record<DialogField, string>> {
	const hints: Partial<Record<DialogField, string>> = {};
	const name = normalizeText(values.name);
	if (name.ok && name.value !== item.name) hints.name = `Was ${item.name}`;
	const typed = parseAmount(values.amount, locale);
	if (typed.ok && typed.minor !== item.amountMinor) {
		hints.amount = `Was ${money(item.amountMinor, locale)}`;
	}
	const cadence = cadenceOf(values);
	if (cadence !== null && !sameCadence(cadence, item.cadence)) {
		hints.cadence = `Was ${cadenceLabel(item.cadence)}`;
	}
	if (values.category !== null && values.category !== item.category) {
		hints.category = `Was ${categoryLabel(item.category)}`;
	}
	if (values.startDate !== item.startDate) {
		hints.startDate = `Was ${formatDateYear(item.startDate, locale)}`;
	}
	return hints;
}

/** "Filled from your last Netflix expense: Entertainment, ₹649.00." (BR-F05-24, D-594). */
export function filledHint(
	payee: string,
	expense: { category: ExpenseCategory; amountMinor: number },
	f: Formats,
): string {
	return `Filled from your last ${payee} expense: ${categoryLabel(expense.category)}, ${money(expense.amountMinor, f)}.`;
}

/** The body of an Add (BR-F05-24, section 11), or `null` while the amount, the cadence or the
 * category cannot make one. `backfill` is whether the past charges are asked for and offered. */
export function createBody(
	values: DialogValues,
	locale: SubscriptionsLocale,
	{
		id,
		createdAt,
		backfill,
	}: { id: string; createdAt: string; backfill: boolean },
): SubscriptionCreateInput | null {
	const typed = parseAmount(values.amount, locale);
	const cadence = cadenceOf(values);
	if (!typed.ok || cadence === null || values.category === null) return null;
	return {
		id,
		name: values.name,
		amountMinor: typed.minor,
		currency: locale.currency,
		cadence,
		startDate: values.startDate,
		category: values.category,
		note: values.note,
		backfill,
		createdAt,
	};
}

// --- The schedule line (BR-F05-24) and the past charges (BR-F05-04) ----------------------------

/** The schedule line, in two lines of text: how it repeats with what it costs, and when the
 * next charges are. */
export type ScheduleSummary = { repeats: string; next: string | null };

/** The words "Every month on the 5th" is followed by, from the cost of the schedule. */
function costWords(
	cadence: Cadence,
	amountMinor: number | null,
	f: Formats,
): string {
	if (amountMinor === null) return "";
	const cost = { amountMinor, cadence };
	const monthly =
		presetOf(cadence) === "monthly" ? "" : (
			` · ≈ ${money(monthlyMinor(cost), f)} a month`
		);
	return ` · ${money(yearlyMinor(cost), f)} a year${monthly}`;
}

/** The first dates of an Add's schedule: the first three chargeable dates on or after today,
 * whichever past-charges choice is picked (BR-F05-24). */
export function addNextDates(
	schedule: { startDate: string; cadence: Cadence },
	today: string,
): string[] {
	const chargesFrom = schedule.startDate > today ? schedule.startDate : today;
	return nextChargeDates(
		{ ...schedule, chargesFrom, endDate: null, pause: null },
		{ from: chargesFrom, count: 3 },
	);
}

/** The schedule line's second line: "Next charges: Thu, 5 Nov, …." or, for a start that has not
 * come, "Starts Sat, 5 Dec, …."; `null` with no date. */
export function nextChargesLine(
	dates: readonly string[],
	{ starts }: { starts: boolean },
	f: Formats,
): string | null {
	if (dates.length === 0) return null;
	return `${starts ? "Starts" : "Next charges:"} ${dates.map((date) => formatDayHeader(date, f)).join(", ")}.`;
}

/** The schedule line (BR-F05-24): how the schedule repeats, with its yearly and monthly cost
 * once the amount is valid, and its next dates. */
export function scheduleSummary(
	{
		repeats,
		cadence,
		amountMinor,
		dates,
		starts,
	}: {
		repeats: string;
		cadence: Cadence;
		amountMinor: number | null;
		dates: readonly string[];
		starts: boolean;
	},
	f: Formats,
): ScheduleSummary {
	return {
		repeats: `${repeats}${costWords(cadence, amountMinor, f)}`,
		next: nextChargesLine(dates, { starts }, f),
	};
}

/** What the past-charges choice says (BR-F05-04), or `null` when no due date lies before today.
 * `nextFirst` is the first charge without them. */
export type PastChoices = {
	heading: string;
	no: { title: string; description: string };
	yes: { title: string; description: string };
	count: number;
};

/** How long before today, in words: days below 60, else months as days ÷ 30.44, rounded
 * (BR-F05-04). */
export function spanBefore(startDate: string, today: string): string {
	const days = daysInRange(startDate, today) - 1;
	if (days < 60) return days === 1 ? "1 day" : `${days} days`;
	return `${Math.round(days / 30.44)} months`;
}

export function pastChoices(
	{
		name,
		startDate,
		cadence,
		amountMinor,
		nextFirst,
	}: {
		name: string;
		startDate: string;
		cadence: Cadence;
		amountMinor: number | null;
		nextFirst: string | null;
	},
	f: Formats,
): PastChoices | null {
	const preview = backfillPreview(
		{ startDate, cadence, amountMinor: amountMinor ?? 0 },
		f.today,
	);
	if (preview.count === 0) return null;
	const first = preview.dates[0] as string;
	const last = preview.dates.at(-1) as string;
	const noun = preview.count === 1 ? "charge" : "charges";
	const total = amountMinor === null ? "" : `, ${money(preview.totalMinor, f)}`;
	const firstCharge =
		nextFirst === null ? "" : `First charge: ${formatDayHeader(nextFirst, f)}. `;
	return {
		count: preview.count,
		heading: `${name === "" ? "This Subscription" : name} started ${spanBefore(startDate, f.today)} before today. Add the charges from before?`,
		no: {
			title: DIALOG_TEXT.pastNo,
			description: `${firstCharge}${DIALOG_TEXT.pastNoNote}`,
		},
		yes: {
			title: `Yes, add ${preview.count} past ${noun}${total}`,
			description: `${
				preview.count === 1 ?
					`One expense on ${formatDateYear(first, f)}.`
				:	`One expense on each due date, from ${formatDateYear(first, f)} to ${formatDateYear(last, f)}.`
			} ${DIALOG_TEXT.pastYesNote}`,
		},
	};
}

/** The note under the past-charges choice when expenses of the same name already lie in the
 * period (BR-F05-04): "You already have 2 Netflix expenses in that period, on 5 Sep, 5 Oct.
 * Adding past charges would count them twice." The dates are the oldest three, then "and
 * more". */
export function duplicateNote(
	name: string,
	dates: readonly string[],
	f: Formats,
): string | null {
	if (dates.length === 0 || name === "") return null;
	const oldest = [...dates].sort().slice(0, 3);
	const shown = oldest.map((date) => shortDate(date, f)).join(", ");
	const more = dates.length > 3 ? " and more" : "";
	const many = dates.length > 1;
	return `You already have ${dates.length} ${name} expense${many ? "s" : ""} in that period, on ${shown}${more}. Adding past charges would count ${many ? "them" : "it"} twice.`;
}

/** What an Add shows below its fields (BR-F05-24, BR-F05-04): the schedule line and the
 * past-charges choice, each `null` until the start date and a custom number are valid, and the
 * choice also `null` when no due date lies before today. The costs wait for a valid amount. */
export function addView(
	values: DialogValues,
	locale: SubscriptionsLocale,
): { schedule: ScheduleSummary | null; past: PastChoices | null } {
	const cadence = cadenceOf(values);
	if (cadence === null || !startDateOk(values.startDate, locale, null)) {
		return { schedule: null, past: null };
	}
	const typed = parseAmount(values.amount, locale);
	const amountMinor = typed.ok ? typed.minor : null;
	const schedule = { startDate: values.startDate, cadence };
	const dates = addNextDates(schedule, locale.today);
	const name = normalizeText(values.name);
	return {
		schedule: scheduleSummary(
			{
				repeats: scheduleText(schedule, locale),
				cadence,
				amountMinor,
				dates,
				starts: values.startDate > locale.today,
			},
			locale,
		),
		past: pastChoices(
			{
				name: name.ok ? name.value : "",
				...schedule,
				amountMinor,
				nextFirst: dates[0] ?? null,
			},
			locale,
		),
	};
}

/** An Edit's schedule line (BR-F05-24): the schedule as the fields leave it, and the next
 * charges the Edit plan found. `null` while the custom number is out of range. */
export function editSchedule(
	values: DialogValues,
	dates: readonly string[],
	locale: SubscriptionsLocale,
): ScheduleSummary | null {
	const cadence = cadenceOf(values);
	if (cadence === null) return null;
	const typed = parseAmount(values.amount, locale);
	return scheduleSummary(
		{
			repeats: scheduleText({ startDate: values.startDate, cadence }, locale),
			cadence,
			amountMinor: typed.ok ? typed.minor : null,
			dates,
			starts: false,
		},
		locale,
	);
}

/** The day before `today`, the last day past charges and duplicates reach (BR-F05-03). */
export const yesterday = (today: string): string => shiftDays(today, -1);
