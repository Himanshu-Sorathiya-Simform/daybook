import "server-only";
import { sql } from "drizzle-orm";
import {
	type BudgetRules,
	removeMonth,
	sameRules,
	setFrom,
	setMonth,
	stopRemovesEveryMonth,
} from "@/lib/budgets/model";
import {
	inRange,
	isMonth,
	type Month,
	monthOf,
	monthRange,
} from "@/lib/budgets/months";
import {
	BUDGET_MESSAGES,
	type BudgetEditBody,
	budgetEditSchema,
	monthRangeMessage,
} from "@/lib/budgets/schemas";
import type { CurrencyCode } from "@/lib/currency";
import { isUuid } from "@/lib/ids";
import { ApiError, fromZodError } from "../../api/errors";
import type { ProfiledContext } from "../context";
import { lockCurrency, requireCurrency, type WithCurrency } from "../currency";
import type { Tx } from "../with-user";
import { BUDGET_JSON, type Budget, budgetMismatch, getBudget } from "./row";

/** The Budget at `id`, locked for this write, if it is still at `version`: 404 when the user
 * has no such Budget, 409 with it when it moved on (BR-P2-21). The version check comes before
 * any rule, so a stale write is 409 even when it would change nothing (BR-F04-36). */
async function lockedAt(
	tx: Tx,
	id: string,
	version: number,
	currency: CurrencyCode,
): Promise<Budget> {
	const budget = await getBudget(tx, id, { lock: true });
	if (budget?.version !== version) throw budgetMismatch(budget, currency);
	return budget;
}

/** Saves `next` over the locked `budget`, raising `version` by one, at the request clock
 * (BR-P2-21, BR-P2-43). Rules equal to the stored ones save nothing and keep the version
 * (BR-F04-36). */
async function save(
	tx: Tx,
	ctx: ProfiledContext,
	budget: Budget,
	next: BudgetRules,
): Promise<Budget> {
	if (sameRules(next, budget)) return budget;
	const { rows } = await tx.execute<{ budget: Budget }>(
		sql`UPDATE app.budgets SET schedule = ${JSON.stringify(next.schedule)}::jsonb,
			overrides = ${JSON.stringify(next.overrides)}::jsonb,
			version = version + 1, updated_at = ${ctx.now.toISOString()}
		WHERE id = ${budget.id}::uuid AND version = ${budget.version}
		RETURNING ${BUDGET_JSON} AS budget`,
	);
	// The row is locked at this version, so the update always matches it.
	return (rows[0] as { budget: Budget }).budget;
}

/** The months a change names, inside the range of the user's current month (BR-F04-07). A
 * restoring write puts back months that existed and is not checked (BR-F04-33). */
function checkRange(ctx: ProfiledContext, body: BudgetEditBody): void {
	if (body.kind === "restore") return;
	const range = monthRange(monthOf(ctx.today));
	const [field, month] =
		body.kind === "from" ? ["from", body.from] : ["month", body.month];
	if (!inRange(month, range)) {
		throw new ApiError("validation_failed", {
			fields: { [field]: monthRangeMessage(range) },
		});
	}
}

/** The Budget's rules after `body` (BR-F04-03, BR-F04-04, BR-F04-24, BR-F04-33). A stop from a
 * month onward at or before the first entry would leave no month: 422 on `from`. */
function applied(budget: Budget, body: BudgetEditBody): BudgetRules {
	switch (body.kind) {
		case "from":
			if (
				body.limitMinor === null
				&& stopRemovesEveryMonth(budget.schedule, body.from)
			) {
				throw new ApiError("validation_failed", {
					fields: { from: BUDGET_MESSAGES.stopRemovesEveryMonth },
				});
			}
			return setFrom(budget, body.from, body.limitMinor);
		case "month":
			return setMonth(budget, body.month, body.limitMinor);
		default:
			return { schedule: body.schedule, overrides: body.overrides };
	}
}

/**
 * Changes a Budget at `If-Match` `version` (F04 section 11, D-561), in this order:
 * 1. An id that is not a UUID is 404 before any statement.
 * 2. The body (`budgetEditSchema`): from a month onward, one month, or restoring; 422 otherwise.
 * 3. The profile lock (BR-F04-22, D-213); a sent `currency` must match it.
 * 4. The month inside the range (BR-F04-07), unless restoring.
 * 5. The Budget, locked: 404 without it, 409 with it at another version (BR-P2-21).
 * 6. The change: a stop that would leave no month is 422 (BR-F04-04).
 * 7. The save, unless nothing changes (BR-F04-36).
 * Answers carry the currency read under the lock (D-493).
 */
export async function editBudget(
	tx: Tx,
	ctx: ProfiledContext,
	id: string,
	version: number,
	input: unknown,
): Promise<WithCurrency<Budget>> {
	if (!isUuid(id)) throw new ApiError("not_found");
	const parsed = budgetEditSchema.safeParse(input);
	if (!parsed.success) throw fromZodError(parsed.error);
	const body = parsed.data;
	const currency =
		body.currency !== undefined ?
			await requireCurrency(tx, body.currency)
		:	await lockCurrency(tx);
	checkRange(ctx, body);
	const budget = await lockedAt(tx, id, version, currency);
	return { ...(await save(tx, ctx, budget, applied(budget, body))), currency };
}

/**
 * Removes one one-month limit (BR-F04-25, `DELETE /api/budgets/[id]/overrides/[month]`) at
 * `If-Match` `version`: a malformed id or month is 404 before any statement; then the profile
 * lock, the Budget locked at its version (404, 409), and 404 when that month has no one-month
 * limit. Answers the Budget with a new version.
 */
export async function removeMonthLimit(
	tx: Tx,
	ctx: ProfiledContext,
	id: string,
	month: string,
	version: number,
): Promise<WithCurrency<Budget>> {
	if (!isUuid(id) || !isMonth(month)) throw new ApiError("not_found");
	const currency = await lockCurrency(tx);
	const budget = await lockedAt(tx, id, version, currency);
	const next = removeMonth(budget, month as Month);
	if (!next) throw new ApiError("not_found");
	return { ...(await save(tx, ctx, budget, next)), currency };
}

/**
 * Deletes a Budget, its schedule and its one-month limits (BR-F04-06) at `If-Match` `version`:
 * a malformed id is 404 before any statement; then the profile lock (BR-F04-22) and the
 * versioned delete. Nothing matched: 409 with the Budget, or 404, which the client counts as
 * done (D-239).
 */
export async function deleteBudget(
	tx: Tx,
	_ctx: ProfiledContext,
	id: string,
	version: number,
): Promise<void> {
	if (!isUuid(id)) throw new ApiError("not_found");
	const currency = await lockCurrency(tx);
	const { rows } = await tx.execute(
		sql`DELETE FROM app.budgets WHERE id = ${id}::uuid AND version = ${version} RETURNING id`,
	);
	if (rows.length === 0) throw budgetMismatch(await getBudget(tx, id), currency);
}
