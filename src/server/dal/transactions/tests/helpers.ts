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

/**
 * `tx`, but running `between` once its first statement has answered: another connection's
 * change, committed between a write's read and its update. Writes run at read committed, so
 * the update sees it (P2).
 */
export function afterFirstStatement(tx: Tx, between: () => Promise<unknown>): Tx {
	let sent = 0;
	const spy = Object.create(tx) as Tx;
	spy.execute = (async (query: Parameters<Tx["execute"]>[0]) => {
		const answer = await tx.execute(query);
		sent += 1;
		if (sent === 1) await between();
		return answer;
	}) as Tx["execute"];
	return spy;
}

/** Inserts an expense for the user `asUser` runs as, on `occurredOn` at 12:00 IST unless
 * `occurredAt` says otherwise, recorded at the golden clock as a manual, non-demo row unless
 * `createdAt`, `source` or `demo` say otherwise. Returns its id. */
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
		createdAt?: string;
		source?: "manual" | "subscription";
		demo?: boolean;
	},
): Promise<string> {
	const id = fields.id ?? randomUUID();
	const occurredAt = fields.occurredAt ?? `${fields.occurredOn}T06:30:00Z`;
	const createdAt = fields.createdAt ?? GOLDEN_NOW;
	await tx.execute(
		sql`INSERT INTO app.transactions (id, user_id, created_at, updated_at, type, amount_minor,
		   occurred_at, occurred_on, category, payee, source, demo, version)
		 VALUES (${id}, ${userId}, ${createdAt}, ${createdAt}, ${fields.type ?? "expense"},
		   ${fields.amountMinor}, ${occurredAt}, ${fields.occurredOn}, ${fields.category ?? "food"},
		   ${fields.payee}, ${fields.source ?? "manual"}, ${fields.demo ?? false}, 1)`,
	);
	return id;
}

/** A UUIDv7 whose embedded time is `instant`, with random bits after it (RFC 9562). */
export function uuidV7At(instant: string | Date): string {
	const time = new Date(instant).getTime().toString(16).padStart(12, "0");
	const random = randomUUID().replace(/-/g, "");
	const variant = (
		(Number.parseInt(random[16] as string, 16) & 0x3)
		| 0x8
	).toString(16);
	const hex = `${time}7${random.slice(13, 16)}${variant}${random.slice(17, 32)}`;
	return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
