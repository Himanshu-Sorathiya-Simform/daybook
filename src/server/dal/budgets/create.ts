import "server-only";
import { sql } from "drizzle-orm";
import type { BudgetRules } from "@/lib/budgets/model";
import { inRange, monthOf, monthRange } from "@/lib/budgets/months";
import {
	BUDGET_MESSAGES,
	budgetCreateSchema,
	monthRangeMessage,
} from "@/lib/budgets/schemas";
import { uuidV7Time } from "@/lib/ids";
import { ApiError, fromZodError } from "../../api/errors";
import type { ProfiledContext } from "../context";
import { lockCurrency, type WithCurrency } from "../currency";
import { pastSlack } from "../transactions/dates";
import type { Tx } from "../with-user";
import { BUDGET_JSON, type Budget, getBudget, getBudgetFor } from "./row";

/**
 * Creates a Budget with the client's id (F04 section 11, BR-F04-01, BR-P2-20), in this order:
 * 1. The body (`budgetCreateSchema`): 422 with field paths.
 * 2. The profile lock (BR-F04-22, D-213), then the id: one the user already has answers that
 *    Budget unchanged, whatever the body now says (API-5).
 * 3. The currency: 422 `currency_mismatch`.
 * 4. A create from a month: the month inside the range (BR-F04-07). A restoring create puts
 *    back months that existed, so its months are not range-checked (BR-F04-33).
 * 5. The id's time, at most 5 minutes past the request clock (BR-P2-20).
 * 6. `INSERT ... ON CONFLICT DO NOTHING` with no target, so neither the id nor the category can
 *    abort the transaction. With no row inserted, the re-read: the same id is this create, done
 *    by a request that won the race (200); a Budget for the category is 409 `budget_exists`
 *    with it in `details.current`; otherwise the id is another user's, 409 `id_conflict`.
 * Answers carry the currency read under the lock (D-493).
 */
export async function createBudget(
	tx: Tx,
	ctx: ProfiledContext,
	input: unknown,
): Promise<{ budget: WithCurrency<Budget>; created: boolean }> {
	const parsed = budgetCreateSchema.safeParse(input);
	if (!parsed.success) throw fromZodError(parsed.error);
	const body = parsed.data;

	const currency = await lockCurrency(tx);
	const answer = (budget: Budget, created: boolean) => ({
		budget: { ...budget, currency },
		created,
	});
	const existing = await getBudget(tx, body.id);
	if (existing) return answer(existing, false);
	if (body.currency !== currency) throw new ApiError("currency_mismatch");

	const fields: Record<string, string> = {};
	if (body.kind === "from") {
		const range = monthRange(monthOf(ctx.today));
		if (!inRange(body.from, range)) fields["from"] = monthRangeMessage(range);
	}
	if (pastSlack(new Date(uuidV7Time(body.id)), ctx.now)) {
		fields["id"] = BUDGET_MESSAGES.idInFuture;
	}
	if (Object.keys(fields).length > 0) {
		throw new ApiError("validation_failed", { fields });
	}

	const rules: BudgetRules =
		body.kind === "from" ?
			{
				schedule: [{ from: body.from, limitMinor: body.limitMinor }],
				overrides: [],
			}
		:	{ schedule: body.schedule, overrides: body.overrides };
	const now = ctx.now.toISOString();
	const { rows } = await tx.execute<{ budget: Budget }>(
		sql`INSERT INTO app.budgets (id, user_id, created_at, updated_at, category, schedule,
			overrides, demo, version)
		VALUES (${body.id}, ${ctx.user.id}, ${now}, ${now}, ${body.category},
			${JSON.stringify(rules.schedule)}::jsonb, ${JSON.stringify(rules.overrides)}::jsonb,
			false, 1)
		ON CONFLICT DO NOTHING
		RETURNING ${BUDGET_JSON} AS budget`,
	);
	const [inserted] = rows;
	if (inserted) return answer(inserted.budget, true);

	const raced = await getBudget(tx, body.id);
	if (raced) return answer(raced, false);
	const taken = await getBudgetFor(tx, body.category);
	if (taken) {
		throw new ApiError("budget_exists", {
			details: { current: { ...taken, currency } },
		});
	}
	throw new ApiError("id_conflict");
}
