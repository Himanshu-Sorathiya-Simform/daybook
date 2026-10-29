import "server-only";
import { sql } from "drizzle-orm";
import type { Transaction } from "@/lib/transactions/model";
import { safeInt } from "../../db/safe-int";

/** An instant as `Date.toISOString()` writes it: UTC, with milliseconds. */
const iso = (column: string) =>
	`to_char(${column} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`;

/**
 * A row of `app.transactions` as the API's Transaction (F03 section 3), built in SQL as JSON.
 * The amount is text, read through `safeInt` (MON-6). At M1 the Goal and charge fields are
 * fixed: `goalId`, `subscriptionId` and `dueOn` null, `edited` false (D-475).
 */
export const ROW_JSON = sql.raw(`json_build_object(
	'id', id, 'type', type, 'amountMinor', amount_minor::text,
	'occurredAt', ${iso("occurred_at")}, 'occurredOn', occurred_on::text,
	'category', category, 'goalId', NULL::uuid, 'payee', payee,
	'description', description, 'note', note, 'source', source, 'demo', demo,
	'subscriptionId', NULL::uuid, 'dueOn', NULL::date, 'edited', false, 'version', version,
	'createdAt', ${iso("created_at")}, 'updatedAt', ${iso("updated_at")})`);

export type RowJson = Omit<Transaction, "amountMinor"> & { amountMinor: string };

/** `ROW_JSON`'s output as a Transaction. */
export function readRow(json: RowJson): Transaction {
	return { ...json, amountMinor: safeInt(json.amountMinor) };
}
