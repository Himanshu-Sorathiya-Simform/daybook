import "server-only";
import { sql } from "drizzle-orm";
import type { Transaction } from "@/lib/transactions/model";
import { safeInt } from "../../db/safe-int";

/** An instant column as `Date.toISOString()` writes it: UTC, with milliseconds. */
export const iso = (column: string) =>
	`to_char(${column} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`;

/**
 * A row of `app.transactions` as the API's Transaction (F03 section 3), built in SQL as JSON.
 * The amount is text, read through `safeInt` (MON-6). A linked charge carries its Subscription
 * as `subscription: { id, name }`, so the list needs no extra lookup (F03 section 3); other rows
 * have null. The name comes from a scalar subquery, so the fragment fits a `RETURNING` too. Until
 * F06, `goalId` is null on every row (D-475).
 */
export const ROW_JSON = sql.raw(`json_build_object(
	'id', id, 'type', type, 'amountMinor', amount_minor::text,
	'occurredAt', ${iso("occurred_at")}, 'occurredOn', occurred_on::text,
	'category', category, 'goalId', NULL::uuid, 'payee', payee,
	'description', description, 'note', note, 'source', source, 'demo', demo,
	'subscriptionId', subscription_id, 'dueOn', due_on::text,
	'subscription', (SELECT json_build_object('id', s.id, 'name', s.name)
		FROM app.subscriptions s WHERE s.id = subscription_id),
	'edited', edited, 'version', version,
	'createdAt', ${iso("created_at")}, 'updatedAt', ${iso("updated_at")})`);

export type RowJson = Omit<Transaction, "amountMinor"> & { amountMinor: string };

/** `ROW_JSON`'s output as a Transaction. */
export function readRow(json: RowJson): Transaction {
	return { ...json, amountMinor: safeInt(json.amountMinor) };
}
