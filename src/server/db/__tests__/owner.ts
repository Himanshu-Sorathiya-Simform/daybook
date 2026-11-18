import { Client } from "pg";

import { runtimePool } from "../pools";
import { parseOwnerEnv } from "../../env";

/** The connection of the database owner, for the data a test sets up and reads back outside
 * RLS. */
export async function connectOwner(): Promise<Client> {
	const owner = new Client({
		connectionString: parseOwnerEnv(process.env).DATABASE_URL_OWNER,
	});
	await owner.connect();
	return owner;
}

/** A file's `afterAll`: deletes the users it created, and closes the owner connection and the
 * runtime pool. */
export async function closeOwner(
	owner: Client | undefined,
	users: readonly string[],
): Promise<void> {
	await owner?.query(`DELETE FROM auth."user" WHERE id = ANY($1)`, [users]);
	await owner?.end();
	await runtimePool().end();
}
