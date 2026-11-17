import { randomUUID } from "node:crypto";
import type { Client } from "pg";

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
import { uuidV7At } from "../../transactions/__tests__/helpers";

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
