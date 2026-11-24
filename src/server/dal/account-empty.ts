import "server-only";
import { sql } from "drizzle-orm";
import type { Tx } from "./with-user";

/**
 * Whether the account is empty (F15, BR-F15-01): no Transactions, Budgets, Subscriptions or
 * Goals, demo rows included. The portfolio does not count. One statement of `EXISTS` tests, so
 * the dashboard's onboarding panel and the demo status endpoint agree. The tables hold
 * confirmed rows only (TXN-6), and row-level security limits each test to the user's rows.
 */
export async function accountEmpty(tx: Tx): Promise<boolean> {
	const { rows } = await tx.execute<{ empty: boolean }>(
		sql`SELECT NOT (
			EXISTS (SELECT 1 FROM app.transactions)
			OR EXISTS (SELECT 1 FROM app.budgets)
			OR EXISTS (SELECT 1 FROM app.subscriptions)
			-- TODO(F06): OR EXISTS (SELECT 1 FROM app.goals)
		) AS empty`,
	);
	// A SELECT without FROM returns exactly one row.
	return (rows[0] as { empty: boolean }).empty;
}
