import { tz } from "@date-fns/tz";
import { differenceInCalendarMonths, parse } from "date-fns";

import { daysInRange, shiftDays, shiftMonths } from "@/lib/time";

/** The schedule maths of a Subscription (F05, BR-F05-01 to BR-F05-02, BR-F05-28), shared by the
 * server and the browser so the page, the calendar, every dialog preview and catch-up agree.
 * Dates are `YYYY-MM-DD` text, read and written in UTC, so the machine's zone never moves them
 * (TIME-10). */

export type CadenceUnit = "week" | "month";

/** How often a Subscription repeats: every `every` weeks or months (D-90). */
export type Cadence = { unit: CadenceUnit; every: number };

/** Due dates `d` with `from <= d < until` are never charged (D-94, BR-F05-28). */
export type Pause = { from: string; until: string };

/** What fixes a Subscription's due dates (BR-F05-01). */
export type Schedule = { startDate: string; cadence: Cadence };

/** What decides which due dates are chargeable (BR-F05-02, BR-F05-28). */
export type Chargeable = Schedule & {
	chargesFrom: string;
	endDate: string | null;
	pause: Pause | null;
};

export const CADENCE_UNITS = ["week", "month"] as const;

/** The most `every` may be for each unit (D-90): 52 weeks or 24 months. */
export const MAX_EVERY = { week: 52, month: 24 } as const satisfies Record<
	CadenceUnit,
	number
>;

/** The four presets (D-90). A custom cadence equal to one is stored and shown as it. */
export const PRESETS = {
	weekly: { unit: "week", every: 1 },
	monthly: { unit: "month", every: 1 },
	quarterly: { unit: "month", every: 3 },
	yearly: { unit: "month", every: 12 },
} as const satisfies Record<string, Cadence>;

export type PresetKey = keyof typeof PRESETS;

/** Whether `value` is a cadence: a known unit and a whole `every` from 1 to the unit's most. */
export function isCadence(value: unknown): value is Cadence {
	if (typeof value !== "object" || value === null) return false;
	const { unit, every } = value as Record<string, unknown>;
	return (
		(unit === "week" || unit === "month")
		&& typeof every === "number"
		&& Number.isInteger(every)
		&& every >= 1
		&& every <= MAX_EVERY[unit]
	);
}

/** The preset a cadence equals, or `custom`. */
export function presetOf(cadence: Cadence): PresetKey | "custom" {
	const found = (Object.keys(PRESETS) as PresetKey[]).find(
		(key) =>
			PRESETS[key].unit === cadence.unit
			&& PRESETS[key].every === cadence.every,
	);
	return found ?? "custom";
}

/** Whether two cadences are the same. */
export function sameCadence(a: Cadence, b: Cadence): boolean {
	return a.unit === b.unit && a.every === b.every;
}

const UTC = tz("UTC");
const readDate = (date: string) =>
	parse(date, "yyyy-MM-dd", new Date(0), { in: UTC });

/** Due date number `k` (BR-F05-01): always counted from `startDate`, never from the previous
 * due date, so a day that a short month clamped returns to the anchor day. */
export function dueAt({ startDate, cadence }: Schedule, k: number): string {
	return cadence.unit === "week" ?
			shiftDays(startDate, 7 * cadence.every * k)
		:	shiftMonths(startDate, cadence.every * k);
}

/** The first `k` whose due date may be on or after `from`: never later than the true one, and
 * at most one step early, so a long range from the start does not walk every earlier date. */
function firstIndex({ startDate, cadence }: Schedule, from: string): number {
	if (from <= startDate) return 0;
	const steps =
		cadence.unit === "week" ?
			(daysInRange(startDate, from) - 1) / (7 * cadence.every)
		:	differenceInCalendarMonths(readDate(from), readDate(startDate), { in: UTC })
			/ cadence.every;
	return Math.max(0, Math.floor(steps) - 1);
}

/** Every due date from `from` to `to`, both included, in order (BR-F05-01). */
export function dueDates(schedule: Schedule, from: string, to: string): string[] {
	const dates: string[] = [];
	if (to < from) return dates;
	for (let k = firstIndex(schedule, from); ; k++) {
		const date = dueAt(schedule, k);
		if (date > to) return dates;
		if (date >= from) dates.push(date);
	}
}

/** Whether `date` is one of the schedule's due dates. */
export function isDueDate(schedule: Schedule, date: string): boolean {
	return dueDates(schedule, date, date).length === 1;
}

/** `date` plus one period of `cadence`: 7 × `every` days, or `every` months, clamped. */
export function addPeriod(cadence: Cadence, date: string): string {
	return cadence.unit === "week" ?
			shiftDays(date, 7 * cadence.every)
		:	shiftMonths(date, cadence.every);
}

/** Whether `date` falls in the pause: `from <= date < until` (BR-F05-28). */
export function inPause(pause: Pause | null, date: string): boolean {
	return pause !== null && date >= pause.from && date < pause.until;
}

/** Whether a charge may fall on `date`: from `chargesFrom` to the end date, and not paused.
 * `ignorePause` leaves the pause out, for a pause that is about to be replaced. */
export function isChargeable(
	subscription: Chargeable,
	date: string,
	{ ignorePause = false }: { ignorePause?: boolean } = {},
): boolean {
	return (
		date >= subscription.chargesFrom
		&& (subscription.endDate === null || date <= subscription.endDate)
		&& (ignorePause || !inPause(subscription.pause, date))
	);
}

/** The due dates from `from` to `to` that are chargeable, in order. */
export function chargeableDates(
	subscription: Chargeable,
	from: string,
	to: string,
	options: { ignorePause?: boolean } = {},
): string[] {
	const first = from > subscription.chargesFrom ? from : subscription.chargesFrom;
	const last =
		subscription.endDate !== null && subscription.endDate < to ?
			subscription.endDate
		:	to;
	return dueDates(subscription, first, last).filter((date) =>
		isChargeable(subscription, date, options),
	);
}

/**
 * The dates catch-up creates a charge on (BR-F05-02): chargeable dates on or before `through`
 * and on or before `today`, with no tombstone in `skipped` and no charge in `charged`. A date
 * in the future is never charged, so `through` after today is today.
 */
export function catchUpDates(
	subscription: Chargeable,
	{
		through,
		today,
		skipped = [],
		charged = [],
	}: {
		through: string;
		today: string;
		skipped?: Iterable<string>;
		charged?: Iterable<string>;
	},
): string[] {
	const taken = new Set([...skipped, ...charged]);
	const last = through < today ? through : today;
	return chargeableDates(subscription, subscription.chargesFrom, last).filter(
		(date) => !taken.has(date),
	);
}

/** How far ahead next due looks before it answers "no more charges" (BR-F05-19). */
export const NEXT_DUE_HORIZON_MONTHS = 120;

/**
 * The earliest chargeable date on or after `today` with no charge and no tombstone, or `null`
 * (BR-F05-19). Paused dates are never chargeable, so a paused Subscription's next due is the
 * first date after its pause. Looks no further than 120 months ahead.
 */
export function nextDueOn(
	subscription: Chargeable,
	{
		today,
		skipped = [],
		charged = [],
	}: { today: string; skipped?: Iterable<string>; charged?: Iterable<string> },
): string | null {
	const taken = new Set([...skipped, ...charged]);
	const horizon = shiftMonths(today, NEXT_DUE_HORIZON_MONTHS);
	const last =
		subscription.endDate !== null && subscription.endDate < horizon ?
			subscription.endDate
		:	horizon;
	const from = today > subscription.chargesFrom ? today : subscription.chargesFrom;
	for (let k = firstIndex(subscription, from); ; k++) {
		const date = dueAt(subscription, k);
		if (date > last) return null;
		if (date < from || taken.has(date)) continue;
		if (isChargeable(subscription, date)) return date;
	}
}
