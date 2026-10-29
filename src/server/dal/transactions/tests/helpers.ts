import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";

import {
	GOLDEN_NOW,
	GOLDEN_PROFILE,
	GOLDEN_TODAY,
} from "../../../../../seed/golden";
import { runtimePool } from "../../../db/pools";
import * as schema from "../../../db/schema";
import type { Profile, ProfiledContext } from "../../context";
import type { Tx } from "../../with-user";

/** The golden request context (TST-3) for `userId`: India, 2 November 2026 at 12:00 local. */
export function goldenContext(
	userId: string,
	profile: Partial<Profile> = {},
): ProfiledContext {
	return {
		requestId: randomUUID(),
		user: { id: userId, email: "golden@daybook.test", name: "Golden" },
		profile: {
			country: GOLDEN_PROFILE.country,
			currency: GOLDEN_PROFILE.currency,
			timezone: GOLDEN_PROFILE.timezone,
			weekStart: GOLDEN_PROFILE.weekStart,
			lastCatchUpOn: GOLDEN_TODAY,
			...profile,
		},
		now: new Date(GOLDEN_NOW),
		today: GOLDEN_TODAY,
		pricesUpdated: false,
	};
}

/**
 * Runs `fn` as `userId` through the runtime role and RLS, in a transaction that always rolls
 * back, so a test may write first and leave nothing behind. Returns `fn`'s result and the
 * number of statements `fn` sent, for the one-statement rules (D-293).
 */
export async function asUser<T>(
	userId: string,
	fn: (tx: Tx) => Promise<T>,
): Promise<{ result: T; statements: number }> {
	const client = await runtimePool().connect();
	const original = client.query;
	let statements = 0;
	try {
		await client.query("BEGIN");
		await client.query("SELECT set_config('app.user_id', $1, true)", [userId]);
		client.query = ((...args: unknown[]) => {
			statements += 1;
			return (original as (...a: unknown[]) => unknown).apply(client, args);
		}) as typeof client.query;
		const result = await fn(drizzle({ client, schema }));
		return { result, statements };
	} finally {
		client.query = original;
		await client.query("ROLLBACK").catch(() => {});
		client.release();
	}
}

/** Inserts an expense for the user `asUser` runs as, on `occurredOn` at 12:00 IST unless
 * `occurredAt` says otherwise. Returns its id. */
export async function addExpense(
	tx: Tx,
	userId: string,
	fields: {
		id?: string;
		payee: string;
		amountMinor: number;
		occurredOn: string;
		occurredAt?: string;
		category?: string;
		type?: "expense" | "income" | "refund";
	},
): Promise<string> {
	const id = fields.id ?? randomUUID();
	const occurredAt = fields.occurredAt ?? `${fields.occurredOn}T06:30:00Z`;
	await tx.execute(
		sql`INSERT INTO app.transactions (id, user_id, created_at, updated_at, type, amount_minor,
		   occurred_at, occurred_on, category, payee, source, version)
		 VALUES (${id}, ${userId}, ${GOLDEN_NOW}, ${GOLDEN_NOW}, ${fields.type ?? "expense"},
		   ${fields.amountMinor}, ${occurredAt}, ${fields.occurredOn}, ${fields.category ?? "food"},
		   ${fields.payee}, 'manual', 1)`,
	);
	return id;
}
