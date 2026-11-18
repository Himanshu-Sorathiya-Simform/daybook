import { SUBSCRIPTION_MESSAGES as M } from "./messages";
import type { DatedSubscription, SubscriptionRecord } from "./model";
import {
	chargesFromAfterEnd,
	chargesFromAfterPause,
	chargesFromAfterSchedule,
	doubleChargeSkipIssue,
	endMovesEarlier,
	type FieldIssue,
	pauseIssue,
	skipsOffSchedule,
	unskipIssue,
} from "./rules";
import {
	type Cadence,
	isChargeable,
	isDueDate,
	type Pause,
	sameCadence,
} from "./schedule";
import {
	editWindowIssues,
	endDateIssues,
	type SubscriptionEditBody,
} from "./schemas";

/** What a change decides before it writes anything (F05 section 11, BR-F05-08 to BR-F05-14,
 * BR-F05-29 to BR-F05-32): which fields really change, the Subscription after the change, and
 * the rules for its charges and tombstones. Pure, so the data access layer only reads, writes
 * and sequences. */

/** A charge on or after the change date C, as the change decides what to do with it. */
export type LaterCharge = { id: string; dueOn: string; edited: boolean };

/** Which stored values the write really changes: a field sent with its stored value is no
 * change. */
export type ChangedFields = {
	name: boolean;
	amount: boolean;
	category: boolean;
	note: boolean;
	cadence: boolean;
	start: boolean;
	end: boolean;
	pause: boolean;
};

const samePause = (a: Pause | null, b: Pause | null) =>
	a === b
	|| (a !== null && b !== null && a.from === b.from && a.until === b.until);

/** The fields of `body` that differ from `stored`. */
export function changedFields(
	body: SubscriptionEditBody,
	stored: SubscriptionRecord,
): ChangedFields {
	return {
		name: body.name !== undefined && body.name !== stored.name,
		amount:
			body.amountMinor !== undefined
			&& body.amountMinor !== stored.amountMinor,
		category: body.category !== undefined && body.category !== stored.category,
		note: body.note !== undefined && body.note !== stored.note,
		cadence:
			body.cadence !== undefined && !sameCadence(body.cadence, stored.cadence),
		start: body.startDate !== undefined && body.startDate !== stored.startDate,
		end: body.endDate !== undefined && body.endDate !== stored.endDate,
		pause: body.pause !== undefined && !samePause(body.pause, stored.pause),
	};
}

/** The Subscription after the change, and `chargesFrom` as it stood before the pause moved it
 * (the pause check reads that one). `chargesFrom` follows the schedule and the end date
 * (BR-F05-11, BR-F05-13, BR-F05-32), then the pause (BR-F05-29). */
function nextRecord(
	body: SubscriptionEditBody,
	stored: SubscriptionRecord,
	changed: ChangedFields,
	changeDate: string,
): { next: SubscriptionRecord; chargesFromBeforePause: string } {
	const startDate = changed.start ? (body.startDate as string) : stored.startDate;
	const cadence: Cadence =
		changed.cadence ? (body.cadence as Cadence) : stored.cadence;
	const endDate = changed.end ? (body.endDate as string | null) : stored.endDate;
	const pause = changed.pause ? (body.pause as Pause | null) : stored.pause;

	let chargesFrom = stored.chargesFrom;
	if (changed.cadence || changed.start) {
		chargesFrom = chargesFromAfterSchedule({ startDate, changeDate });
	}
	if (changed.end) {
		chargesFrom = chargesFromAfterEnd({
			chargesFrom,
			startDate,
			storedEndDate: stored.endDate,
			newEndDate: endDate,
			changeDate,
			backfillGap: body.backfillGap === true,
		});
	}
	const chargesFromBeforePause = chargesFrom;
	if (changed.pause) {
		chargesFrom = chargesFromAfterPause({
			chargesFrom,
			storedPause: stored.pause,
			newPause: pause,
			changeDate,
		});
	}
	return {
		next: {
			...stored,
			name: changed.name ? (body.name as string) : stored.name,
			amountMinor:
				changed.amount ? (body.amountMinor as number) : stored.amountMinor,
			category:
				changed.category ?
					(body.category as typeof stored.category)
				:	stored.category,
			note: changed.note ? (body.note as string | null) : stored.note,
			cadence,
			startDate,
			endDate,
			pause,
			chargesFrom,
		},
		chargesFromBeforePause,
	};
}

/** The tombstone a write adds with `skipDueOn` and the one it removes with `unskipDueOn`. A
 * date that already has a tombstone adds nothing, and one without removes nothing (D-612). */
function skipChanges(
	body: SubscriptionEditBody,
	stored: DatedSubscription,
): { skipAdded: string | null; skipRemoved: string | null } {
	const { skipDueOn, unskipDueOn } = body;
	return {
		skipAdded:
			skipDueOn !== undefined && !stored.skipped.includes(skipDueOn) ?
				skipDueOn
			:	null,
		skipRemoved:
			unskipDueOn !== undefined && stored.skipped.includes(unskipDueOn) ?
				unskipDueOn
			:	null,
	};
}

/** What a write does, from the body and the stored Subscription at change date C. */
export type ChangePlan = {
	changed: ChangedFields;
	/** The cadence or the start date changes. */
	scheduleChanged: boolean;
	/** The name, amount or category changes: charges after C are repriced (BR-F05-10). */
	valuesChanged: boolean;
	next: SubscriptionRecord;
	chargesFromBeforePause: string;
	/** The end date when it is set or moved earlier: it deletes the unedited charges due after
	 * it, even those before C (BR-F05-12). */
	endCut: string | null;
	/** Charges that the new schedule, end date or pause no longer has are deleted. */
	prune: boolean;
	/** The write reads the charges on or after `laterFrom`. */
	needsCharges: boolean;
	laterFrom: string;
	skipAdded: string | null;
	skipRemoved: string | null;
	/** The write changes something at all. If not, it answers the Subscription as it is: no
	 * version, no charge. */
	isChange: boolean;
	/** Only the note changes: it is saved and nothing else (BR-F05-09). */
	noteOnly: boolean;
	/** The tombstones to delete: off the new schedule after C, and the one brought back. */
	gone: ReadonlySet<string>;
	/** The tombstones after the write, which step 4 catches up with. */
	skippedAfter: string[];
};

/** The plan of `body` over `stored` at change date `changeDate`. */
export function planChange(
	body: SubscriptionEditBody,
	stored: DatedSubscription,
	changeDate: string,
): ChangePlan {
	const changed = changedFields(body, stored);
	const scheduleChanged = changed.cadence || changed.start;
	const valuesChanged = changed.name || changed.amount || changed.category;
	const { next, chargesFromBeforePause } = nextRecord(
		body,
		stored,
		changed,
		changeDate,
	);
	const { skipAdded, skipRemoved } = skipChanges(body, stored);

	const endCut =
		changed.end && endMovesEarlier(stored.endDate, next.endDate) ?
			next.endDate
		:	null;
	const prune = scheduleChanged || changed.pause || endCut !== null;
	const others =
		valuesChanged
		|| scheduleChanged
		|| changed.end
		|| changed.pause
		|| skipAdded !== null
		|| skipRemoved !== null;

	const gone = new Set<string>(
		scheduleChanged ? skipsOffSchedule(next, stored.skipped, changeDate) : [],
	);
	if (skipRemoved !== null) gone.add(skipRemoved);
	return {
		changed,
		scheduleChanged,
		valuesChanged,
		next,
		chargesFromBeforePause,
		endCut,
		prune,
		needsCharges: prune || body.skipDueOn !== undefined,
		laterFrom: endCut !== null && endCut < changeDate ? endCut : changeDate,
		skipAdded,
		skipRemoved,
		isChange: others || changed.note,
		noteOnly: changed.note && !others,
		gone,
		skippedAfter: stored.skipped
			.filter((date) => !gone.has(date))
			.concat(skipAdded === null ? [] : [skipAdded]),
	};
}

/** What a write is judged on: the body, the stored Subscription, its plan, C and today. */
export type ChangeCheck = {
	body: SubscriptionEditBody;
	stored: DatedSubscription;
	plan: ChangePlan;
	changeDate: string;
	today: string;
	/** The charges on or after `plan.laterFrom`, when the plan reads them. */
	later: readonly LaterCharge[];
};

/** The start and end windows of the fields that change, and an end date before the start
 * (BR-F05-30). */
function windowIssues({
	plan: { changed, next },
	changeDate,
}: ChangeCheck): FieldIssue[] {
	const issues = editWindowIssues(
		{
			startDate: changed.start ? next.startDate : undefined,
			endDate: changed.end ? next.endDate : undefined,
		},
		changeDate,
	);
	if (changed.start || changed.end) {
		issues.push(...endDateIssues(next.startDate, next.endDate));
	}
	return issues;
}

/** Why a new pause is refused (BR-F05-29), read over `chargesFrom` as it stood before it. */
function pauseIssues({
	stored,
	plan: { changed, next, chargesFromBeforePause },
	changeDate,
	today,
}: ChangeCheck): FieldIssue[] {
	if (!changed.pause || next.pause === null) return [];
	const found = pauseIssue({
		subscription: {
			...next,
			chargesFrom: chargesFromBeforePause,
			pause: stored.pause,
		},
		skipped: stored.skipped,
		next: next.pause,
		changeDate,
		today,
	});
	return found ? [found] : [];
}

/** Why `skipDueOn` is refused: not a date with a charge (BR-F05-31), or a charge that was
 * edited and so stays. */
function skipIssues({
	body,
	plan: { next },
	changeDate,
	later,
}: ChangeCheck): FieldIssue[] {
	if (body.skipDueOn === undefined) return [];
	const found = doubleChargeSkipIssue(next, body.skipDueOn, changeDate);
	if (found) return [{ path: ["skipDueOn"], message: found }];
	const edited = later.some((c) => c.dueOn === body.skipDueOn && c.edited);
	return edited ? [{ path: ["skipDueOn"], message: M.skipEdited }] : [];
}

/** Why `unskipDueOn` is refused (BR-F05-34). A date with no tombstone changes nothing, whatever
 * its date (D-612); a tombstone on or before C stays. */
function unskipIssues({ body, stored, changeDate }: ChangeCheck): FieldIssue[] {
	if (body.unskipDueOn === undefined) return [];
	if (!stored.skipped.includes(body.unskipDueOn)) return [];
	const found = unskipIssue(body.unskipDueOn, changeDate);
	return found ? [{ path: ["unskipDueOn"], message: found }] : [];
}

/** Every refusal of a write at once, in this order: the windows, the pause, the skip, the
 * unskip. The first of a field's issues is the one it shows. */
export function changeIssues(check: ChangeCheck): FieldIssue[] {
	return [
		...windowIssues(check),
		...pauseIssues(check),
		...skipIssues(check),
		...unskipIssues(check),
	];
}

/** Whether `date` is in the new pause. */
function inNewPause(pause: Pause | null, date: string): boolean {
	return pause !== null && date >= pause.from && date < pause.until;
}

/** Whether the new state no longer has a charge due on `dueOn`: after the end date; or, when
 * the write prunes, one after C or in the new pause that is off the schedule, before
 * `chargesFrom` or in the pause (BR-F05-11, BR-F05-12, BR-F05-29). */
function lapsed(
	dueOn: string,
	{ plan, changeDate }: Pick<ChangeCheck, "plan" | "changeDate">,
): boolean {
	const { endCut, prune, scheduleChanged, next } = plan;
	if (endCut !== null && dueOn > endCut) return true;
	if (!prune) return false;
	if (dueOn <= changeDate && !inNewPause(next.pause, dueOn)) return false;
	return (
		!isChargeable(next, dueOn) || (scheduleChanged && !isDueDate(next, dueOn))
	);
}

/** The ids of the unedited charges the change deletes: those the new state no longer has, and
 * the one on the date `skipDueOn` skips (BR-F05-31). An edited charge always stays. */
export function doomedCharges(
	later: readonly LaterCharge[],
	check: Pick<ChangeCheck, "body" | "plan" | "changeDate">,
): string[] {
	return later
		.filter(
			(charge) =>
				!charge.edited
				&& (lapsed(charge.dueOn, check)
					|| charge.dueOn === check.body.skipDueOn),
		)
		.map((charge) => charge.id);
}
