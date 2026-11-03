/**
 * The first part of every query key, one per area (STATE-5, D-527). A feature builds its keys
 * under its own root, and a write refreshes other areas by their root, so no feature imports
 * another feature's keys. A later feature adds its root here.
 */
export const QUERY_ROOTS = {
	me: "me",
	profile: "profile",
	transactions: "transactions",
	payees: "payees",
	transactionViews: "transactionViews",
} as const;

export type QueryRoot = (typeof QUERY_ROOTS)[keyof typeof QUERY_ROOTS];

/** Whether `key` belongs to the area `root`. */
export function isUnder(key: readonly unknown[], root: QueryRoot): boolean {
	return key[0] === root;
}
