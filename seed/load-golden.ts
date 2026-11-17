import { randomBytes, randomUUID } from "node:crypto";
import type { ClientBase } from "pg";

import { isGoalType } from "@/lib/transactions/model";

import {
	GOLDEN_ALL,
	GOLDEN_BUDGETS,
	GOLDEN_NOW,
	GOLDEN_PROFILE,
	GOLDEN_SKIPS,
	GOLDEN_SUBSCRIPTIONS,
	GOLDEN_TODAY,
	type GoldenSubscription,
	type GoldenTransaction,
} from "./golden";

/** The golden rows the table holds before F06 (D-471): #1 to #27 without the Goal rows #3, #9,
 * #14, #22 and #23, whose type arrives with F06's migration (D-465). #27 is included: a load
 * is the dataset as it stands once catch-up has run on 2 November. Charges are linked to their
 * Subscription and due date (D-598). */
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
	/** The id of a golden Subscription in this load. */
	subscription(name: GoldenSubscriptionName): string;
};

export type GoldenSubscriptionName = keyof typeof GOLDEN_SUBSCRIPTIONS;

/** What a load can change. */
export type LoadOptions = {
	/** The dataset as it stood before the first request of 2 November: no row #27, and the
	 * profile's last catch-up on 1 November, so that request's catch-up creates #27 and
	 * nothing else (docs/03-golden-dataset.md, Subscriptions; AC-F05-03). */
	beforeCatchUp?: boolean;
};

/** The id with its first 48 bits, the UUIDv7 timestamp, replaced by `prefix`. Ids are unique
 * across users, so each load needs its own; one prefix per load keeps the rows' id order, which
 * breaks ties in every list order (BR-F03-29). */
export function reId(id: string, prefix: string): string {
	return `${prefix.slice(0, 8)}-${prefix.slice(8, 12)}${id.slice(13)}`;
}

/** A fresh id prefix for one load: 12 hex digits. */
export const loadPrefix = () => randomBytes(6).toString("hex");

/** The profile a load writes: golden's India unless `today` moves its last catch-up. */
type ProfileFields = { today?: string };

/** Inserts `userId`'s profile as golden's (D-471): India, rupees, Kolkata, weeks from Monday. */
export async function insertProfile(
	client: ClientBase,
	userId: string,
	{ today = GOLDEN_TODAY }: ProfileFields = {},
): Promise<void> {
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
			today,
		],
	);
}

/** A Subscription as a load writes it: the golden shape with this load's id. */
export type LoadedSubscription = Omit<GoldenSubscription, "id"> & { id: string };

/** Inserts `subscriptions` as `userId`'s Subscriptions in one statement; the pause is split
 * into its two columns. They are recorded at their own `createdAt`, never changed since. */
export async function insertSubscriptions(
	client: ClientBase,
	userId: string,
	subscriptions: readonly LoadedSubscription[],
): Promise<void> {
	await client.query(
		`INSERT INTO app.subscriptions
		   (id, user_id, created_at, updated_at, name, amount_minor, cadence_unit, cadence_every,
		    start_date, category, note, end_date, pause_from, pause_until, charges_from,
		    last_change_on, demo, version)
		 SELECT r.id, $1, r."createdAt", r."createdAt", r.name, r."amountMinor", r.cadence->>'unit',
		        (r.cadence->>'every')::integer, r."startDate", r.category, r.note, r."endDate",
		        (r.pause->>'from')::date, (r.pause->>'until')::date, r."chargesFrom",
		        r."lastChangeOn", r.demo, r.version
		 FROM jsonb_to_recordset($2::jsonb) AS r(
		   id uuid, "createdAt" timestamptz, name text, "amountMinor" bigint, cadence jsonb,
		   "startDate" date, category text, note text, "endDate" date, pause jsonb,
		   "chargesFrom" date, "lastChangeOn" date, demo boolean, version integer)`,
		[userId, JSON.stringify(subscriptions)],
	);
}

/** Inserts the skipped charges `skips` as `userId`'s tombstones in one statement. */
export async function insertSubscriptionSkips(
	client: ClientBase,
	userId: string,
	skips: readonly {
		id: string;
		subscriptionId: string;
		dueOn: string;
		createdAt: string;
	}[],
): Promise<void> {
	await client.query(
		`INSERT INTO app.subscription_skips
		   (id, user_id, created_at, updated_at, subscription_id, due_on)
		 SELECT r.id, $1, r."createdAt", r."createdAt", r."subscriptionId", r."dueOn"
		 FROM jsonb_to_recordset($2::jsonb) AS r(
		   id uuid, "createdAt" timestamptz, "subscriptionId" uuid, "dueOn" date)`,
		[userId, JSON.stringify(skips)],
	);
}

/** Inserts `rows` as `userId`'s Transactions in one statement; `pg` sends them as JSON text.
 * The golden row number, when a row has one, is not stored. A row with no charge link may
 * leave `subscriptionId`, `dueOn` and `edited` out. */
export async function insertTransactions(
	client: ClientBase,
	userId: string,
	rows: readonly (Omit<
		GoldenTransaction,
		"golden" | "subscriptionId" | "dueOn" | "edited"
	>
		& Partial<Pick<GoldenTransaction, "subscriptionId" | "dueOn" | "edited">>)[],
): Promise<void> {
	await client.query(
		`INSERT INTO app.transactions
		   (id, user_id, created_at, updated_at, type, amount_minor, occurred_at, occurred_on,
		    category, payee, description, note, source, subscription_id, due_on, edited, demo,
		    version)
		 SELECT r.id, $1, r."createdAt", r."updatedAt", r.type, r."amountMinor", r."occurredAt",
		        r."occurredOn", r.category, r.payee, r.description, r.note, r.source,
		        r."subscriptionId", r."dueOn", coalesce(r.edited, false), r.demo, r.version
		 FROM jsonb_to_recordset($2::jsonb) AS r(
		   id uuid, "createdAt" timestamptz, "updatedAt" timestamptz, type text, "amountMinor" bigint,
		   "occurredAt" timestamptz, "occurredOn" date, category text, payee text, description text,
		   note text, source text, "subscriptionId" uuid, "dueOn" date, edited boolean, demo boolean,
		   version integer)`,
		[userId, JSON.stringify(rows)],
	);
}

/**
 * Loads the golden profile, the four golden Subscriptions with their one skipped charge, and
 * the golden Transactions for `userId` (D-471, D-598), as `docs/03-golden-dataset.md` shows
 * them on 2 November, in four statements. The Subscriptions go in first: the charges link to
 * them. `client` must be able to write any user's rows: the owner in tests, the system role in
 * the seed script and the end-to-end tests. Ids get a fresh prefix per load, so every test user
 * can hold its own copy. `beforeCatchUp` loads the dataset as it stood before #27 existed.
 */
export async function loadGolden(
	client: ClientBase,
	userId: string,
	{ beforeCatchUp = false }: LoadOptions = {},
): Promise<LoadedGolden> {
	const prefix = loadPrefix();
	const subscriptions = Object.values(GOLDEN_SUBSCRIPTIONS).map(
		(subscription) => ({
			...subscription,
			id: reId(subscription.id, prefix),
		}),
	);
	const rows = GOLDEN_M1_ROWS.filter(
		(row) => !beforeCatchUp || row.golden !== 27,
	).map((row) => ({
		...row,
		id: reId(row.id, prefix),
		subscriptionId: row.subscriptionId && reId(row.subscriptionId, prefix),
	}));
	await insertProfile(client, userId, {
		today: beforeCatchUp ? "2026-11-01" : GOLDEN_TODAY,
	});
	await insertSubscriptions(client, userId, subscriptions);
	await insertSubscriptionSkips(
		client,
		userId,
		GOLDEN_SKIPS.map((skip) => ({
			id: reId(skip.id, prefix),
			subscriptionId: reId(GOLDEN_SUBSCRIPTIONS[skip.subscription].id, prefix),
			dueOn: skip.dueOn,
			createdAt: skip.createdAt,
		})),
	);
	await insertTransactions(client, userId, rows);

	const byNumber = new Map(rows.map((row) => [row.golden, row.id]));
	const byId = new Map(rows.map((row) => [row.id, row.golden]));
	const subscriptionIds = new Map(
		Object.keys(GOLDEN_SUBSCRIPTIONS).map((name, index) => [
			name,
			subscriptions[index]!.id,
		]),
	);
	return {
		userId,
		rows,
		id(n) {
			const id = byNumber.get(n);
			if (id === undefined)
				throw new RangeError(`Golden row #${n} is not loaded.`);
			return id;
		},
		golden(id) {
			const n = byId.get(id);
			if (n === undefined)
				throw new RangeError(`${id} is not a golden row of this load.`);
			return n;
		},
		subscription: (name) => subscriptionIds.get(name)!,
	};
}

/** A Budget as a load writes it: the golden shape with this load's id. */
export type LoadedBudget = (typeof GOLDEN_BUDGETS)[number] & { id: string };

/** Inserts `budgets` as `userId`'s Budgets in one statement, recorded at the golden clock. */
export async function insertBudgets(
	client: ClientBase,
	userId: string,
	budgets: readonly LoadedBudget[],
): Promise<void> {
	await client.query(
		`INSERT INTO app.budgets
		   (id, user_id, created_at, updated_at, category, schedule, overrides, demo, version)
		 SELECT r.id, $1, $2, $2, r.category, r.schedule, r.overrides, r.demo, r.version
		 FROM jsonb_to_recordset($3::jsonb) AS r(
		   id uuid, category text, schedule jsonb, overrides jsonb, demo boolean, version integer)`,
		[userId, GOLDEN_NOW, JSON.stringify(budgets)],
	);
}

/**
 * Loads the four golden Budgets for `userId` (docs/03-golden-dataset.md, Setup), who already
 * has the golden profile, in one statement. Kept apart from `loadGolden`, so the integration
 * tests that count a user's rows keep the data they were written for; the E2E golden user
 * loads both. Returns the loaded Budgets with this load's ids.
 */
export async function loadGoldenBudgets(
	client: ClientBase,
	userId: string,
): Promise<LoadedBudget[]> {
	const prefix = loadPrefix();
	const budgets = GOLDEN_BUDGETS.map((budget) => ({
		...budget,
		id: reId(budget.id, prefix),
	}));
	await insertBudgets(client, userId, budgets);
	return budgets;
}
