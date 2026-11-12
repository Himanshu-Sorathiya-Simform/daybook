import type { ClientBase } from "pg";

import { insertProfile, insertTransactions, loadPrefix, reId } from "./load-golden";
import { type StressOptions, type StressTransaction, stressRows } from "./stress";

/** One load of the stress dataset for one user. */
export type LoadedStress = {
	userId: string;
	/** The loaded rows, newest first by row number, with this load's ids. */
	rows: readonly StressTransaction[];
};

/**
 * Loads golden's profile and the stress Transactions (`stressRows`) for `userId`, in two
 * statements, for the end-to-end tests (AC-F03-22, AC-F03-25). `client` must be able to write
 * any user's rows: the system role. The profile's last catch-up is `today`, so no catch-up runs
 * on the first page load.
 */
export async function loadStress(
	client: ClientBase,
	userId: string,
	options: StressOptions,
): Promise<LoadedStress> {
	const prefix = loadPrefix();
	const rows = stressRows(options).map((row) => ({
		...row,
		id: reId(row.id, prefix),
	}));
	await insertProfile(client, userId, { today: options.today });
	await insertTransactions(client, userId, rows);
	return { userId, rows };
}
