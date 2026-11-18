import "server-only";
import { type SQL, sql } from "drizzle-orm";
import type { Month } from "@/lib/budgets/months";
import { isUuid, uuidV7 } from "@/lib/ids";
import { SUBSCRIPTION_MESSAGES as M } from "@/lib/subscriptions/messages";
import type { SubscriptionChanged } from "@/lib/subscriptions/answers";
import type { SubscriptionRecord } from "@/lib/subscriptions/model";
import {
	changeDateOf,
	chargesFromAfterEnd,
	chargesFromAfterPause,
	chargesFromAfterSchedule,
	doubleChargeSkipIssue,
	endMovesEarlier,
	type FieldIssue,
	pauseIssue,
	skipsOffSchedule,
	step2Through,
	unskipIssue,
} from "@/lib/subscriptions/rules";
import {
	changedAtIssues,
	editWindowIssues,
	endDateIssues,
	subscriptionEditSchema,
} from "@/lib/subscriptions/schemas";
import {
	type Cadence,
	isChargeable,
	isDueDate,
	type Pause,
	sameCadence,
} from "@/lib/subscriptions/schedule";
import { ApiError, fromZodError } from "../../api/errors";
import type { ProfiledContext } from "../context";
import { lockCurrency, requireCurrency } from "../currency";
import type { Tx } from "../with-user";
import { catchUpSubscription, chargeContext } from "./catch-up";
import { lockSubscription } from "./lock";
import { getSubscriptionItem } from "./read";

/** A charge on or after the change date C, as the change decides what to do with it. */
type LaterCharge = { id: string; dueOn: string; edited: boolean };

const samePause = (a: Pause | null, b: Pause | null) =>
	a === b
	|| (a !== null && b !== null && a.from === b.from && a.until === b.until);

/** Raises 422 `validation_failed` for `issues`, one message per field, the first one found. */
function refuse(issues: readonly FieldIssue[]): void {
	if (issues.length === 0) return;
	const fields: Record<string, string> = {};
	for (const issue of issues) fields[issue.path.join(".")] ??= issue.message;
	throw new ApiError("validation_failed", { fields });
}

/** The month of each row a statement returned, once each. */
const monthsOf = (rows: readonly { month: Month }[]): Month[] => [
	...new Set(rows.map((row) => row.month)),
];

/** A list of ids or dates as one JSON parameter, for `jsonb_array_elements_text`. */
const jsonList = (values: readonly string[]): SQL =>
	sql`${JSON.stringify(values)}::jsonb`;

/**
 * Changes a Subscription at `If-Match` `version` (F05 section 11, BR-F05-08 to BR-F05-14,
 * BR-F05-29 to BR-F05-32), in this order:
 * 1. An id that is not a UUID is 404 before any statement.
 * 2. The body (`subscriptionEditSchema`): 422 with field paths.
 * 3. The profile lock (D-213); a sent `currency` must match it.
 * 4. `changedAt` inside its window (D-267).
 * 5. The Subscription, locked: 404 without it, 409 with it at another version, before anything
 *    is judged or written.
 * 6. The change date C, then every refusal at once as 422: the start and end windows, an end
 *    date before the start, a pause (BR-F05-29), `skipDueOn` and `unskipDueOn` (BR-F05-31,
 *    BR-F05-34), and a skip over an edited charge. A field sent with its stored value is no
 *    change and is not judged.
 * 7. A write that changes nothing answers the Subscription as it is: no version, no charge.
 * 8. The four steps of BR-F05-08: catch up through C with the old values (stopping short where
 *    `step2Through` says); apply the change and its charge rules; catch up through today with
 *    the new values. A change to the note alone only saves the note (BR-F05-09).
 * The answer is the Subscription as the list shows it, with the change date, the charges
 * created, repriced and deleted, and every month those charges fall in (BR-F05-08).
 */
export async function changeSubscription(
	tx: Tx,
	ctx: ProfiledContext,
	id: string,
	version: number,
	input: unknown,
): Promise<SubscriptionChanged> {
	if (!isUuid(id)) throw new ApiError("not_found");
	const parsed = subscriptionEditSchema.safeParse(input);
	if (!parsed.success) throw fromZodError(parsed.error);
	const body = parsed.data;

	const currency =
		body.currency !== undefined ?
			await requireCurrency(tx, body.currency)
		:	await lockCurrency(tx);
	refuse(changedAtIssues(body.changedAt, ctx.now));
	const { dated: stored, item } = await lockSubscription(
		tx,
		ctx,
		id,
		version,
		currency,
	);

	const changeDate = changeDateOf({
		changedAt: body.changedAt,
		lastChangeOn: stored.lastChangeOn,
		timezone: ctx.profile.timezone,
		now: ctx.now,
	});
	const today = ctx.today;

	// What the write really changes: a field sent with its stored value is no change.
	const nameChanged = body.name !== undefined && body.name !== stored.name;
	const amountChanged =
		body.amountMinor !== undefined && body.amountMinor !== stored.amountMinor;
	const categoryChanged =
		body.category !== undefined && body.category !== stored.category;
	const noteChanged = body.note !== undefined && body.note !== stored.note;
	const cadenceChanged =
		body.cadence !== undefined && !sameCadence(body.cadence, stored.cadence);
	const startChanged =
		body.startDate !== undefined && body.startDate !== stored.startDate;
	const endChanged = body.endDate !== undefined && body.endDate !== stored.endDate;
	const pauseChanged =
		body.pause !== undefined && !samePause(body.pause, stored.pause);
	const scheduleChanged = cadenceChanged || startChanged;
	const valuesChanged = nameChanged || amountChanged || categoryChanged;

	const startDate = startChanged ? (body.startDate as string) : stored.startDate;
	const cadence: Cadence =
		cadenceChanged ? (body.cadence as Cadence) : stored.cadence;
	const endDate = endChanged ? (body.endDate as string | null) : stored.endDate;
	const pause = pauseChanged ? (body.pause as Pause | null) : stored.pause;

	// chargesFrom after the schedule and the end date (BR-F05-11, BR-F05-13, BR-F05-32), then
	// after the pause (BR-F05-29).
	let chargesFrom = stored.chargesFrom;
	if (scheduleChanged) {
		chargesFrom = chargesFromAfterSchedule({ startDate, changeDate });
	}
	if (endChanged) {
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
	if (pauseChanged) {
		chargesFrom = chargesFromAfterPause({
			chargesFrom,
			storedPause: stored.pause,
			newPause: pause,
			changeDate,
		});
	}

	const next: SubscriptionRecord = {
		...stored,
		name: nameChanged ? (body.name as string) : stored.name,
		amountMinor:
			amountChanged ? (body.amountMinor as number) : stored.amountMinor,
		category:
			categoryChanged ?
				(body.category as typeof stored.category)
			:	stored.category,
		note: noteChanged ? (body.note as string | null) : stored.note,
		cadence,
		startDate,
		endDate,
		pause,
		chargesFrom,
	};

	// An end date set or moved earlier deletes the unedited charges due after it, even when they
	// fall before C (BR-F05-12).
	const endCut =
		endChanged && endMovesEarlier(stored.endDate, endDate) ? endDate : null;
	const prune = scheduleChanged || pauseChanged || endCut !== null;
	const needsCharges = prune || body.skipDueOn !== undefined;
	const laterFrom = endCut !== null && endCut < changeDate ? endCut : changeDate;
	const later: LaterCharge[] =
		needsCharges ?
			(
				await tx.execute<LaterCharge>(
					sql`SELECT id, due_on::text AS "dueOn", edited FROM app.transactions
					WHERE subscription_id = ${id}::uuid AND due_on >= ${laterFrom}::date`,
				)
			).rows
		:	[];

	const issues: FieldIssue[] = editWindowIssues(
		{
			startDate: startChanged ? startDate : undefined,
			endDate: endChanged ? endDate : undefined,
		},
		changeDate,
	);
	if (startChanged || endChanged)
		issues.push(...endDateIssues(startDate, endDate));
	if (pauseChanged && pause !== null) {
		const found = pauseIssue({
			subscription: {
				...next,
				chargesFrom: chargesFromBeforePause,
				pause: stored.pause,
			},
			skipped: stored.skipped,
			next: pause,
			changeDate,
			today,
		});
		if (found) issues.push(found);
	}
	if (body.skipDueOn !== undefined) {
		const found = doubleChargeSkipIssue(next, body.skipDueOn, changeDate);
		if (found) issues.push({ path: ["skipDueOn"], message: found });
		else if (later.some((c) => c.dueOn === body.skipDueOn && c.edited)) {
			issues.push({ path: ["skipDueOn"], message: M.skipEdited });
		}
	}
	if (body.unskipDueOn !== undefined) {
		const found = unskipIssue(body.unskipDueOn, changeDate);
		if (found) issues.push({ path: ["unskipDueOn"], message: found });
	}
	refuse(issues);

	const skipAdded =
		body.skipDueOn !== undefined && !stored.skipped.includes(body.skipDueOn) ?
			body.skipDueOn
		:	null;
	const skipRemoved =
		body.unskipDueOn !== undefined && stored.skipped.includes(body.unskipDueOn) ?
			body.unskipDueOn
		:	null;
	const changed =
		valuesChanged
		|| noteChanged
		|| scheduleChanged
		|| endChanged
		|| pauseChanged
		|| skipAdded !== null
		|| skipRemoved !== null;
	const unchanged: SubscriptionChanged = {
		...item,
		currency,
		changeDate,
		chargesCreated: 0,
		chargesUpdated: 0,
		chargesDeleted: 0,
		months: [],
	};
	if (!changed) return unchanged;

	const noteOnly =
		noteChanged
		&& !valuesChanged
		&& !scheduleChanged
		&& !endChanged
		&& !pauseChanged
		&& skipAdded === null
		&& skipRemoved === null;
	const now = ctx.now.toISOString();
	const months = new Set<Month>();
	let chargesCreated = 0;
	let chargesUpdated = 0;
	let chargesDeleted = 0;
	const cctx = chargeContext(ctx);

	if (!noteOnly) {
		// Step 2: close the old period with the old values.
		const closed = await catchUpSubscription(tx, cctx, stored, {
			through: step2Through({
				changeDate,
				storedEndDate: stored.endDate,
				newEndDate: endChanged ? endDate : undefined,
				storedPause: stored.pause,
				newPause: pauseChanged ? pause : undefined,
			}),
			skipped: stored.skipped,
		});
		chargesCreated += closed.created;
		for (const month of closed.months) months.add(month);
	}

	// Step 3: apply.
	if (!noteOnly) {
		// Charges the new state no longer has: unedited ones after the end date, and those after C that
		// are off the new schedule, before `chargesFrom` or in the pause, and those on a pause's dates from
		// C on (BR-F05-11, BR-F05-12, BR-F05-29); the unedited charge on a date skipped by
		// `skipDueOn` (BR-F05-31).
		const doomed = new Set<string>();
		for (const charge of later) {
			if (charge.edited) continue;
			const lapsed =
				(endCut !== null && charge.dueOn > endCut)
				|| (prune
					&& (charge.dueOn > changeDate || inNewPause(pause, charge.dueOn))
					&& (!isChargeable(next, charge.dueOn)
						|| (scheduleChanged && !isDueDate(next, charge.dueOn))));
			if (lapsed || charge.dueOn === body.skipDueOn) doomed.add(charge.id);
		}
		if (doomed.size > 0) {
			const { rows } = await tx.execute<{ month: Month }>(
				sql`DELETE FROM app.transactions
				WHERE subscription_id = ${id}::uuid
					AND id IN (SELECT jsonb_array_elements_text(${jsonList([...doomed])})::uuid)
				RETURNING to_char(occurred_on, 'YYYY-MM') AS month`,
			);
			chargesDeleted += rows.length;
			for (const month of monthsOf(rows)) months.add(month);
		}

		if (valuesChanged) {
			const { rows } = await tx.execute<{ month: Month }>(
				sql`UPDATE app.transactions SET amount_minor = ${String(next.amountMinor)}::bigint,
					category = ${next.category}, payee = ${next.name},
					version = version + 1, updated_at = ${now}
				WHERE subscription_id = ${id}::uuid AND due_on > ${changeDate}::date AND NOT edited
					AND (amount_minor, category, payee) IS DISTINCT FROM
						(${String(next.amountMinor)}::bigint, ${next.category}::text, ${next.name}::text)
				RETURNING to_char(occurred_on, 'YYYY-MM') AS month`,
			);
			chargesUpdated += rows.length;
			for (const month of monthsOf(rows)) months.add(month);
		}
		if (body.alsoPastCharges === true && (nameChanged || categoryChanged)) {
			const { rows } = await tx.execute<{ month: Month }>(
				sql`UPDATE app.transactions SET category = ${next.category}, payee = ${next.name},
					version = version + 1, updated_at = ${now}
				WHERE subscription_id = ${id}::uuid AND due_on <= ${changeDate}::date AND NOT edited
					AND (category, payee) IS DISTINCT FROM (${next.category}::text, ${next.name}::text)
				RETURNING to_char(occurred_on, 'YYYY-MM') AS month`,
			);
			chargesUpdated += rows.length;
			for (const month of monthsOf(rows)) months.add(month);
		}
	}

	// The tombstones: off the new schedule after C, the one skipped, the one brought back.
	const gone = new Set<string>();
	if (scheduleChanged) {
		for (const date of skipsOffSchedule(next, stored.skipped, changeDate))
			gone.add(date);
	}
	if (skipRemoved !== null) gone.add(skipRemoved);
	if (gone.size > 0) {
		await tx.execute(
			sql`DELETE FROM app.subscription_skips
			WHERE subscription_id = ${id}::uuid
				AND due_on IN (SELECT jsonb_array_elements_text(${jsonList([...gone])})::date)`,
		);
	}
	if (skipAdded !== null) {
		await tx.execute(
			sql`INSERT INTO app.subscription_skips (id, user_id, created_at, updated_at,
				subscription_id, due_on)
			VALUES (${uuidV7(ctx.now.getTime())}, ${ctx.user.id}, ${now}, ${now}, ${id}::uuid,
				${skipAdded}::date)
			ON CONFLICT DO NOTHING`,
		);
	}

	await tx.execute(
		sql`UPDATE app.subscriptions SET name = ${next.name}, amount_minor = ${String(next.amountMinor)}::bigint,
			cadence_unit = ${next.cadence.unit}, cadence_every = ${next.cadence.every},
			start_date = ${next.startDate}::date, category = ${next.category}, note = ${next.note},
			end_date = ${next.endDate}::date, pause_from = ${next.pause?.from ?? null}::date,
			pause_until = ${next.pause?.until ?? null}::date, charges_from = ${next.chargesFrom}::date,
			last_change_on = ${noteOnly ? stored.lastChangeOn : changeDate}::date,
			version = version + 1, updated_at = ${now}
		WHERE id = ${id}::uuid`,
	);

	if (!noteOnly) {
		// Step 4: open the new period with the new values.
		const skipped = stored.skipped
			.filter((date) => !gone.has(date))
			.concat(skipAdded === null ? [] : [skipAdded]);
		const opened = await catchUpSubscription(tx, cctx, next, {
			through: today,
			skipped,
		});
		chargesCreated += opened.created;
		for (const month of opened.months) months.add(month);
	}

	const answer = await getSubscriptionItem(tx, ctx, id);
	// The row is locked by this transaction.
	if (!answer) throw new ApiError("not_found");
	return {
		...answer,
		currency,
		changeDate,
		chargesCreated,
		chargesUpdated,
		chargesDeleted,
		months: [...months].sort(),
	};
}

/** Whether `date` is in the new pause. */
function inNewPause(pause: Pause | null, date: string): boolean {
	return pause !== null && date >= pause.from && date < pause.until;
}
