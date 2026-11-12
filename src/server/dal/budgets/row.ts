import "server-only";
import { sql } from "drizzle-orm";
import type { BudgetRecord } from "@/lib/budgets/view";
import type { CurrencyCode } from "@/lib/currency";
import { ApiError } from "../../api/errors";
import { iso } from "../transactions/row";
import type { Tx } from "../with-user";

/** A Budget as the API answers it (F04 section 3). */
export type Budget = BudgetRecord & { createdAt: string; updatedAt: string };

/** A row of `app.budgets` as the API's Budget, built in SQL as JSON. The lists are stored
 * normalized and in month order, so they are answered as stored; their limits are at most
 * MON-5's largest, well inside a JavaScript number. */
export const BUDGET_JSON = sql.raw(`json_build_object(
	'id', id, 'category', category, 'schedule', schedule, 'overrides', overrides,
	'version', version, 'demo', demo,
	'createdAt', ${iso("created_at")}, 'updatedAt', ${iso("updated_at")})`);

/** One of the user's Budgets by `id`, a UUID its caller has checked, or `null`. RLS hides other
 * users' Budgets. `lock` takes the row for update, so a write sees no change until it ends. */
export async function getBudget(
	tx: Tx,
	id: string,
	{ lock = false }: { lock?: boolean } = {},
): Promise<Budget | null> {
	const { rows } = await tx.execute<{ budget: Budget }>(
		sql`SELECT ${BUDGET_JSON} AS budget FROM app.budgets WHERE id = ${id}::uuid
		${lock ? sql`FOR UPDATE` : sql``}`,
	);
	return rows[0]?.budget ?? null;
}

/** The user's Budget for `category`, or `null`. */
export async function getBudgetFor(
	tx: Tx,
	category: string,
): Promise<Budget | null> {
	const { rows } = await tx.execute<{ budget: Budget }>(
		sql`SELECT ${BUDGET_JSON} AS budget FROM app.budgets WHERE category = ${category}`,
	);
	return rows[0]?.budget ?? null;
}

/** The refusal for a versioned Budget write that found the row at another version, or no row
 * (BR-P2-21, BR-F04-23): 409 `version_conflict` with the Budget and the currency in
 * `details.current`, or 404. */
export function budgetMismatch(
	budget: Budget | null,
	currency: CurrencyCode,
): ApiError {
	return budget ?
			new ApiError("version_conflict", {
				details: { current: { ...budget, currency } },
			})
		:	new ApiError("not_found");
}
