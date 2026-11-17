import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import type { Client, PoolClient } from "pg";
import { expect } from "vitest";

import { todayIn } from "@/lib/time";

import {
	GOLDEN_NOW,
	GOLDEN_SUBSCRIPTIONS,
	GOLDEN_TODAY,
} from "../../../../../seed/golden";
import {
	insertSubscriptionSkips,
	insertSubscriptions,
	insertTransactions,
	loadGolden,
	type LoadedGolden,
	type LoadedSubscription,
	type LoadOptions,
} from "../../../../../seed/load-golden";
import { createUser } from "../../../db/__tests__/private-rows";
import { transactionIdOf, waitForWaiterOn } from "../../budgets/__tests__/helpers";
import type { ProfiledContext } from "../../context";
import { goldenContext, uuidV7At } from "../../transactions/__tests__/helpers";
import { runtimePool } from "../../../db/pools";
import type { Tx } from "../../with-user";

export { GOLDEN_TODAY };

/** A user with the golden profile, Subscriptions, tombstone and Transactions, committed by the
 * owner. */
export async function goldenUser(
	owner: Client,
	label: string,
	options: LoadOptions = {},
): Promise<LoadedGolden> {
	return loadGolden(owner, await createUser(owner, label), options);
}

/** A Subscription row for `insertSubscriptions`: Netflix's fields unless `fields` change them. A
 * fresh id at the golden clock. */
export function subscriptionRow(
	fields: Partial<LoadedSubscription> = {},
): LoadedSubscription {
	const netflix = GOLDEN_SUBSCRIPTIONS.netflix;
	return {
		id: uuidV7At(GOLDEN_NOW),
		name: netflix.name,
		amountMinor: netflix.amountMinor,
		cadence: { ...netflix.cadence },
		startDate: netflix.startDate,
		category: netflix.category,
		note: null,
		endDate: null,
		pause: null,
		chargesFrom: netflix.chargesFrom,
		lastChangeOn: netflix.lastChangeOn,
		createdAt: netflix.createdAt,
		demo: false,
		version: 1,
		...fields,
	};
}

/** Adds one Subscription for `userId`; returns its id. */
export async function addSubscription(
	owner: Client,
	userId: string,
	fields: Partial<LoadedSubscription> = {},
): Promise<LoadedSubscription> {
	const row = subscriptionRow(fields);
	await insertSubscriptions(owner, userId, [row]);
	return row;
}

/** Adds the charge of `subscriptionId` due on `dueOn`, at its own midnight in Kolkata. */
export async function addCharge(
	owner: Client,
	userId: string,
	{
		subscriptionId,
		dueOn,
		amountMinor = 64900,
		payee = "Netflix",
		category = "entertainment",
		edited = false,
	}: {
		subscriptionId: string | null;
		dueOn: string;
		amountMinor?: number;
		payee?: string;
		category?: string;
		edited?: boolean;
	},
): Promise<string> {
	const id = uuidV7At(GOLDEN_NOW);
	const occurredAt = new Date(`${dueOn}T00:00:00+05:30`).toISOString();
	await insertTransactions(owner, userId, [
		{
			id,
			type: "expense",
			amountMinor,
			occurredAt,
			occurredOn: dueOn,
			category: category as "entertainment",
			goalId: null,
			payee,
			description: null,
			note: null,
			source: "subscription",
			demo: false,
			subscriptionId,
			dueOn,
			edited,
			version: 1,
			createdAt: occurredAt,
			updatedAt: occurredAt,
		},
	]);
	return id;
}

/** Writes the tombstone of `subscriptionId` for `dueOn`. */
export async function addSkip(
	owner: Client,
	userId: string,
	subscriptionId: string,
	dueOn: string,
): Promise<void> {
	await insertSubscriptionSkips(owner, userId, [
		{ id: randomUUID(), subscriptionId, dueOn, createdAt: GOLDEN_NOW },
	]);
}

/** Runs `sql` as the owner, who bypasses row-level security: a test's own data setup. */
export async function ownerExec(
	owner: Client,
	sql: string,
	params: unknown[] = [],
): Promise<void> {
	await owner.query(sql, params);
}

/** The golden context with the request clock at 12:00 in India on `day`. */
export function on(userId: string, day: string): ProfiledContext {
	const ctx = goldenContext(userId);
	const now = new Date(`${day}T06:30:00.000Z`);
	return { ...ctx, now, today: todayIn(ctx.profile.timezone, now) };
}

/** `changedAt` at 12:00 in India on `day`. */
export const when = (day: string) => `${day}T06:30:00.000Z`;

export const charges = async (tx: Tx, subscriptionId: string) =>
	(
		await tx.execute<{
			id: string;
			dueOn: string;
			amount: string;
			payee: string;
			category: string;
			edited: boolean;
			version: number;
			occurredOn: string;
			demo: boolean;
		}>(
			sql`SELECT id, due_on::text AS "dueOn", amount_minor::text AS amount, payee, category,
				edited, version, occurred_on::text AS "occurredOn", demo
			FROM app.transactions WHERE subscription_id = ${subscriptionId}::uuid ORDER BY due_on`,
		)
	).rows;

export const dueOns = async (tx: Tx, subscriptionId: string) =>
	(await charges(tx, subscriptionId)).map((row) => row.dueOn);

/** A charge another device made, in the open transaction. */
export async function laterCharge(
	tx: Tx,
	userId: string,
	subscriptionId: string,
	dueOn: string,
	fields: {
		amountMinor?: number;
		payee?: string;
		category?: string;
		edited?: boolean;
	} = {},
): Promise<string> {
	const id = uuidV7At(GOLDEN_NOW);
	const occurredAt = new Date(`${dueOn}T00:00:00+05:30`).toISOString();
	await tx.execute(
		sql`INSERT INTO app.transactions (id, user_id, created_at, updated_at, type, amount_minor,
			occurred_at, occurred_on, category, payee, source, subscription_id, due_on, edited,
			demo, version)
		VALUES (${id}, ${userId}, ${GOLDEN_NOW}, ${GOLDEN_NOW}, 'expense',
			${String(fields.amountMinor ?? 64900)}::bigint, ${occurredAt}, ${dueOn},
			${fields.category ?? "entertainment"}, ${fields.payee ?? "Netflix"}, 'subscription',
			${subscriptionId}::uuid, ${dueOn}, ${fields.edited ?? false}, false, 1)`,
	);
	return id;
}

/** A tombstone, in the open transaction. */
export async function tombstone(
	tx: Tx,
	userId: string,
	subscriptionId: string,
	dueOn: string,
): Promise<void> {
	await tx.execute(
		sql`INSERT INTO app.subscription_skips (id, user_id, created_at, updated_at,
			subscription_id, due_on)
		VALUES (${uuidV7At(GOLDEN_NOW)}, ${userId}, ${GOLDEN_NOW}, ${GOLDEN_NOW},
			${subscriptionId}::uuid, ${dueOn}::date)`,
	);
}

export const skipsOf = async (tx: Tx, subscriptionId: string) =>
	(
		await tx.execute<{ dueOn: string }>(
			sql`SELECT due_on::text AS "dueOn" FROM app.subscription_skips
			WHERE subscription_id = ${subscriptionId}::uuid ORDER BY due_on`,
		)
	).rows.map((row) => row.dueOn);

/** Holds `FOR UPDATE` on a Subscription in a transaction of its own, starts `run`, waits until
 * `run` is blocked on that lock, lets `write` change things in the holder's transaction, commits,
 * and returns what `run` answered. The holder's writes are what a writer committed first. */
export async function holdingLock<T>(
	owner: Client,
	userId: string,
	subscriptionId: string,
	write: (holder: PoolClient) => Promise<void>,
	run: () => Promise<T>,
): Promise<T> {
	const holder = await runtimePool().connect();
	try {
		await holder.query("BEGIN");
		await holder.query("SELECT set_config('app.user_id', $1, true)", [userId]);
		await holder.query(
			"SELECT id FROM app.subscriptions WHERE id = $1 FOR UPDATE",
			[subscriptionId],
		);
		const xid = await transactionIdOf(holder as unknown as Client);
		let finished = false;
		const pending = run().finally(() => {
			finished = true;
		});
		await waitForWaiterOn(owner, xid);
		expect(finished).toBe(false);
		await write(holder);
		await holder.query("COMMIT");
		return await pending;
	} finally {
		await holder.query("ROLLBACK").catch(() => {});
		holder.release();
	}
}

// AC-F05-32
