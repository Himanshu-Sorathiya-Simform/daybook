import { randomBytes, randomUUID } from "node:crypto";
import type { ClientBase } from "pg";

import { isGoalType } from "@/lib/transactions/model";

import {
	GOLDEN_ALL,
	GOLDEN_NOW,
	GOLDEN_PROFILE,
	GOLDEN_TODAY,
	type GoldenTransaction,
} from "./golden";

/** The golden rows the M1 table holds (D-471): #1 to #27 without the Goal rows #3, #9, #14,
 * #22 and #23, whose type arrives with F06's migration (D-465). #27 is included because
 * catch-up, which creates it on 2 November, arrives with F05. Charges stay unlinked. */
export const GOLDEN_M1_ROWS: readonly GoldenTransaction[] = GOLDEN_ALL.filter(
	(row) => !isGoalType(row.type),
);

/** One load of the golden dataset for one user. */
export type LoadedGolden = {
	userId: string;
	/** The loaded rows, with this load's ids. */
	rows: readonly GoldenTransaction[];
	/** The id of golden row `n` in this load. */
	id(n: number): string;
	/** The golden row number of an id from this load. */
	golden(id: string): number;
};

/** The golden id with its first 48 bits, the UUIDv7 timestamp, replaced by `prefix`. Ids are
 * unique across users, so each load needs its own; one prefix per load keeps the rows' id
 * order, which breaks ties in every list order (BR-F03-29). */
function reId(id: string, prefix: string): string {
	return `${prefix.slice(0, 8)}-${prefix.slice(8, 12)}${id.slice(13)}`;
}

/**
 * Loads the golden profile and the M1 golden Transactions for `userId` (D-471), as
 * `docs/03-golden-dataset.md` shows them on 2 November, in two statements. `client` must be
 * able to write any user's rows: the owner in tests, the system role in the seed script.
 * Ids get a fresh prefix per load, so every test user can hold its own copy.
 */
export async function loadGolden(
	client: ClientBase,
	userId: string,
): Promise<LoadedGolden> {
	const prefix = randomBytes(6).toString("hex");
	const rows = GOLDEN_M1_ROWS.map((row) => ({ ...row, id: reId(row.id, prefix) }));

	await client.query(
		`INSERT INTO app.profile
		   (id, user_id, created_at, updated_at, country, currency, timezone, week_start, last_catch_up_on, version)
		 VALUES ($1, $2, $3, $3, $4, $5, $6, $7, $8, 1)`,
		[
			randomUUID(),
			userId,
			GOLDEN_NOW,
			GOLDEN_PROFILE.country,
			GOLDEN_PROFILE.currency,
			GOLDEN_PROFILE.timezone,
			GOLDEN_PROFILE.weekStart,
			GOLDEN_TODAY,
		],
	);
	// One statement for every row; `pg` sends the rows as JSON text.
	await client.query(
		`INSERT INTO app.transactions
		   (id, user_id, created_at, updated_at, type, amount_minor, occurred_at, occurred_on,
		    category, payee, description, note, source, demo, version)
		 SELECT r.id, $1, r."createdAt", r."updatedAt", r.type, r."amountMinor", r."occurredAt",
		        r."occurredOn", r.category, r.payee, r.description, r.note, r.source, r.demo, r.version
		 FROM jsonb_to_recordset($2::jsonb) AS r(
		   id uuid, "createdAt" timestamptz, "updatedAt" timestamptz, type text, "amountMinor" bigint,
		   "occurredAt" timestamptz, "occurredOn" date, category text, payee text, description text,
		   note text, source text, demo boolean, version integer)`,
		[userId, JSON.stringify(rows)],
	);

	const byNumber = new Map(rows.map((row) => [row.golden, row.id]));
	const byId = new Map(rows.map((row) => [row.id, row.golden]));
	return {
		userId,
		rows,
		id(n) {
			const id = byNumber.get(n);
			if (id === undefined)
				throw new RangeError(`Golden row #${n} is not loaded at M1.`);
			return id;
		},
		golden(id) {
			const n = byId.get(id);
			if (n === undefined)
				throw new RangeError(`${id} is not a golden row of this load.`);
			return n;
		},
	};
}
