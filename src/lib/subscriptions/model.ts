import { firstDayOf, lastDayOf, type Month, monthOf } from "@/lib/budgets/months";
import type { EXPENSE_CATEGORIES } from "@/lib/categories";
import { compareCodeUnits } from "@/lib/compare";
import { lowercase } from "@/lib/text";
import { shiftDays } from "@/lib/time";

import {
	type Cadence,
	type Chargeable,
	chargeableDates,
	dueDates,
	inPause,
	isChargeable,
	nextDueOn,
} from "./schedule";

/** The values a Subscription has and the figures derived from them (F05 section 3, BR-F05-16
 * to BR-F05-20, BR-F05-35, BR-F05-38), shared by the server and the browser. Money is integers
 * in the minor unit and every division is exact (MON-1, MON-7). */

export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

/** A Subscription's stored fields (F05 section 3). */
export type SubscriptionRecord = Chargeable & {
	id: string;
	name: string;
	amountMinor: number;
	category: ExpenseCategory;
	note: string | null;
	lastChangeOn: string;
	demo: boolean;
	version: number;
};

/** The due dates of one Subscription that already have a charge, and its tombstones. */
export type DatedWith = {
	charged: readonly string[];
	skipped: readonly string[];
};

/** `ended` is first, then `upcoming`, `paused`, `ending` and `active` (F05 section 3). */
export type SubscriptionStatus =
	"ended" | "upcoming" | "paused" | "ending" | "active";

/**
 * The first match of: `ended` (the end date is on or before today), `upcoming` (it starts
 * after today), `paused` (a pause that ends after today), `ending` (an end date is set),
 * `active` (F05 section 3, D-597). A pause that has not started yet is `paused` too, since it
 * always starts on the next due date (BR-F05-28).
 */
export function statusOf(
	subscription: Pick<Chargeable, "startDate" | "endDate" | "pause">,
	today: string,
): SubscriptionStatus {
	if (subscription.endDate !== null && subscription.endDate <= today)
		return "ended";
	if (subscription.startDate > today) return "upcoming";
	if (subscription.pause !== null && subscription.pause.until > today)
		return "paused";
	if (subscription.endDate !== null) return "ending";
	return "active";
}

// --- Costs (BR-F05-16, BR-F05-17, MON-7) -----------------------------------------------------

const PER_YEAR = { week: 52, month: 12 } as const satisfies Record<
	Cadence["unit"],
	number
>;

/** `numerator ÷ denominator` rounded half away from zero (MON-7), for a numerator that is not
 * negative, with no float: 5 ÷ 2 is 3 and 7 ÷ 3 is 2. */
export function divideRounded(numerator: bigint, denominator: bigint): bigint {
	const two = BigInt(2);
	return (numerator * two + denominator) / (two * denominator);
}

type CostInput = { amountMinor: number; cadence: Cadence };

/** What one Subscription costs in a year, exactly: `amount × 52 ÷ every` for weeks and
 * `amount × 12 ÷ every` for months (BR-F05-16), as a fraction. */
function yearlyFraction({ amountMinor, cadence }: CostInput) {
	return {
		numerator: BigInt(amountMinor) * BigInt(PER_YEAR[cadence.unit]),
		denominator: BigInt(cadence.every),
	};
}

/** The yearly cost of one Subscription, rounded half away from zero once (BR-F05-16). Golden:
 * Netflix 7,788.00, Amazon Prime 1,499.00; 100.00 every 3 weeks is 1,733.33. */
export function yearlyMinor(subscription: CostInput): number {
	const { numerator, denominator } = yearlyFraction(subscription);
	return Number(divideRounded(numerator, denominator));
}

/** The monthly equivalent of one Subscription, for display (BR-F05-16): its yearly cost
 * ÷ 12, taken from the unrounded yearly cost and rounded once. Golden: Amazon Prime 124.92. */
export function monthlyMinor(subscription: CostInput): number {
	const { numerator, denominator } = yearlyFraction(subscription);
	return Number(divideRounded(numerator, denominator * BigInt(12)));
}

/** The least common multiple of 1 to 52, every `every` a cadence can have: a denominator that
 * lets any yearly costs be added without rounding. */
const COMMON_DENOMINATOR = (() => {
	const gcd = (a: bigint, b: bigint): bigint =>
		b === BigInt(0) ? a : gcd(b, a % b);
	let common = BigInt(1);
	for (let every = 2; every <= 52; every++) {
		const next = BigInt(every);
		common = (common * next) / gcd(common, next);
	}
	return common;
})();

export type CostTotals = {
	monthlyMinor: number;
	yearlyMinor: number;
	/** How many Subscriptions the totals count. */
	count: number;
};

/**
 * The page totals (BR-F05-17): the yearly costs summed unrounded and rounded once, and that
 * sum ÷ 12 rounded once. The caller passes the Subscriptions that have a next due date, paused
 * ones included. Golden: 243,287.00 a year and 20,273.92 a month (243,287.00 ÷ 12 =
 * 20,273.9166…).
 */
export function costTotals(subscriptions: readonly CostInput[]): CostTotals {
	let sum = BigInt(0);
	for (const subscription of subscriptions) {
		const { numerator, denominator } = yearlyFraction(subscription);
		sum += numerator * (COMMON_DENOMINATOR / denominator);
	}
	const yearly = divideRounded(sum, COMMON_DENOMINATOR);
	const monthly = divideRounded(sum, COMMON_DENOMINATOR * BigInt(12));
	for (const total of [yearly, monthly]) {
		if (total > BigInt(Number.MAX_SAFE_INTEGER))
			throw new RangeError(
				"The total is too large to hold as a whole number.",
			);
	}
	return {
		monthlyMinor: Number(monthly),
		yearlyMinor: Number(yearly),
		count: subscriptions.length,
	};
}

// --- Next due and upcoming (BR-F05-19, BR-F05-20) ---------------------------------------------

/** The Subscription with the dates it has handled: what `nextDueOn` and the upcoming list read. */
export type DatedSubscription = SubscriptionRecord & DatedWith;

/** A Subscription's next due date, given its charges and tombstones (BR-F05-19). */
export function nextDueOf(
	subscription: DatedSubscription,
	today: string,
): string | null {
	return nextDueOn(subscription, {
		today,
		charged: subscription.charged,
		skipped: subscription.skipped,
	});
}

/** One entry of the upcoming list (F05 section 11). */
export type UpcomingEntry = {
	subscriptionId: string;
	dueOn: string;
	amountMinor: number;
};

/** The order Subscriptions sort in when their dates tie: by name, then id, compared by code
 * unit after lower-casing as Postgres does, so server and browser never disagree (D-497). */
export function compareByName(
	a: { name: string; id: string },
	b: { name: string; id: string },
): number {
	return (
		compareCodeUnits(lowercase(a.name), lowercase(b.name))
		|| compareCodeUnits(a.id, b.id)
	);
}

/**
 * Every chargeable date from `today` through `today + days`, both included, with no charge and
 * no tombstone, at the current amount (BR-F05-20): weekly Subscriptions appear up to five
 * times. Sorted by date, then name. Ended Subscriptions add nothing, and paused dates are left
 * out. Golden at 30 days: Netflix 5 Nov, Cult Gym 10 Nov, Sunrise Apartments 1 Dec.
 */
export function upcomingCharges(
	subscriptions: readonly DatedSubscription[],
	today: string,
	days = 30,
): UpcomingEntry[] {
	const to = shiftDays(today, days);
	const entries: (UpcomingEntry & { name: string })[] = [];
	for (const subscription of subscriptions) {
		if (statusOf(subscription, today) === "ended") continue;
		const taken = new Set([...subscription.charged, ...subscription.skipped]);
		for (const dueOn of chargeableDates(subscription, today, to)) {
			if (taken.has(dueOn)) continue;
			entries.push({
				subscriptionId: subscription.id,
				dueOn,
				amountMinor: subscription.amountMinor,
				name: subscription.name,
			});
		}
	}
	entries.sort(
		(a, b) =>
			compareCodeUnits(a.dueOn, b.dueOn)
			|| compareByName(
				{ name: a.name, id: a.subscriptionId },
				{ name: b.name, id: b.subscriptionId },
			),
	);
	return entries.map(({ subscriptionId, dueOn, amountMinor }) => ({
		subscriptionId,
		dueOn,
		amountMinor,
	}));
}

/** The sum of the entries' amounts. */
export function upcomingTotal(entries: readonly UpcomingEntry[]): number {
	return entries.reduce((total, entry) => total + entry.amountMinor, 0);
}

// --- Months (BR-F05-18, BR-F05-36, BR-F05-38) ---------------------------------------------------

/** The chargeable dates of `month` on or after `today` with no charge and no tombstone: what is
 * still to come that month, paused dates left out (BR-F05-18). */
export function dueInMonth(
	subscription: DatedSubscription,
	month: Month,
	today: string,
): string[] {
	const first = firstDayOf(month);
	const from = today > first ? today : first;
	const taken = new Set([...subscription.charged, ...subscription.skipped]);
	return chargeableDates(subscription, from, lastDayOf(month)).filter(
		(date) => !taken.has(date),
	);
}

/** The sum of `month`'s still-to-come charges at current amounts: 0 for a past month
 * (BR-F05-36). Golden November: 2,149.00; December: 20,149.00. */
export function expectedMinor(
	subscriptions: readonly DatedSubscription[],
	month: Month,
	today: string,
): number {
	return subscriptions.reduce(
		(total, subscription) =>
			total
			+ subscription.amountMinor
				* dueInMonth(subscription, month, today).length,
		0,
	);
}

/** A charge of the month as F03's list gives it (`src=subscription`): its Subscription, or
 * `null` once that is deleted. */
export type MonthCharge = {
	id: string;
	subscriptionId: string | null;
	occurredOn: string;
	payee: string;
	category: string;
	amountMinor: number;
};

/** `charged` is a charge, `skipped` a tombstone, `due` a charge still to come, `paused` a due
 * date left out by a pause, and `pending` a date of a Subscription not yet synced (M5). */
export type MonthItemKind = "charged" | "skipped" | "due" | "paused" | "pending";

export type MonthItem = {
	date: string;
	kind: MonthItemKind;
	/** `null` for a charge of a deleted Subscription. */
	subscriptionId: string | null;
	name: string;
	category: string;
	amountMinor: number;
	/** The Transaction of a `charged` item. */
	chargeId: string | null;
};

/**
 * Everything in `month`, for the calendar (BR-F05-38): every charge (deleted Subscriptions'
 * too); tombstoned due dates from `chargesFrom` to the end date; paused due dates from today
 * on; and chargeable dates from today on with no charge and no tombstone. Sorted by date, then
 * amount, largest first, then name. `pending` marks a Subscription that is not synced yet.
 */
export function monthItems(
	subscriptions: readonly (SubscriptionRecord
		& Pick<DatedWith, "skipped"> & { pending?: boolean })[],
	charges: readonly MonthCharge[],
	month: Month,
	today: string,
): MonthItem[] {
	const items: MonthItem[] = [];
	const byId = new Map(subscriptions.map((each) => [each.id, each]));
	const charged = new Set<string>();
	for (const charge of charges) {
		if (monthOf(charge.occurredOn) !== month) continue;
		const subscription =
			charge.subscriptionId === null ?
				undefined
			:	byId.get(charge.subscriptionId);
		items.push({
			date: charge.occurredOn,
			kind: "charged",
			subscriptionId: charge.subscriptionId,
			name: subscription?.name ?? charge.payee,
			category: charge.category,
			amountMinor: charge.amountMinor,
			chargeId: charge.id,
		});
		if (charge.subscriptionId !== null)
			charged.add(`${charge.subscriptionId} ${charge.occurredOn}`);
	}
	for (const subscription of subscriptions) {
		const skipped = new Set(subscription.skipped);
		for (const date of dueDates(
			subscription,
			firstDayOf(month),
			lastDayOf(month),
		)) {
			if (charged.has(`${subscription.id} ${date}`)) continue;
			if (!isChargeable(subscription, date, { ignorePause: true })) continue;
			let kind: MonthItemKind | null = null;
			if (skipped.has(date)) kind = "skipped";
			else if (date >= today && inPause(subscription.pause, date))
				kind = "paused";
			else if (date >= today) kind = subscription.pending ? "pending" : "due";
			if (kind === null) continue;
			items.push({
				date,
				kind,
				subscriptionId: subscription.id,
				name: subscription.name,
				category: subscription.category,
				amountMinor: subscription.amountMinor,
				chargeId: null,
			});
		}
	}
	return items.sort(
		(a, b) =>
			compareCodeUnits(a.date, b.date)
			|| b.amountMinor - a.amountMinor
			|| compareCodeUnits(lowercase(a.name), lowercase(b.name))
			|| compareCodeUnits(a.chargeId ?? "", b.chargeId ?? ""),
	);
}

/** A month's charged and still-to-come figures from its items (BR-F05-18): `due` counts as to
 * come, `pending`, `skipped` and `paused` do not. */
export function monthTotals(items: readonly MonthItem[]): {
	chargedMinor: number;
	toComeMinor: number;
} {
	let chargedMinor = 0;
	let toComeMinor = 0;
	for (const item of items) {
		if (item.kind === "charged") chargedMinor += item.amountMinor;
		else if (item.kind === "due") toComeMinor += item.amountMinor;
	}
	return { chargedMinor, toComeMinor };
}
