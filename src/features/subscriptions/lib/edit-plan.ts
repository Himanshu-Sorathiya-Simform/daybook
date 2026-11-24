import { parseAmount } from "@/lib/amount";
import { shiftDays } from "@/lib/time";
import type { Transaction } from "@/lib/transactions/model";
import { type ChangePlan, planChange } from "@/lib/subscriptions/change-plan";
import { costTotals, type DatedSubscription } from "@/lib/subscriptions/model";
import { nextChargeDates, scheduleChangeNote } from "@/lib/subscriptions/rules";
import { isDueDate } from "@/lib/subscriptions/schedule";
import {
	type SubscriptionEditBody,
	type SubscriptionEditInput,
	subscriptionEditSchema,
} from "@/lib/subscriptions/schemas";
import { cadenceOf, type DialogMessages, type DialogValues } from "./dialog";
import { formatDayHeader } from "@/lib/date-format";
import { linkedCharges, type StripItem } from "./charges";
import { money, shortDate } from "./labels";
import type { SubscriptionItem, SubscriptionsLocale } from "./types";

/** What an Edit does, before it is saved (BR-F05-24, BR-F05-30, BR-F05-31): the write it would
 * send, and the "What changes" section that shows it. The plan is the server's own
 * (`planChange`), so what the section shows is what the write does. */

export type { StripItem, StripItemKind } from "./charges";

/** The double-charge choice (BR-F05-31), as the dialog writes it. */
export type DoubleChargeChoice = {
	/** The new schedule's first date, offered as "Skip 15 Nov, so it isn't charged twice". */
	skipOn: string;
	title: string;
	description: string;
};

export type EditView = {
	/** The write to send, or `null` when nothing changes: Save then only closes. */
	body: SubscriptionEditInput | null;
	/** "What changes" shows: a field other than the note changed (BR-F05-24). */
	preview: boolean;
	/** Only the note changes. */
	noteOnly: boolean;
	/** The next charges of the schedule line, from the Subscription as the change leaves it. */
	nextDates: string[];
	strip: StripItem[];
	/** "Past charges stay as they are. …" for a start or cadence change. */
	scheduleChanged: boolean;
	values: string | null;
	doubleCharge: DoubleChargeChoice | null;
	/** "20 Oct has passed, so nothing is charged until Fri, 20 Nov." */
	passed: string | null;
	/** The unedited past charges "Also change the 2 past charges" would change. */
	alsoPast: number;
	costLine: string | null;
};

/** The value sentence of a change to the amount, name or category (BR-F05-24). */
export function valueSentence(changed: {
	amount: boolean;
	name: boolean;
	category: boolean;
}): string | null {
	const { amount, name, category } = changed;
	if (amount && !name && !category) {
		return "Charges up to today keep their amount. Later ones use the new amount.";
	}
	if (amount) {
		return "Charges up to today keep their amount, name and category. Later ones use the new ones.";
	}
	if (name && category) {
		return "Charges up to today keep their name and category. Later ones use the new ones.";
	}
	if (name) {
		return "Charges up to today keep their name. Later ones use the new one.";
	}
	if (category) {
		return "Charges up to today keep their category. Later ones use the new one.";
	}
	return null;
}

/** How long one period of the new cadence is, as the double-charge line says it: "one month",
 * "5 weeks" (BR-F05-31). */
export function periodWords(cadence: {
	unit: "week" | "month";
	every: number;
}): string {
	const { unit, every } = cadence;
	if (unit === "month" && every === 12) return "one year";
	if (every === 1) return `one ${unit}`;
	return `${every} ${unit}s`;
}

/** "Monthly cost 20,273.92 → 21,773.92 · Yearly 243,287.00 → 261,287.00" (BR-F05-24). */
function costLineOf(
	item: SubscriptionItem,
	items: readonly SubscriptionItem[],
	after: { amountMinor: number; cadence: SubscriptionItem["cadence"] },
	f: SubscriptionsLocale,
): string {
	const running = items.filter((each) => each.nextDueOn !== null);
	const before = costTotals(running);
	const next = costTotals([
		...running.filter((each) => each.id !== item.id),
		after,
	]);
	return `Monthly cost ${money(before.monthlyMinor, f)} → ${money(next.monthlyMinor, f)} · Yearly ${money(before.yearlyMinor, f)} → ${money(next.yearlyMinor, f)}`;
}

/** The new Subscription's own words for what it would charge (the name and the figures the
 * body carries), used by the strip. */
function strip({
	item,
	kept,
	plan,
	newAmount,
	skip,
	others,
	locale,
}: {
	item: SubscriptionItem;
	kept: readonly (Transaction & { dueOn: string })[];
	plan: ChangePlan;
	newAmount: number;
	skip: { on: string; ticked: boolean } | null;
	others: readonly string[];
	locale: SubscriptionsLocale;
}): StripItem[] {
	const items: StripItem[] = kept.map((charge) => ({
		kind: "kept",
		label: shortDate(charge.dueOn, locale),
		amount: money(charge.amountMinor, locale),
	}));
	items.push({ kind: "today", label: "Today" });
	const oldNext = item.nextDueOn;
	if (plan.scheduleChanged && oldNext !== null && !isDueDate(plan.next, oldNext)) {
		items.push({
			kind: "off",
			label: shortDate(oldNext, locale),
			amount: money(item.amountMinor, locale),
			note: "moves",
		});
	}
	if (skip !== null) {
		items.push({
			kind: skip.ticked ? "off" : "new",
			label: shortDate(skip.on, locale),
			amount: money(newAmount, locale),
			note: skip.ticked ? "skipped" : "second charge",
			warn: !skip.ticked,
		});
	}
	for (const date of others) {
		items.push({
			kind: "new",
			label: shortDate(date, locale),
			amount: money(newAmount, locale),
		});
	}
	items.push({ kind: "more", label: "" });
	return items;
}

type Note = NonNullable<ReturnType<typeof scheduleChangeNote>>;

/** The fields as F05's edit schema reads them, so what is compared with the Subscription is the
 * normalized text (BR-F05-46); a field with a message stands in as the Subscription's own value.
 * `null` when the schema refuses them. */
function parsedEdit({
	item,
	values,
	messages,
	cadence,
	locale,
	changedAt,
}: {
	item: SubscriptionItem;
	values: DialogValues;
	messages: DialogMessages;
	cadence: NonNullable<ReturnType<typeof cadenceOf>>;
	locale: SubscriptionsLocale;
	changedAt: string;
}): SubscriptionEditBody | null {
	const typed = parseAmount(values.amount, locale);
	const parsed = subscriptionEditSchema.safeParse({
		changedAt,
		name: messages.name === undefined ? values.name : item.name,
		amountMinor: typed.ok && !messages.amount ? typed.minor : item.amountMinor,
		currency: locale.currency,
		cadence,
		startDate:
			messages.startDate === undefined ? values.startDate : item.startDate,
		category: messages.category === undefined ? values.category : item.category,
		note: messages.note === undefined ? values.note : (item.note ?? ""),
	});
	return parsed.success ? parsed.data : null;
}

/** The view of an Edit that changes nothing: no write, no preview. */
function unchangedView(plan: ChangePlan, changeDate: string): EditView {
	return {
		body: null,
		preview: false,
		noteOnly: false,
		nextDates: nextChargeDates(plan.next, {
			from: shiftDays(changeDate, 1),
			skipped: plan.skippedAfter,
			count: 3,
		}),
		strip: [],
		scheduleChanged: false,
		values: null,
		doubleCharge: null,
		passed: null,
		alsoPast: 0,
		costLine: null,
	};
}

/** Only the fields that differ from the Subscription are sent, an amount with its currency
 * (BR-F05-25, BR-F05-46). */
function editBody({
	changedAt,
	data,
	changed,
	currency,
	skipOn,
	alsoPast,
}: {
	changedAt: string;
	data: SubscriptionEditBody;
	changed: ChangePlan["changed"];
	currency: SubscriptionsLocale["currency"];
	/** The double-charge skip when it is ticked. */
	skipOn: string | null;
	alsoPast: boolean;
}): SubscriptionEditInput {
	const body: SubscriptionEditInput = { changedAt };
	if (changed.name) body.name = data.name;
	if (changed.amount) {
		body.amountMinor = data.amountMinor;
		body.currency = currency;
	}
	if (changed.cadence) body.cadence = data.cadence;
	if (changed.start) body.startDate = data.startDate;
	if (changed.category) body.category = data.category;
	if (changed.note) body.note = data.note;
	if (skipOn !== null) body.skipDueOn = skipOn;
	if (alsoPast) body.alsoPastCharges = true;
	return body;
}

/** The "Skip the date, so it isn't charged twice" choice (BR-F05-31). */
function doubleChargeOf(
	note: Extract<Note, { kind: "doubleCharge" }>,
	cadence: ChangePlan["next"]["cadence"],
	locale: SubscriptionsLocale,
) {
	const first =
		note.nextAfterSkip === null ?
			""
		:	` The first charge on the new date is ${shortDate(note.nextAfterSkip, locale)}.`;
	return {
		skipOn: note.skipOn,
		title: `Skip ${shortDate(note.skipOn, locale)}, so it isn't charged twice`,
		description: `${shortDate(note.lastChargeOn, locale)} was already charged, less than ${periodWords(cadence)} before it.${first}`,
	};
}

/** The line for a date that has passed, or `null` when the schedule change has none. */
function passedLine(note: Note | null, locale: SubscriptionsLocale): string | null {
	if (note?.kind !== "passed") return null;
	return `${shortDate(note.passedOn, locale)} has passed, so nothing is charged until ${formatDayHeader(note.nextOn, locale)}.`;
}

/** The cost line, when the amount or the cadence changes for a Subscription that is running. */
function costLineFor(
	item: SubscriptionItem,
	items: readonly SubscriptionItem[],
	plan: ChangePlan,
	newAmount: number,
	locale: SubscriptionsLocale,
): string | null {
	const { changed } = plan;
	if (!(changed.amount || changed.cadence) || item.nextDueOn === null) return null;
	return costLineOf(
		item,
		items,
		{ amountMinor: newAmount, cadence: plan.next.cadence },
		locale,
	);
}

/**
 * The Edit as it stands (BR-F05-24, BR-F05-46): the fields judged as the server judges them,
 * the change they make over the Subscription at change date C, which is today online, and from
 * it the write and the section "What changes". `null` while a field has a message. `charges`
 * are the Subscription's linked charges, whole (BR-F05-48), and `items` every Subscription,
 * for the cost line.
 */
export function editView({
	item,
	items,
	values,
	messages,
	charges,
	locale,
	changedAt,
}: {
	item: SubscriptionItem;
	items: readonly SubscriptionItem[];
	values: DialogValues;
	/** The messages the fields have: a field with one stands in as the Subscription's own value,
	 * so the schedule line still has its dates, and nothing is saved or previewed. */
	messages: DialogMessages;
	charges: readonly Transaction[];
	locale: SubscriptionsLocale;
	changedAt: string;
}): EditView | null {
	const cadence = cadenceOf(values);
	if (cadence === null) return null;
	const complete = Object.keys(messages).length === 0;
	const data = parsedEdit({ item, values, messages, cadence, locale, changedAt });
	if (data === null) return null;
	const linked = linkedCharges(charges);
	const stored: DatedSubscription = {
		...item,
		charged: linked.map((charge) => charge.dueOn),
		skipped: item.skips,
	};
	const changeDate = locale.today;
	const plan = planChange(data, stored, changeDate);
	if (!plan.isChange) return unchangedView(plan, changeDate);

	const through = linked
		.filter((charge) => charge.dueOn <= changeDate)
		.sort((a, b) => (a.dueOn < b.dueOn ? -1 : 1));
	const last = through.at(-1) ?? null;
	const note =
		plan.scheduleChanged ?
			scheduleChangeNote({
				next: plan.next,
				skipped: item.skips.filter((date) => !plan.gone.has(date)),
				lastChargeOn: last?.dueOn ?? null,
				changeDate,
			})
		:	null;
	const skipOn = note?.kind === "doubleCharge" ? note.skipOn : null;
	const ticked = skipOn !== null && values.skipDouble;

	// The Subscription as the change leaves it, the double-charge skip included.
	const finalPlan =
		ticked ?
			planChange({ ...data, skipDueOn: skipOn }, stored, changeDate)
		:	plan;
	const nextDates = nextChargeDates(finalPlan.next, {
		from: shiftDays(changeDate, 1),
		skipped: finalPlan.skippedAfter,
		count: 3,
	});
	const newAmount = data.amountMinor ?? item.amountMinor;
	const { changed } = plan;
	const pastUnedited = through.filter((charge) => !charge.edited).length;
	const alsoPast = changed.name || changed.category ? pastUnedited : 0;
	const body = editBody({
		changedAt,
		data,
		changed,
		currency: locale.currency,
		skipOn: ticked ? skipOn : null,
		alsoPast: alsoPast > 0 && values.alsoPast,
	});
	return {
		body: complete ? body : null,
		preview: complete && (plan.scheduleChanged || plan.valuesChanged),
		noteOnly: plan.noteOnly,
		nextDates,
		strip: strip({
			item,
			kept: through.slice(-2),
			plan,
			newAmount,
			skip: skipOn === null ? null : { on: skipOn, ticked },
			others: nextDates.filter((date) => date !== skipOn).slice(0, 2),
			locale,
		}),
		scheduleChanged: plan.scheduleChanged,
		values: valueSentence(changed),
		doubleCharge:
			note?.kind === "doubleCharge" ?
				doubleChargeOf(note, plan.next.cadence, locale)
			:	null,
		passed: passedLine(note, locale),
		alsoPast,
		costLine: costLineFor(item, items, plan, newAmount, locale),
	};
}

/** "Also change the 2 past charges" (BR-F05-30). */
export function alsoPastTitle(count: number): string {
	return `Also change the ${count} past ${count === 1 ? "charge" : "charges"}`;
}
