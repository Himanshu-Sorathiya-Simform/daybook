import "server-only";
import { sql } from "drizzle-orm";
import { isUuid } from "@/lib/ids";
import type { Transaction } from "@/lib/transactions/model";
import type { Tx } from "../with-user";
import { readRow, ROW_JSON, type RowJson } from "./row";

/** One of the user's Transactions by id, or `null` (BR-F03-53). RLS hides other users' rows,
 * so theirs read as missing (P2). An id that is not a UUID is missing too; it never reaches
 * SQL, where the cast would fail (D-479). */
export async function getTransaction(
	tx: Tx,
	id: string,
): Promise<Transaction | null> {
	if (!isUuid(id)) return null;
	const { rows } = await tx.execute<{ row: RowJson }>(
		sql`SELECT ${ROW_JSON} AS row FROM app.transactions WHERE id = ${id}::uuid`,
	);
	const [found] = rows;
	return found ? readRow(found.row) : null;
}
