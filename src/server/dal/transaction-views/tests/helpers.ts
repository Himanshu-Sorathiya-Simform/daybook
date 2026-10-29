import { sql } from "drizzle-orm";

import { GOLDEN_NOW } from "../../../../../seed/golden";
import { uuidV7At } from "../../transactions/tests/helpers";
import type { Tx } from "../../with-user";

/** Inserts `count` views for the user `asUser` runs as, named "View 1", "View 2" and so on,
 * recorded one minute apart from an hour before the golden clock, in one statement. */
export async function addViews(
	tx: Tx,
	userId: string,
	count: number,
): Promise<void> {
	await tx.execute(
		sql`INSERT INTO app.transaction_views (id, user_id, created_at, updated_at, name, filter,
			sort, dir, group_by, version)
		SELECT gen_random_uuid(), ${userId}, at, at, 'View ' || n, '{}'::jsonb, 'date', 'desc',
			'day', 1
		FROM generate_series(1, ${count}) AS n,
			LATERAL (SELECT ${GOLDEN_NOW}::timestamptz - interval '1 hour' + n * interval '1 minute') AS t(at)`,
	);
}

/** A create body as the client sends it: "Food last month", a fresh id at the golden clock. */
export function viewBody(
	fields: Record<string, unknown> = {},
): Record<string, unknown> {
	return {
		id: uuidV7At(GOLDEN_NOW),
		name: "Food last month",
		filter: { range: "last_month", cat: ["food"] },
		sort: "date",
		dir: "desc",
		group: "day",
		...fields,
	};
}

/** Inserts one view for the user `asUser` runs as, recorded at the golden clock at version 1:
 * "Food" unless `name` says otherwise, food over last month, newest first, by day. Returns
 * its id. */
export async function addView(
	tx: Tx,
	userId: string,
	{
		name = "Food",
		id = uuidV7At(GOLDEN_NOW),
	}: { name?: string; id?: string } = {},
): Promise<string> {
	await tx.execute(
		sql`INSERT INTO app.transaction_views (id, user_id, created_at, updated_at, name, filter,
			sort, dir, group_by, version)
		VALUES (${id}, ${userId}, ${GOLDEN_NOW}, ${GOLDEN_NOW}, ${name},
			'{"range": "last_month", "cat": ["food"]}'::jsonb, 'date', 'desc', 'day', 1)`,
	);
	return id;
}
