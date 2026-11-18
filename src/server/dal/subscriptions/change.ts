import "server-only";
import { type SQL, sql } from "drizzle-orm";
import type { Month } from "@/lib/budgets/months";
import { compareCodeUnits } from "@/lib/compare";
import { isUuid, uuidV7 } from "@/lib/ids";
import type { SubscriptionChanged } from "@/lib/subscriptions/answers";
import {
	type ChangeCheck,
	type ChangePlan,
	changeIssues,
	doomedCharges,
	type LaterCharge,
	planChange,
} from "@/lib/subscriptions/change-plan";
import {
	type FieldIssue,
	changeDateOf,
	step2Through,
} from "@/lib/subscriptions/rules";
import {
	changedAtIssues,
	subscriptionEditSchema,
} from "@/lib/subscriptions/schemas";
import { ApiError, fromZodError } from "../../api/errors";
import type { ProfiledContext } from "../context";
import { lockCurrency, requireCurrency } from "../currency";
import type { Tx } from "../with-user";
import { catchUpSubscription, chargeContext, type Created } from "./catch-up";
import { lockSubscription } from "./lock";
import { getSubscriptionItem } from "./read";

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

/** What a change counts as it goes: the charges created, repriced and deleted, and every month
 * they fall in. */
type Tally = {
	created: number;
	updated: number;
	deleted: number;
	months: Set<Month>;
};

const addMonths = (tally: Tally, months: Iterable<Month>) => {
	for (const month of months) tally.months.add(month);
};

/** Counts the charges a catch-up created. */
const addCreated = (tally: Tally, made: Created) => {
	tally.created += made.created;
	addMonths(tally, made.months);
};

/** The charges on or after `from`, which the change may delete or reprice. */
async function laterCharges(
	tx: Tx,
	id: string,
	from: string,
): Promise<LaterCharge[]> {
	const { rows } = await tx.execute<LaterCharge>(
		sql`SELECT id, due_on::text AS "dueOn", edited FROM app.transactions
		WHERE subscription_id = ${id}::uuid AND due_on >= ${from}::date`,
	);
	return rows;
}

/**
 * Step 3's writes to the charges: deletes the unedited charges the new state no longer has and
 * the one on a skipped date (BR-F05-11, BR-F05-12, BR-F05-29, BR-F05-31); reprices the unedited
 * ones after C when the name, amount or category changes (BR-F05-10); and, with
 * `alsoPastCharges`, renames and recategorizes those on or before C.
 */
async function applyToCharges(
	tx: Tx,
	id: string,
	now: string,
	check: Pick<ChangeCheck, "body" | "plan" | "later" | "changeDate">,
	tally: Tally,
): Promise<void> {
	const { body, plan, later, changeDate } = check;
	const { next, changed } = plan;
	const doomed = doomedCharges(later, check);
	if (doomed.length > 0) {
		const { rows } = await tx.execute<{ month: Month }>(
			sql`DELETE FROM app.transactions
			WHERE subscription_id = ${id}::uuid
				AND id IN (SELECT jsonb_array_elements_text(${jsonList(doomed)})::uuid)
			RETURNING to_char(occurred_on, 'YYYY-MM') AS month`,
		);
		tally.deleted += rows.length;
		addMonths(tally, monthsOf(rows));
	}

	if (plan.valuesChanged) {
		const { rows } = await tx.execute<{ month: Month }>(
			sql`UPDATE app.transactions SET amount_minor = ${String(next.amountMinor)}::bigint,
				category = ${next.category}, payee = ${next.name},
				version = version + 1, updated_at = ${now}
			WHERE subscription_id = ${id}::uuid AND due_on > ${changeDate}::date AND NOT edited
				AND (amount_minor, category, payee) IS DISTINCT FROM
					(${String(next.amountMinor)}::bigint, ${next.category}::text, ${next.name}::text)
			RETURNING to_char(occurred_on, 'YYYY-MM') AS month`,
		);
		tally.updated += rows.length;
		addMonths(tally, monthsOf(rows));
	}
	if (body.alsoPastCharges === true && (changed.name || changed.category)) {
		const { rows } = await tx.execute<{ month: Month }>(
			sql`UPDATE app.transactions SET category = ${next.category}, payee = ${next.name},
				version = version + 1, updated_at = ${now}
			WHERE subscription_id = ${id}::uuid AND due_on <= ${changeDate}::date AND NOT edited
				AND (category, payee) IS DISTINCT FROM (${next.category}::text, ${next.name}::text)
			RETURNING to_char(occurred_on, 'YYYY-MM') AS month`,
		);
		tally.updated += rows.length;
		addMonths(tally, monthsOf(rows));
	}
}

/** The tombstones: off the new schedule after C, the one skipped, the one brought back. */
async function writeTombstones(
	tx: Tx,
	ctx: ProfiledContext,
	id: string,
	plan: ChangePlan,
	now: string,
): Promise<void> {
	if (plan.gone.size > 0) {
		await tx.execute(
			sql`DELETE FROM app.subscription_skips
			WHERE subscription_id = ${id}::uuid
				AND due_on IN (SELECT jsonb_array_elements_text(${jsonList([...plan.gone])})::date)`,
		);
	}
	if (plan.skipAdded !== null) {
		await tx.execute(
			sql`INSERT INTO app.subscription_skips (id, user_id, created_at, updated_at,
				subscription_id, due_on)
			VALUES (${uuidV7(ctx.now.getTime())}, ${ctx.user.id}, ${now}, ${now}, ${id}::uuid,
				${plan.skipAdded}::date)
			ON CONFLICT DO NOTHING`,
		);
	}
}

/** Saves the Subscription's new values, raising `version` by one. */
async function saveSubscription(
	tx: Tx,
	id: string,
	{ next }: ChangePlan,
	lastChangeOn: string,
	now: string,
): Promise<void> {
	await tx.execute(
		sql`UPDATE app.subscriptions SET name = ${next.name}, amount_minor = ${String(next.amountMinor)}::bigint,
			cadence_unit = ${next.cadence.unit}, cadence_every = ${next.cadence.every},
			start_date = ${next.startDate}::date, category = ${next.category}, note = ${next.note},
			end_date = ${next.endDate}::date, pause_from = ${next.pause?.from ?? null}::date,
			pause_until = ${next.pause?.until ?? null}::date, charges_from = ${next.chargesFrom}::date,
			last_change_on = ${lastChangeOn}::date,
			version = version + 1, updated_at = ${now}
		WHERE id = ${id}::uuid`,
	);
}

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
 *
 * What the change decides, from the body and the stored Subscription, is `planChange`'s, and
 * its refusals `changeIssues`'s; this function reads, writes and keeps the order.
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
	const plan = planChange(body, stored, changeDate);
	const later =
		plan.needsCharges ? await laterCharges(tx, id, plan.laterFrom) : [];
	refuse(
		changeIssues({ body, stored, plan, changeDate, today: ctx.today, later }),
	);

	if (!plan.isChange) {
		return {
			...item,
			currency,
			changeDate,
			chargesCreated: 0,
			chargesUpdated: 0,
			chargesDeleted: 0,
			months: [],
		};
	}

	const now = ctx.now.toISOString();
	const tally: Tally = { created: 0, updated: 0, deleted: 0, months: new Set() };
	const { next, noteOnly } = plan;
	if (!noteOnly) {
		// Step 2: close the old period with the old values.
		const closed = await catchUpSubscription(tx, chargeContext(ctx), stored, {
			through: step2Through({
				changeDate,
				storedEndDate: stored.endDate,
				newEndDate: plan.changed.end ? next.endDate : undefined,
				storedPause: stored.pause,
				newPause: plan.changed.pause ? next.pause : undefined,
			}),
			skipped: stored.skipped,
		});
		addCreated(tally, closed);
		// Step 3: apply.
		await applyToCharges(tx, id, now, { body, plan, later, changeDate }, tally);
	}

	await writeTombstones(tx, ctx, id, plan, now);
	await saveSubscription(
		tx,
		id,
		plan,
		noteOnly ? stored.lastChangeOn : changeDate,
		now,
	);

	if (!noteOnly) {
		// Step 4: open the new period with the new values.
		const opened = await catchUpSubscription(tx, chargeContext(ctx), next, {
			through: ctx.today,
			skipped: plan.skippedAfter,
		});
		addCreated(tally, opened);
	}

	const answer = await getSubscriptionItem(tx, ctx, id);
	// The row is locked by this transaction.
	if (!answer) throw new ApiError("not_found");
	return {
		...answer,
		currency,
		changeDate,
		chargesCreated: tally.created,
		chargesUpdated: tally.updated,
		chargesDeleted: tally.deleted,
		months: [...tally.months].sort(compareCodeUnits),
	};
}
