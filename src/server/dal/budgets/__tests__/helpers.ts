import type { Client } from "pg";

import { GOLDEN_NOW } from "../../../../../seed/golden";
import { loadGolden, loadGoldenBudgets } from "../../../../../seed/load-golden";
import { ApiError } from "../../../api/errors";
import { createUser } from "../../../db/__tests__/private-rows";
import { uuidV7At } from "../../transactions/__tests__/helpers";

/** A user with the golden profile, Transactions and Budgets, committed by the owner. Returns
 * the user's id and each golden Budget's id in this load, by category. */
export async function goldenBudgetUser(
	owner: Client,
	label: string,
): Promise<{ userId: string; ids: Record<string, string> }> {
	const { userId } = await loadGolden(owner, await createUser(owner, label));
	const budgets = await loadGoldenBudgets(owner, userId);
	return {
		userId,
		ids: Object.fromEntries(
			budgets.map((budget) => [budget.category, budget.id]),
		),
	};
}

/** The ApiError a call throws, as code, fields and details; fails when it does not throw. */
export async function refusal(promise: Promise<unknown>) {
	try {
		await promise;
	} catch (error) {
		if (!(error instanceof ApiError)) throw error;
		return { code: error.code, fields: error.fields, details: error.details };
	}
	throw new Error("The call was not refused.");
}

/** A create body as the client sends it: health at 1,500.00 from November 2026, with a fresh
 * id at the golden clock. Golden has no health Budget. */
export function budgetBody(
	fields: Record<string, unknown> = {},
): Record<string, unknown> {
	return {
		id: uuidV7At(GOLDEN_NOW),
		category: "health",
		from: "2026-11",
		limitMinor: 150000,
		currency: "INR",
		...fields,
	};
}

/** The transaction id of `holder`'s open transaction, as text. */
export async function transactionIdOf(holder: Client): Promise<string> {
	const { rows } = await holder.query<{ xid: string }>(
		"SELECT pg_current_xact_id()::text AS xid",
	);
	return (rows[0] as { xid: string }).xid;
}

/** Waits until some connection is blocked on the transaction `xid`, as an insert waits on an
 * uncommitted row with the same key or a lock waits on a held row. Polls every 100 ms, up to
 * 10 seconds, so a test can let `xid` end knowing the other side has reached it. */
export async function waitForWaiterOn(owner: Client, xid: string): Promise<void> {
	for (let attempt = 0; attempt < 100; attempt++) {
		const { rows } = await owner.query<{ waiting: boolean }>(
			`SELECT EXISTS (SELECT 1 FROM pg_locks
			   WHERE locktype = 'transactionid' AND NOT granted
			     AND transactionid = $1::xid) AS waiting`,
			[xid],
		);
		if (rows[0]?.waiting) return;
		await new Promise((resolve) => setTimeout(resolve, 100));
	}
	throw new Error(`Nothing waited on transaction ${xid}.`);
}
