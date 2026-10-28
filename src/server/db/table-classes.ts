import "server-only";

/** Which class each table in schema `app` belongs to (P2, section 3). `db:verify` derives the
 * grants, row-level security and policies every table must have from this list, and fails on
 * a table missing from it, so a new table cannot arrive unclassified.
 *
 * - `private`: one user's rows. RLS enabled and forced, `owner_isolation` and `system_access`;
 *   runtime and system read and write.
 * - `private_system_written`: like `private`, but the runtime role only reads (entitlements,
 *   plan status, capability overrides: SEC-4).
 * - `reference`: shared rows, no RLS; runtime reads, system writes (SEC-3).
 * - `system`: no RLS; runtime has nothing, system reads and writes. */
export type TableClass =
	"private" | "private_system_written" | "reference" | "system";

export const TABLE_CLASSES = {
	currencies: "reference",
	categories: "reference",
	profile: "private",
	idempotency_records: "private",
	transactions: "private",
	transaction_views: "private",
	daily_pass_markers: "system",
} as const satisfies Record<string, TableClass>;

export type AppTable = keyof typeof TABLE_CLASSES;

export function isPrivateClass(tableClass: TableClass): boolean {
	return tableClass === "private" || tableClass === "private_system_written";
}
