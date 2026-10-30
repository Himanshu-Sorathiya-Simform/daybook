import "server-only";
import { sql } from "drizzle-orm";
import type { SavedView } from "@/lib/transactions/views";
import type { Tx } from "../with-user";
import { VIEW_JSON } from "./row";

/** The user's saved views in BR-F03-63's order: by `createdAt`, then id. At most 20; All
 * Transactions lives in code and is never listed. One statement. */
export async function listViews(tx: Tx): Promise<SavedView[]> {
	const { rows } = await tx.execute<{ view: SavedView }>(
		sql`SELECT ${VIEW_JSON} AS view FROM app.transaction_views ORDER BY created_at, id`,
	);
	return rows.map(({ view }) => view);
}
