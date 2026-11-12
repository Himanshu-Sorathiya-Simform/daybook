import { withDatabase } from "./db";

/** An end-to-end account's email exactly as `newAccount` makes it. */
const E2E_EMAIL = String.raw`^e2e-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}@daybook\.test$`;

/**
 * After a run, deletes every account the end-to-end tests signed up in the development
 * database, earlier runs' included. Their sessions, profiles, Transactions and views go with
 * them through `ON DELETE CASCADE`. The auth role is the one that may delete users.
 */
export default async function globalTeardown(): Promise<void> {
	const { rowCount } = await withDatabase("DATABASE_URL_AUTH", (client) =>
		client.query(`DELETE FROM auth."user" WHERE email ~ $1`, [E2E_EMAIL]),
	);
	console.log(`Removed ${rowCount ?? 0} end-to-end accounts.`);
}
