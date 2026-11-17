import { compareCodeUnits } from "@/lib/compare";
import { shiftDays, shiftMonths, todayIn } from "@/lib/time";

import {
	pauseUntilAfterMessage,
	pauseUntilLimitMessage,
	SUBSCRIPTION_MESSAGES as M,
} from "./messages";
import type { DatedWith } from "./model";
import {
	addPeriod,
	type Chargeable,
	chargeableDates,
	dueDates,
	inPause,
	isChargeable,
	isDueDate,
	type Pause,
	type Schedule,
} from "./schedule";

/** The date rules of a Subscription's writes and previews (F05, BR-F05-03, BR-F05-04,
 * BR-F05-08 to BR-F05-13, BR-F05-26 to BR-F05-32, BR-F05-42, BR-F05-43). Each is a pure
 * function of dates, so the server's change steps and the dialogs' previews cannot disagree.
 * Dates are `YYYY-MM-DD` text; instants are ISO strings or `Date`s. */

/** A field the client got wrong, with the message to show on it. */
export type FieldIssue = { path: string[]; message: string };

// --- The dates a write is made on (BR-F05-03, BR-F05-08) ----------------------------------------

const toDate = (instant: Date | string) =>
	instant instanceof Date ? instant : new Date(instant);

/**
 * The change date C (F05 section 3): the later of the date of `changedAt` in the profile time
 * zone and `lastChangeOn`, never past today. A queued change therefore never reaches back past
 * a change applied before it, and a skewed clock cannot rewrite old history.
 */
export function changeDateOf({
	changedAt,
	lastChangeOn,
	timezone,
	now,
}: {
	changedAt: Date | string;
	lastChangeOn: string;
	timezone: string;
	now: Date;
}): string {
	const made = todayIn(timezone, toDate(changedAt));
	const later = made > lastChangeOn ? made : lastChangeOn;
	const today = todayIn(timezone, now);
	return later > today ? today : later;
}

/** The recording date of a create (BR-F05-03): the date of `createdAt` in the profile time
 * zone, never later than today. */
export function recordingDateOf({
	createdAt,
	timezone,
	now,
}: {
	createdAt: Date | string;
	timezone: string;
	now: Date;
}): string {
	const recorded = todayIn(timezone, toDate(createdAt));
	const today = todayIn(timezone, now);
	return recorded > today ? today : recorded;
}

/** `chargesFrom` of a new Subscription (BR-F05-03): the start date with past charges, else the
 * later of the start date and the recording date. */
export function chargesFromOnCreate({
	startDate,
	recordingDate,
	backfill,
}: {
	startDate: string;
	recordingDate: string;
	backfill: boolean;
}): string {
	if (backfill) return startDate;
	return startDate > recordingDate ? startDate : recordingDate;
}

export type BackfillPreview = {
	dates: string[];
	count: number;
	totalMinor: number;
};

/**
 * The past charges the Add dialog offers (BR-F05-04): one on each due date from the start date
 * up to the day before the recording date. The choice appears only when there is at least one.
 * Golden: monthly 649.00 from 5 Sep 2025, recorded 2 Nov 2026, is 14 charges, 9,086.00.
 */
export function backfillPreview(
	subscription: Schedule & { amountMinor: number },
	recordingDate: string,
): BackfillPreview {
	const dates = dueDates(
		subscription,
		subscription.startDate,
		shiftDays(recordingDate, -1),
	);
	return {
		dates,
		count: dates.length,
		totalMinor: dates.length * subscription.amountMinor,
	};
}

// --- Value and schedule changes (BR-F05-10, BR-F05-11, BR-F05-31) -------------------------------

/** `chargesFrom` after a start or cadence change (BR-F05-11): the new start date if it is after
 * the change date C, otherwise the day after C. The change date always keeps the old schedule. */
export function chargesFromAfterSchedule({
	startDate,
	changeDate,
}: {
	startDate: string;
	changeDate: string;
}): string {
	return startDate > changeDate ? startDate : shiftDays(changeDate, 1);
}

/** The first `count` chargeable dates from `from` with no tombstone in `skipped`, searching
 * 120 months ahead: the "next charges" of a dialog's schedule line and strip. */
export function nextChargeDates(
	subscription: Chargeable,
	{
		from,
		skipped = [],
		count,
	}: { from: string; skipped?: Iterable<string>; count: number },
): string[] {
	const taken = new Set(skipped);
	return chargeableDates(subscription, from, shiftMonths(from, 120))
		.filter((date) => !taken.has(date))
		.slice(0, count);
}

export type ScheduleChangeNote =
	| {
			kind: "doubleCharge";
			/** The new schedule's first date, offered as "Skip 15 Nov, so it isn't charged twice". */
			skipOn: string;
			lastChargeOn: string;
			/** The first charge after the skipped date. */
			nextAfterSkip: string | null;
	  }
	| {
			kind: "passed";
			/** A date of the new schedule between the last charge and the change date, which has
			 * passed and is not charged. */
			passedOn: string;
			nextOn: string;
	  }
	| null;

/**
 * What a start or cadence change needs to tell the user (BR-F05-31). `next` is the Subscription
 * after the change, with `chargesFrom` from `chargesFromAfterSchedule`; `lastChargeOn` is the due
 * date of the last charge on or before the change date C.
 *
 * - **doubleCharge:** the new schedule's first date after C falls less than one new period after
 *   the last charge, so two charges would land in one period.
 * - **passed:** the new schedule has a date between the last charge and C. It has passed and
 *   stays uncharged, so nothing is charged until the next one.
 */
export function scheduleChangeNote({
	next,
	skipped = [],
	lastChargeOn,
	changeDate,
}: {
	next: Chargeable;
	skipped?: Iterable<string>;
	lastChargeOn: string | null;
	changeDate: string;
}): ScheduleChangeNote {
	if (lastChargeOn === null) return null;
	const [first, second] = nextChargeDates(next, {
		from: next.chargesFrom,
		skipped,
		count: 2,
	});
	if (first === undefined) return null;
	const limit = addPeriod(next.cadence, lastChargeOn);
	if (first < limit) {
		return {
			kind: "doubleCharge",
			skipOn: first,
			lastChargeOn,
			nextAfterSkip: second ?? null,
		};
	}
	const [missed] = dueDates(next, shiftDays(lastChargeOn, 1), changeDate);
	if (missed !== undefined && first > limit) {
		return { kind: "passed", passedOn: missed, nextOn: first };
	}
	return null;
}

/** The tombstones after C that are not due dates of the new schedule, which a schedule change
 * deletes (BR-F05-11, D-596). Tombstones through C stay. */
export function skipsOffSchedule(
	schedule: Schedule,
	skipped: readonly string[],
	changeDate: string,
): string[] {
	return skipped.filter((date) => date > changeDate && !isDueDate(schedule, date));
}

// --- End dates, cancel and resume (BR-F05-12, BR-F05-13, BR-F05-32, BR-F05-42) ------------------

/** Whether an end date is set or moved earlier, which deletes the unedited charges due after it
 * (BR-F05-12). */
export function endMovesEarlier(
	storedEndDate: string | null,
	newEndDate: string | null,
): boolean {
	return (
		newEndDate !== null && (storedEndDate === null || newEndDate < storedEndDate)
	);
}

/** The charges an end date deletes and the edited ones that stay (BR-F05-12): unedited charges
 * due after `endDate`, oldest first, and a count of the edited ones after it. */
export function chargesAfterEnd<T extends { dueOn: string; edited: boolean }>(
	charges: readonly T[],
	endDate: string,
): { deleted: T[]; editedStay: number } {
	const after = charges.filter((charge) => charge.dueOn > endDate);
	return {
		deleted: after
			.filter((charge) => !charge.edited)
			.sort((a, b) => compareCodeUnits(a.dueOn, b.dueOn)),
		editedStay: after.filter((charge) => charge.edited).length,
	};
}

/**
 * `chargesFrom` after an end date change (BR-F05-13, BR-F05-32). `startDate` is the start date
 * after the same write.
 *
 * - **Stored end on or after C, or none:** the Subscription is still running, so nothing moves.
 * - **Stored end before C, cleared or moved later:**
 *   - with `backfillGap`, `chargesFrom` becomes the earlier of its value and the day after the
 *     stored end date, never before `startDate`, so the cancelled months are charged;
 *   - when the new end is on or before C, the Subscription ran longer than recorded: nothing
 *     moves, and step 4 charges the dates through the new end;
 *   - otherwise it is a resume: `chargesFrom` becomes the later of its value and C, so the
 *     months while it was cancelled are never charged.
 */
export function chargesFromAfterEnd({
	chargesFrom,
	startDate,
	storedEndDate,
	newEndDate,
	changeDate,
	backfillGap = false,
}: {
	chargesFrom: string;
	startDate: string;
	storedEndDate: string | null;
	newEndDate: string | null;
	changeDate: string;
	backfillGap?: boolean;
}): string {
	if (storedEndDate === null || storedEndDate >= changeDate) return chargesFrom;
	if (newEndDate !== null && newEndDate <= storedEndDate) return chargesFrom;
	if (backfillGap) {
		const gapStart = shiftDays(storedEndDate, 1);
		const earlier = gapStart < chargesFrom ? gapStart : chargesFrom;
		return earlier > startDate ? earlier : startDate;
	}
	if (newEndDate !== null && newEndDate <= changeDate) return chargesFrom;
	return chargesFrom > changeDate ? chargesFrom : changeDate;
}

/**
 * The due dates a resume with "It never actually stopped" would charge (BR-F05-42, BR-F05-32):
 * for an ended Subscription, the due dates after its end date through today with no charge, no
 * tombstone and no pause. None for a Subscription whose end date is today or later.
 */
export function resumeGapDates(
	subscription: Chargeable & DatedWith,
	today: string,
): string[] {
	const { endDate } = subscription;
	if (endDate === null || endDate >= today) return [];
	const taken = new Set([...subscription.charged, ...subscription.skipped]);
	return dueDates(subscription, shiftDays(endDate, 1), today).filter(
		(date) => !taken.has(date) && !inPause(subscription.pause, date),
	);
}

// --- Step 2 of a change (BR-F05-08) -------------------------------------------------------------

/**
 * How far step 2 catches the Subscription up with its old values (BR-F05-08): through the change
 * date C, but
 * - when the change sets an end date or moves it earlier, no further than that end date, so it
 *   never creates a charge that step 3 would delete;
 * - when the change extends a pause over C (only the Undo of Resume now does, BR-F05-34), no
 *   further than the day before C, and C follows the new values.
 */
export function step2Through({
	changeDate,
	storedEndDate,
	newEndDate,
	storedPause,
	newPause,
}: {
	changeDate: string;
	storedEndDate: string | null;
	/** `undefined` when the write does not send an end date. */
	newEndDate?: string | null | undefined;
	storedPause: Pause | null;
	/** `undefined` when the write does not send a pause. */
	newPause?: Pause | null | undefined;
}): string {
	let through = changeDate;
	if (
		newEndDate !== undefined
		&& endMovesEarlier(storedEndDate, newEndDate)
		&& (newEndDate as string) < through
	) {
		through = newEndDate as string;
	}
	if (
		newPause !== undefined
		&& newPause !== null
		&& inPause(newPause, changeDate)
		&& !inPause(storedPause, changeDate)
	) {
		const before = shiftDays(changeDate, -1);
		if (before < through) through = before;
	}
	return through;
}

// --- Skips (BR-F05-26, BR-F05-27, BR-F05-31) ------------------------------------------------------

/** Why `dueOn` cannot be skipped, or `null` (BR-F05-26): it must be a chargeable due date after
 * the change date C. A date that is already skipped is not an error here: the write answers 200
 * with the Subscription unchanged. */
export function skipIssue(
	subscription: Chargeable,
	dueOn: string,
	changeDate: string,
): string | null {
	const upcoming =
		dueOn > changeDate
		&& isDueDate(subscription, dueOn)
		&& isChargeable(subscription, dueOn);
	return upcoming ? null : M.skipNotUpcoming;
}

/** Why a skip cannot be undone, or `null` (BR-F05-27): its date must be after C. */
export function unskipIssue(dueOn: string, changeDate: string): string | null {
	return dueOn > changeDate ? null : M.unskipPassed;
}

/** Why `skipDueOn` is refused, or `null` (BR-F05-31): it must be a due date of the new schedule
 * after C. `next` is the Subscription after the change. */
export function doubleChargeSkipIssue(
	next: Schedule,
	dueOn: string,
	changeDate: string,
): string | null {
	return dueOn > changeDate && isDueDate(next, dueOn) ? null : M.doubleChargeSkip;
}

// --- Pause (BR-F05-28, BR-F05-29, BR-F05-43) -------------------------------------------------------

/** How far ahead a pause may end (BR-F05-29, D-595). */
export const PAUSE_MONTHS_AHEAD = 24;

/** The last day a pause may end on: 24 months after today. */
export function pauseLimit(today: string): string {
	return shiftMonths(today, PAUSE_MONTHS_AHEAD);
}

/**
 * The dates a pause could cover or end on, from the first up to `to`: chargeable due dates after
 * the change date C with no tombstone, with any stored pause left out of the question, since it
 * is the one being replaced (BR-F05-29). The first is where a new pause must start.
 */
export function pausableDates(
	subscription: Chargeable,
	{
		changeDate,
		skipped = [],
		to,
	}: { changeDate: string; skipped?: Iterable<string>; to: string },
): string[] {
	const taken = new Set(skipped);
	return chargeableDates(subscription, shiftDays(changeDate, 1), to, {
		ignorePause: true,
	}).filter((date) => !taken.has(date));
}

/** The pause that skips the next `count` charges (BR-F05-43): from the first pausable date to
 * the one after the last skipped. `null` when that date is missing or past the limit, which
 * disables the choice. */
export function pauseForCount(
	dates: readonly string[],
	count: number,
	limit: string,
): Pause | null {
	const from = dates[0];
	const until = dates[count];
	if (from === undefined || until === undefined || until > limit) return null;
	return { from, until };
}

export type PausePreview = {
	/** The pausable dates the pause covers. */
	paused: string[];
	/** The first date after the pause, or `null` when none follows before the end date. */
	resumeOn: string | null;
};

/** The dates a pause covers and the one that resumes (BR-F05-43), from `pausableDates`. */
export function pausePreview(dates: readonly string[], pause: Pause): PausePreview {
	return {
		paused: dates.filter((date) => inPause(pause, date)),
		resumeOn: dates.find((date) => date >= pause.until) ?? null,
	};
}

/** The pause that Resume now writes (BR-F05-29): a pause in force ends on the change date C, so
 * C itself is charged when it is a due date. A pause that starts on C or later has charged
 * nothing yet, so it is cleared. */
export function resumeNowPause(pause: Pause, changeDate: string): Pause | null {
	return pause.from >= changeDate ? null : { from: pause.from, until: changeDate };
}

/**
 * Why a pause write is refused, or `null` (BR-F05-29). `stored` is the Subscription's pause.
 *
 * - **A pause in force** (stored `from` on or before C, `until` on or after C) with the same
 *   `from` may move `until` to C or later.
 * - **Any other pause** starts on the first pausable date after C and ends after it.
 * - **Either way** `until` is at most 24 months after today.
 */
export function pauseIssue({
	subscription,
	skipped = [],
	next,
	changeDate,
	today,
}: {
	subscription: Chargeable;
	skipped?: Iterable<string>;
	next: Pause;
	changeDate: string;
	today: string;
}): FieldIssue | null {
	const stored = subscription.pause;
	const limit = pauseLimit(today);
	const inForce =
		stored !== null
		&& stored.from <= changeDate
		&& stored.until >= changeDate
		&& next.from === stored.from;
	if (!inForce) {
		const [first] = pausableDates(subscription, {
			changeDate,
			skipped,
			to: shiftMonths(changeDate, 120),
		});
		if (first === undefined || next.from !== first) {
			return { path: ["pause", "from"], message: M.pauseFrom };
		}
	}
	const earliest =
		inForce ?
			maxDate(changeDate, shiftDays(next.from, 1))
		:	shiftDays(next.from, 1);
	if (next.until < earliest) {
		return {
			path: ["pause", "until"],
			message: pauseUntilAfterMessage(shiftDays(earliest, -1)),
		};
	}
	if (next.until > limit) {
		return { path: ["pause", "until"], message: pauseUntilLimitMessage(limit) };
	}
	return null;
}

const maxDate = (a: string, b: string) => (a > b ? a : b);

/**
 * `chargesFrom` after a pause write (BR-F05-29). Clearing a started pause, or replacing it with
 * one that starts elsewhere, moves `chargesFrom` to the later of its value and the earlier of the
 * stored pause's `until` and C, so the dates it paused are never charged afterwards. A pause that
 * has not started yet, or one that only moves its end, changes nothing.
 */
export function chargesFromAfterPause({
	chargesFrom,
	storedPause,
	newPause,
	changeDate,
}: {
	chargesFrom: string;
	storedPause: Pause | null;
	newPause: Pause | null;
	changeDate: string;
}): string {
	if (storedPause === null || storedPause.from > changeDate) return chargesFrom;
	if (newPause !== null && newPause.from === storedPause.from) return chargesFrom;
	const edge = storedPause.until < changeDate ? storedPause.until : changeDate;
	return chargesFrom > edge ? chargesFrom : edge;
}
