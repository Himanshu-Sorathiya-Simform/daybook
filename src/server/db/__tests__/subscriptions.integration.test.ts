import { randomUUID } from "node:crypto";
import { Client, DatabaseError, Pool, type PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

import { GOLDEN_NOW, GOLDEN_SUBSCRIPTIONS } from "../../../../seed/golden";
import { parseOwnerEnv, parseServerEnv } from "../../env";
import { createUser } from "./private-rows";

/** The `app.subscriptions` and `app.subscription_skips` tables and the charge link on
 * `app.transactions` (F05 section 3, D-598): every row a user writes goes through the runtime
 * role with the user context set, as the data access layer sets it. Each test rolls back. */

type Row = Record<string, string | number | boolean | null>;

let owner: Client;
let runtime: Pool;
let user: string;
let other: string;

beforeAll(async () => {
	owner = new Client({
		connectionString: parseOwnerEnv(process.env).DATABASE_URL_OWNER,
	});
	await owner.connect();
	runtime = new Pool({
		connectionString: parseServerEnv(process.env).DATABASE_URL_RUNTIME,
		max: 2,
	});
	user = await createUser(owner, "subscriptions");
	other = await createUser(owner, "subscriptions-other");
});

afterAll(async () => {
	await owner?.query(`DELETE FROM auth."user" WHERE id = ANY($1)`, [
		[user, other],
	]);
	await Promise.all([owner?.end(), runtime?.end()]);
});

const CHECK = "23514";
const UNIQUE = "23505";
const FOREIGN_KEY = "23503";
const NOT_NULL = "23502";
const GENERATED_ALWAYS = "428C9";

/** Golden Netflix (docs/03-golden-dataset.md, Setup), as a database row of `userId`. */
const subscription = (changes: Row = {}, userId = user): Row => {
	const netflix = GOLDEN_SUBSCRIPTIONS.netflix;
	return {
		id: randomUUID(),
		user_id: userId,
		created_at: netflix.createdAt,
		updated_at: netflix.createdAt,
		name: netflix.name,
		amount_minor: netflix.amountMinor,
		cadence_unit: netflix.cadence.unit,
		cadence_every: netflix.cadence.every,
		start_date: netflix.startDate,
		category: netflix.category,
		charges_from: netflix.chargesFrom,
		last_change_on: netflix.lastChangeOn,
		...changes,
	};
};

/** A skipped charge: golden Cult Gym's 10 October, unless `changes` say otherwise. */
const skip = (parent: Row, changes: Row = {}): Row => ({
	id: randomUUID(),
	user_id: parent["user_id"] as string,
	created_at: GOLDEN_NOW,
	updated_at: GOLDEN_NOW,
	subscription_id: parent["id"] as string,
	due_on: "2026-10-10",
	...changes,
});

/** A charge of `parent`: golden #16, Netflix on 5 October, 649.00, at 00:00 in Kolkata. */
const charge = (parent: Row, changes: Row = {}): Row => ({
	id: randomUUID(),
	user_id: parent["user_id"] as string,
	created_at: "2026-10-04T18:30:00Z",
	updated_at: "2026-10-04T18:30:00Z",
	type: "expense",
	amount_minor: 64900,
	occurred_at: "2026-10-04T18:30:00Z",
	occurred_on: "2026-10-05",
	category: "entertainment",
	payee: "Netflix",
	source: "subscription",
	subscription_id: parent["id"] as string,
	due_on: "2026-10-05",
	version: 1,
	...changes,
});

/** A manual expense: golden #24, Swiggy on 19 October. */
const manual = (changes: Row = {}, userId = user): Row => ({
	id: randomUUID(),
	user_id: userId,
	created_at: GOLDEN_NOW,
	updated_at: GOLDEN_NOW,
	type: "expense",
	amount_minor: 64000,
	occurred_at: "2026-10-19T16:45:00Z",
	occurred_on: "2026-10-19",
	category: "food",
	payee: "Swiggy",
	source: "manual",
	version: 1,
	...changes,
});

type Table = "subscriptions" | "subscription_skips" | "transactions";

function insert(client: Client | PoolClient, table: Table, row: Row) {
	const columns = Object.keys(row);
	return client.query(
		`INSERT INTO app.${table} (${columns.join(", ")})
		 VALUES (${columns.map((_, index) => `$${index + 1}`).join(", ")})`,
		Object.values(row),
	);
}

async function asUser<T>(
	fn: (client: PoolClient) => Promise<T>,
	userId = user,
): Promise<T> {
	const client = await runtime.connect();
	try {
		await client.query("BEGIN");
		await client.query("SELECT set_config('app.user_id', $1, true)", [userId]);
		return await fn(client);
	} finally {
		await client.query("ROLLBACK").catch(() => {});
		client.release();
	}
}

type Refusal = { code: string; constraint: string | null } | null;

async function failure(promise: Promise<unknown>): Promise<Refusal> {
	try {
		await promise;
		return null;
	} catch (error) {
		if (!(error instanceof DatabaseError)) throw error;
		return { code: error.code ?? "", constraint: error.constraint ?? null };
	}
}

/** Runs `setup` as the user, then reports what `last` ends with: null, or the SQLSTATE and
 * constraint of its failure. */
const refusalAfter = (
	setup: (client: PoolClient) => Promise<unknown>,
	last: (client: PoolClient) => Promise<unknown>,
) =>
	asUser(async (client) => {
		await setup(client);
		return failure(last(client));
	});

/** The refusal of inserting a Subscription row. */
const subscriptionRefusal = (changes: Row) =>
	refusalAfter(
		async () => {},
		(client) => insert(client, "subscriptions", subscription(changes)),
	);

/** The refusal of inserting a charge of a Subscription that exists. */
const chargeRefusal = (changes: Row) =>
	refusalAfter(
		async () => {},
		async (client) => {
			const parent = subscription();
			await insert(client, "subscriptions", parent);
			await insert(client, "transactions", charge(parent, changes));
		},
	);

/** The refusal of inserting a manual expense. */
const manualRefusal = (changes: Row) =>
	refusalAfter(
		async () => {},
		(client) => insert(client, "transactions", manual(changes)),
	);

describe("a Subscription", () => {
	test("each golden Subscription inserts and reads back, field for field", async () => {
		const stored = await asUser(async (client) => {
			for (const golden of Object.values(GOLDEN_SUBSCRIPTIONS)) {
				await insert(
					client,
					"subscriptions",
					subscription({
						id: golden.id,
						name: golden.name,
						amount_minor: golden.amountMinor,
						cadence_unit: golden.cadence.unit,
						cadence_every: golden.cadence.every,
						start_date: golden.startDate,
						category: golden.category,
						charges_from: golden.chargesFrom,
						last_change_on: golden.lastChangeOn,
						created_at: golden.createdAt,
						updated_at: golden.createdAt,
					}),
				);
			}
			const result = await client.query(
				`SELECT name, amount_minor::int AS amount_minor, cadence_unit, cadence_every,
				        start_date::text, category, category_kind, note, end_date::text,
				        pause_from::text, pause_until::text, charges_from::text,
				        last_change_on::text, demo, version
				 FROM app.subscriptions ORDER BY name`,
			);
			return result.rows;
		});
		expect(stored).toEqual(
			[
				["Amazon Prime", 149900, "month", 12, "2026-10-12", "entertainment"],
				["Cult Gym", 150000, "month", 1, "2026-09-10", "health"],
				["Netflix", 64900, "month", 1, "2026-09-05", "entertainment"],
				["Sunrise Apartments", 1800000, "month", 1, "2026-09-01", "housing"],
			].map(([name, amount, unit, every, start, category]) => ({
				name,
				amount_minor: amount,
				cadence_unit: unit,
				cadence_every: every,
				start_date: start,
				category,
				category_kind: "expense",
				note: null,
				end_date: null,
				pause_from: null,
				pause_until: null,
				charges_from: start,
				last_change_on: start,
				demo: false,
				version: 1,
			})),
		);
	});

	test("a new row starts at version 1 and is not demo data", async () => {
		const stored = await asUser(async (client) => {
			await insert(client, "subscriptions", subscription());
			return (
				await client.query<{ demo: boolean; version: number }>(
					"SELECT demo, version FROM app.subscriptions",
				)
			).rows;
		});
		expect(stored).toEqual([{ demo: false, version: 1 }]);
	});

	test("a stored amount stays a whole number in the minor unit", async () => {
		const stored = await asUser(async (client) => {
			await insert(
				client,
				"subscriptions",
				subscription({ amount_minor: 999999999999 }),
			);
			return (
				await client.query<{ amount_minor: string }>(
					"SELECT amount_minor FROM app.subscriptions",
				)
			).rows[0]?.amount_minor;
		});
		expect(stored).toBe("999999999999");
	});

	test("duplicate names are allowed (F05 section 3)", async () => {
		expect(
			await refusalAfter(
				(client) => insert(client, "subscriptions", subscription()),
				(client) => insert(client, "subscriptions", subscription()),
			),
		).toBeNull();
	});

	test("two users hold the same name", async () => {
		await owner.query("BEGIN");
		try {
			await insert(owner, "subscriptions", subscription());
			expect(
				await failure(
					insert(owner, "subscriptions", subscription({}, other)),
				),
			).toBeNull();
		} finally {
			await owner.query("ROLLBACK");
		}
	});

	test("a repeated id is refused by the primary key", async () => {
		const first = subscription();
		expect(
			await refusalAfter(
				(client) => insert(client, "subscriptions", first),
				(client) =>
					insert(
						client,
						"subscriptions",
						subscription({ id: first["id"] as string }),
					),
			),
		).toEqual({ code: UNIQUE, constraint: "subscriptions_pkey" });
	});

	// BR-F05-02, BR-F05-14: a create inserts with ON CONFLICT DO NOTHING and no target, so
	// neither a repeated id nor another unique key aborts the transaction.
	test("ON CONFLICT DO NOTHING with no target inserts nothing on a repeated id", async () => {
		const counts = await asUser(async (client) => {
			const first = subscription();
			await insert(client, "subscriptions", first);
			const row = subscription({ id: first["id"] as string });
			const columns = Object.keys(row);
			const again = await client.query(
				`INSERT INTO app.subscriptions (${columns.join(", ")})
				 VALUES (${columns.map((_, index) => `$${index + 1}`).join(", ")})
				 ON CONFLICT DO NOTHING`,
				Object.values(row),
			);
			const total = await client.query<{ n: number }>(
				"SELECT count(*)::int AS n FROM app.subscriptions",
			);
			return [again.rowCount, total.rows[0]?.n];
		});
		expect(counts).toEqual([0, 1]);
	});

	describe("the name (BR-F05 section 3, TXN-4's text rules)", () => {
		test.each([
			["one character", "N"],
			["60 characters", "n".repeat(60)],
			["60 code points of emoji, 120 UTF-16 units", "😀".repeat(60)],
			["spaces inside", "Disney Plus Hotstar"],
			["Devanagari", "नेटफ्लिक्स"],
		])("takes %s", async (_label, name) => {
			expect(await subscriptionRefusal({ name })).toBeNull();
		});

		test.each([
			["an empty name", ""],
			["61 characters", "n".repeat(61)],
			["61 code points of emoji", "😀".repeat(61)],
			["a tab", "Net\tflix"],
			["a line feed", "Net\nflix"],
			["a null-adjacent control character, U+0001", "Net\u0001flix"],
			["DEL, U+007F", "Net\u007fflix"],
			["a C1 control character, U+0085", "Net\u0085flix"],
			["a decomposed letter (not NFC)", "Café"],
		])("refuses %s", async (_label, name) => {
			expect(await subscriptionRefusal({ name })).toEqual({
				code: CHECK,
				constraint: "subscriptions_name_text",
			});
		});

		test("may not be missing", async () => {
			expect(await subscriptionRefusal({ name: null })).toEqual({
				code: NOT_NULL,
				constraint: null,
			});
		});
	});

	describe("the note", () => {
		test.each([
			["none", null],
			["one character", "x"],
			["500 characters", "x".repeat(500)],
			["a line break", "Billed on\nthe 5th"],
		])("takes %s", async (_label, note) => {
			expect(await subscriptionRefusal({ note })).toBeNull();
		});

		test.each([
			["empty text, which is stored as null instead", ""],
			["501 characters", "x".repeat(501)],
			["a tab", "a\tb"],
			["a control character", "a\u0001b"],
			["a decomposed letter", "é"],
		])("refuses %s", async (_label, note) => {
			expect(await subscriptionRefusal({ note })).toEqual({
				code: CHECK,
				constraint: "subscriptions_note_text",
			});
		});
	});

	describe("the amount (MON-5)", () => {
		test.each([1, 64900, 999999999999])("takes %i", async (amount_minor) => {
			expect(await subscriptionRefusal({ amount_minor })).toBeNull();
		});

		test.each([0, -1, -64900, 1000000000000])(
			"refuses %i",
			async (amount_minor) => {
				expect(await subscriptionRefusal({ amount_minor })).toEqual({
					code: CHECK,
					constraint: "subscriptions_amount_range",
				});
			},
		);

		test("may not be missing", async () => {
			expect(await subscriptionRefusal({ amount_minor: null })).toEqual({
				code: NOT_NULL,
				constraint: null,
			});
		});
	});

	describe("the cadence (D-90)", () => {
		test.each([
			["weekly", "week", 1],
			["every 2 weeks", "week", 2],
			["every 52 weeks", "week", 52],
			["monthly", "month", 1],
			["every 3 months", "month", 3],
			["yearly", "month", 12],
			["every 24 months", "month", 24],
		])("takes %s", async (_label, cadence_unit, cadence_every) => {
			expect(
				await subscriptionRefusal({ cadence_unit, cadence_every }),
			).toBeNull();
		});

		test.each([
			["0 weeks", "week", 0],
			["53 weeks", "week", 53],
			["a negative number of weeks", "week", -1],
			["0 months", "month", 0],
			["25 months", "month", 25],
			["a negative number of months", "month", -3],
			["52 months, the weeks' limit on the months", "month", 52],
			["a unit in days", "day", 10],
			["a unit in years", "year", 1],
			["a unit in capitals", "WEEK", 1],
			["an empty unit", "", 1],
		])("refuses %s", async (_label, cadence_unit, cadence_every) => {
			expect(
				await subscriptionRefusal({ cadence_unit, cadence_every }),
			).toEqual({
				code: CHECK,
				constraint: "subscriptions_cadence_values",
			});
		});

		test.each(["cadence_unit", "cadence_every"])(
			"may not miss %s",
			async (column) => {
				expect(await subscriptionRefusal({ [column]: null })).toEqual({
					code: NOT_NULL,
					constraint: null,
				});
			},
		);
	});

	describe("the category (CAT-2)", () => {
		test("may be any expense category", async () => {
			for (const category of [
				"housing",
				"entertainment",
				"fees_taxes",
				"other",
			]) {
				expect(await subscriptionRefusal({ category })).toBeNull();
			}
		});

		test.each(["salary", "freelance", "gifts"])(
			"refuses the income category %s",
			async (category) => {
				expect(await subscriptionRefusal({ category })).toEqual({
					code: FOREIGN_KEY,
					constraint: "subscriptions_category_kind_fk",
				});
			},
		);

		test("refuses a key that is no category", async () => {
			expect(await subscriptionRefusal({ category: "streaming" })).toEqual({
				code: FOREIGN_KEY,
				constraint: "subscriptions_category_kind_fk",
			});
		});

		test("may not be missing", async () => {
			expect(await subscriptionRefusal({ category: null })).toEqual({
				code: NOT_NULL,
				constraint: null,
			});
		});

		test("its kind is computed and can't be written", async () => {
			expect(await subscriptionRefusal({ category_kind: "income" })).toEqual({
				code: GENERATED_ALWAYS,
				constraint: null,
			});
		});
	});

	describe("the dates", () => {
		test.each(["start_date", "charges_from", "last_change_on"])(
			"may not miss %s",
			async (column) => {
				expect(await subscriptionRefusal({ [column]: null })).toEqual({
					code: NOT_NULL,
					constraint: null,
				});
			},
		);

		test.each([
			["no end date", null],
			["an end date on the start date", "2026-09-05"],
			["an end date after the start date", "2026-09-30"],
			["an end date years later", "2036-09-05"],
		])("takes %s", async (_label, end_date) => {
			expect(await subscriptionRefusal({ end_date })).toBeNull();
		});

		test("refuses an end date before the start date", async () => {
			expect(await subscriptionRefusal({ end_date: "2026-09-04" })).toEqual({
				code: CHECK,
				constraint: "subscriptions_end_after_start",
			});
		});

		test("takes charges_from on and after the start date", async () => {
			for (const charges_from of ["2026-09-05", "2026-09-06", "2027-01-01"]) {
				expect(await subscriptionRefusal({ charges_from })).toBeNull();
			}
		});

		test("refuses charges_from before the start date", async () => {
			expect(
				await subscriptionRefusal({ charges_from: "2026-09-04" }),
			).toEqual({
				code: CHECK,
				constraint: "subscriptions_charges_from_not_before_start",
			});
		});

		test("takes a charges_from after the end date: nothing more is charged", async () => {
			expect(
				await subscriptionRefusal({
					end_date: "2026-09-30",
					charges_from: "2026-10-03",
				}),
			).toBeNull();
		});

		test("takes a leap day and the last day of a month", async () => {
			expect(
				await subscriptionRefusal({
					start_date: "2028-02-29",
					charges_from: "2028-02-29",
					last_change_on: "2028-02-29",
				}),
			).toBeNull();
			expect(
				await subscriptionRefusal({
					start_date: "2026-01-31",
					charges_from: "2026-01-31",
				}),
			).toBeNull();
		});
	});

	describe("the pause (D-94, BR-F05-28)", () => {
		test("takes none", async () => {
			expect(
				await subscriptionRefusal({ pause_from: null, pause_until: null }),
			).toBeNull();
		});

		test("takes a pause of one day and a long one", async () => {
			for (const [from, until] of [
				["2026-11-05", "2026-11-06"],
				["2026-11-05", "2027-01-05"],
				["2026-11-05", "2028-11-02"],
			] as const) {
				expect(
					await subscriptionRefusal({
						pause_from: from,
						pause_until: until,
					}),
				).toBeNull();
			}
		});

		test("takes a pause that starts before the start date or after the end date", async () => {
			expect(
				await subscriptionRefusal({
					pause_from: "2026-01-01",
					pause_until: "2026-02-01",
				}),
			).toBeNull();
			expect(
				await subscriptionRefusal({
					end_date: "2026-12-31",
					pause_from: "2027-01-01",
					pause_until: "2027-02-01",
				}),
			).toBeNull();
		});

		test.each([
			["until on from", "2026-11-05", "2026-11-05"],
			["until before from", "2026-11-05", "2026-11-04"],
			["only from", "2026-11-05", null],
			["only until", null, "2027-01-05"],
		])("refuses %s", async (_label, pause_from, pause_until) => {
			expect(await subscriptionRefusal({ pause_from, pause_until })).toEqual({
				code: CHECK,
				constraint: "subscriptions_pause_pair",
			});
		});
	});

	test.each([0, -1])("refuses version %i", async (version) => {
		expect(await subscriptionRefusal({ version })).toEqual({
			code: CHECK,
			constraint: "subscriptions_version_positive",
		});
	});

	test("takes a higher version and the demo flag", async () => {
		expect(await subscriptionRefusal({ version: 7, demo: true })).toBeNull();
	});

	test("the primary key and the key on user and id are the only indexes", async () => {
		const result = await owner.query<{ indexname: string; indexdef: string }>(
			`SELECT indexname, indexdef FROM pg_indexes
			 WHERE schemaname = 'app' AND tablename = 'subscriptions' ORDER BY indexname`,
		);
		const indexes = Object.fromEntries(
			result.rows.map((row) => [row.indexname, row.indexdef]),
		);
		expect(Object.keys(indexes)).toEqual([
			"subscriptions_pkey",
			"subscriptions_user_id_id_key",
		]);
		expect(indexes["subscriptions_user_id_id_key"]).toContain(
			"USING btree (user_id, id)",
		);
	});
});

describe("a skipped charge (D-93)", () => {
	test("inserts for the user's own Subscription and reads back", async () => {
		const stored = await asUser(async (client) => {
			const parent = subscription();
			await insert(client, "subscriptions", parent);
			await insert(client, "subscription_skips", skip(parent));
			return (
				await client.query(
					"SELECT subscription_id, due_on::text, created_at, updated_at FROM app.subscription_skips",
				)
			).rows;
		});
		expect(stored).toHaveLength(1);
		expect(stored[0]).toMatchObject({ due_on: "2026-10-10" });
		expect(stored[0].created_at).toEqual(stored[0].updated_at);
	});

	test("one Subscription holds skips on several dates", async () => {
		expect(
			await refusalAfter(
				async (client) => {
					const parent = subscription();
					await insert(client, "subscriptions", parent);
					await insert(client, "subscription_skips", skip(parent));
					await insert(
						client,
						"subscription_skips",
						skip(parent, { due_on: "2026-11-10" }),
					);
					await insert(
						client,
						"subscription_skips",
						skip(parent, { due_on: "2026-12-10" }),
					);
				},
				async () => {},
			),
		).toBeNull();
	});

	test("a date is skipped once per Subscription", async () => {
		const parent = subscription();
		expect(
			await refusalAfter(
				async (client) => {
					await insert(client, "subscriptions", parent);
					await insert(client, "subscription_skips", skip(parent));
				},
				(client) => insert(client, "subscription_skips", skip(parent)),
			),
		).toEqual({
			code: UNIQUE,
			constraint: "subscription_skips_user_id_subscription_id_due_on_key",
		});
	});

	test("two Subscriptions may skip the same date", async () => {
		expect(
			await refusalAfter(
				async (client) => {
					const first = subscription();
					const second = subscription();
					await insert(client, "subscriptions", first);
					await insert(client, "subscriptions", second);
					await insert(client, "subscription_skips", skip(first));
				},
				async () => {},
			),
		).toBeNull();
		const parents = [subscription(), subscription()];
		expect(
			await refusalAfter(
				async (client) => {
					for (const parent of parents)
						await insert(client, "subscriptions", parent);
					await insert(client, "subscription_skips", skip(parents[0]!));
				},
				(client) => insert(client, "subscription_skips", skip(parents[1]!)),
			),
		).toBeNull();
	});

	// BR-F05-26: a skip repeated by a retry or a second device inserts nothing and errors nothing.
	test("ON CONFLICT DO NOTHING with no target inserts nothing for a skipped date", async () => {
		const counts = await asUser(async (client) => {
			const parent = subscription();
			await insert(client, "subscriptions", parent);
			await insert(client, "subscription_skips", skip(parent));
			const again = skip(parent);
			const columns = Object.keys(again);
			const result = await client.query(
				`INSERT INTO app.subscription_skips (${columns.join(", ")})
				 VALUES (${columns.map((_, index) => `$${index + 1}`).join(", ")})
				 ON CONFLICT DO NOTHING`,
				Object.values(again),
			);
			const total = await client.query<{ n: number }>(
				"SELECT count(*)::int AS n FROM app.subscription_skips",
			);
			return [result.rowCount, total.rows[0]?.n];
		});
		expect(counts).toEqual([0, 1]);
	});

	// AC-P2-05: a composite key refuses a parent the user does not own.
	test("refuses a Subscription that does not exist", async () => {
		expect(
			await refusalAfter(
				async () => {},
				(client) =>
					insert(client, "subscription_skips", skip(subscription())),
			),
		).toEqual({
			code: FOREIGN_KEY,
			constraint: "subscription_skips_subscription_fk",
		});
	});

	test("refuses another user's Subscription, though it exists", async () => {
		const theirs = subscription({}, other);
		await insert(owner, "subscriptions", theirs);
		try {
			expect(
				await refusalAfter(
					async () => {},
					(client) =>
						insert(
							client,
							"subscription_skips",
							skip(theirs, { user_id: user }),
						),
				),
			).toEqual({
				code: FOREIGN_KEY,
				constraint: "subscription_skips_subscription_fk",
			});
		} finally {
			await owner.query("DELETE FROM app.subscriptions WHERE id = $1", [
				theirs["id"],
			]);
		}
	});

	test.each(["subscription_id", "due_on"])("may not miss %s", async (column) => {
		const parent = subscription();
		expect(
			await refusalAfter(
				(client) => insert(client, "subscriptions", parent),
				(client) =>
					insert(
						client,
						"subscription_skips",
						skip(parent, { [column]: null }),
					),
			),
		).toEqual({ code: NOT_NULL, constraint: null });
	});

	// BR-F05-14: the delete removes the skips first, so a parent with skips refuses to go.
	test("blocks the delete of its Subscription until it is removed", async () => {
		const parent = subscription();
		const result = await asUser(async (client) => {
			await insert(client, "subscriptions", parent);
			await insert(client, "subscription_skips", skip(parent));
			const blocked = await failure(
				client.query("DELETE FROM app.subscriptions WHERE id = $1", [
					parent["id"],
				]),
			);
			// A failed statement aborts the transaction, so the rest runs in a fresh one.
			return blocked;
		});
		expect(result).toEqual({
			code: FOREIGN_KEY,
			constraint: "subscription_skips_subscription_fk",
		});
	});

	test("lets its Subscription go once the skips are deleted", async () => {
		const parent = subscription();
		const deleted = await asUser(async (client) => {
			await insert(client, "subscriptions", parent);
			await insert(client, "subscription_skips", skip(parent));
			await client.query("DELETE FROM app.subscription_skips");
			return client.query("DELETE FROM app.subscriptions WHERE id = $1", [
				parent["id"],
			]);
		});
		expect(deleted.rowCount).toBe(1);
	});

	test("a Subscription with no skips deletes freely", async () => {
		const parent = subscription();
		const deleted = await asUser(async (client) => {
			await insert(client, "subscriptions", parent);
			return client.query("DELETE FROM app.subscriptions WHERE id = $1", [
				parent["id"],
			]);
		});
		expect(deleted.rowCount).toBe(1);
	});

	test("the skips of other Subscriptions don't block a delete", async () => {
		const [first, second] = [subscription(), subscription()];
		const deleted = await asUser(async (client) => {
			await insert(client, "subscriptions", first);
			await insert(client, "subscriptions", second);
			await insert(client, "subscription_skips", skip(second));
			return client.query("DELETE FROM app.subscriptions WHERE id = $1", [
				first["id"],
			]);
		});
		expect(deleted.rowCount).toBe(1);
	});

	test("the key on user, Subscription and date is the lookup index", async () => {
		const result = await owner.query<{ indexname: string }>(
			`SELECT indexname FROM pg_indexes
			 WHERE schemaname = 'app' AND tablename = 'subscription_skips' ORDER BY indexname`,
		);
		expect(result.rows.map((row) => row.indexname)).toEqual([
			"subscription_skips_pkey",
			"subscription_skips_user_id_subscription_id_due_on_key",
		]);
	});
});

describe("a charge's link to its Subscription (BR-F05-02, D-96)", () => {
	test("a charge inserts with its Subscription and due date, and reads back", async () => {
		const stored = await asUser(async (client) => {
			const parent = subscription();
			await insert(client, "subscriptions", parent);
			await insert(client, "transactions", charge(parent));
			const result = await client.query(
				`SELECT subscription_id = $1 AS linked, due_on::text, edited, source
				 FROM app.transactions`,
				[parent["id"]],
			);
			return result.rows;
		});
		expect(stored).toEqual([
			{
				linked: true,
				due_on: "2026-10-05",
				edited: false,
				source: "subscription",
			},
		]);
	});

	test("a manual expense has no link, no due date and is not edited", async () => {
		const stored = await asUser(async (client) => {
			await insert(client, "transactions", manual());
			return (
				await client.query(
					"SELECT subscription_id, due_on, edited FROM app.transactions",
				)
			).rows;
		});
		expect(stored).toEqual([
			{ subscription_id: null, due_on: null, edited: false },
		]);
	});

	describe("the charge check", () => {
		test("takes a charge of a Subscription that is gone: source, due date and no link", async () => {
			expect(await chargeRefusal({ subscription_id: null })).toBeNull();
		});

		test("takes an edited charge, linked or unlinked", async () => {
			expect(await chargeRefusal({ edited: true })).toBeNull();
			expect(
				await chargeRefusal({ edited: true, subscription_id: null }),
			).toBeNull();
		});

		test("refuses a charge with no due date", async () => {
			expect(await chargeRefusal({ due_on: null })).toEqual({
				code: CHECK,
				constraint: "transactions_charge_link",
			});
			expect(
				await chargeRefusal({ due_on: null, subscription_id: null }),
			).toEqual({
				code: CHECK,
				constraint: "transactions_charge_link",
			});
		});

		test.each([
			["a link to a Subscription", { subscription_id: randomUUID() }],
			["a due date", { due_on: "2026-10-19" }],
			["the edited flag", { edited: true }],
		])("refuses a manual expense with %s", async (_label, changes) => {
			expect(await manualRefusal(changes)).toEqual({
				code: CHECK,
				constraint: "transactions_charge_link",
			});
		});

		test("refuses a manual expense linked to a real Subscription", async () => {
			const parent = subscription();
			expect(
				await refusalAfter(
					(client) => insert(client, "subscriptions", parent),
					(client) =>
						insert(
							client,
							"transactions",
							manual({ subscription_id: parent["id"] as string }),
						),
				),
			).toEqual({ code: CHECK, constraint: "transactions_charge_link" });
		});

		test("edited may not be missing", async () => {
			expect(await chargeRefusal({ edited: null })).toEqual({
				code: NOT_NULL,
				constraint: null,
			});
		});

		test("edited is false when left out", async () => {
			const stored = await asUser(async (client) => {
				await insert(client, "transactions", manual());
				return (
					await client.query<{ edited: boolean }>(
						"SELECT edited FROM app.transactions",
					)
				).rows[0]?.edited;
			});
			expect(stored).toBe(false);
		});
	});

	describe("the due date is the charge's day", () => {
		test("takes a due date on the occurred date", async () => {
			expect(await chargeRefusal({})).toBeNull();
		});

		test.each(["2026-10-04", "2026-10-06", "2027-10-05"])(
			"refuses a due date of %s for a charge on 5 October",
			async (due_on) => {
				expect(await chargeRefusal({ due_on })).toEqual({
					code: CHECK,
					constraint: "transactions_due_on_is_occurred_on",
				});
			},
		);

		test("holds in a zone ahead of UTC, where the day before is the UTC date (TIME-6)", async () => {
			expect(
				await chargeRefusal({
					occurred_at: "2026-10-04T18:30:00Z",
					occurred_on: "2026-10-05",
					due_on: "2026-10-05",
				}),
			).toBeNull();
		});
	});

	describe("the composite key to the Subscription (BR-P2-06)", () => {
		test("refuses a Subscription that does not exist", async () => {
			expect(
				await refusalAfter(
					async () => {},
					(client) =>
						insert(client, "transactions", charge(subscription())),
				),
			).toEqual({
				code: FOREIGN_KEY,
				constraint: "transactions_subscription_fk",
			});
		});

		test("refuses another user's Subscription, though it exists", async () => {
			const theirs = subscription({}, other);
			await insert(owner, "subscriptions", theirs);
			try {
				expect(
					await refusalAfter(
						async () => {},
						(client) =>
							insert(
								client,
								"transactions",
								charge(theirs, { user_id: user }),
							),
					),
				).toEqual({
					code: FOREIGN_KEY,
					constraint: "transactions_subscription_fk",
				});
			} finally {
				await owner.query("DELETE FROM app.subscriptions WHERE id = $1", [
					theirs["id"],
				]);
			}
		});

		test("an unlinked charge needs no Subscription", async () => {
			expect(await chargeRefusal({ subscription_id: null })).toBeNull();
		});
	});

	describe("one charge for each Subscription and due date", () => {
		// Built after the top-level beforeAll has created the user.
		let parent: Row;
		beforeAll(() => {
			parent = subscription();
		});
		const setup = async (client: PoolClient) => {
			await insert(client, "subscriptions", parent);
			await insert(client, "transactions", charge(parent));
		};

		test("a second charge on the same date is refused", async () => {
			expect(
				await refusalAfter(setup, (client) =>
					insert(client, "transactions", charge(parent)),
				),
			).toEqual({
				code: UNIQUE,
				constraint: "transactions_subscription_due_key",
			});
		});

		test("a second charge on another date is allowed", async () => {
			expect(
				await refusalAfter(setup, (client) =>
					insert(
						client,
						"transactions",
						charge(parent, {
							occurred_at: "2026-11-04T18:30:00Z",
							occurred_on: "2026-11-05",
							due_on: "2026-11-05",
						}),
					),
				),
			).toBeNull();
		});

		test("another Subscription may charge the same date", async () => {
			const second = subscription();
			expect(
				await refusalAfter(
					async (client) => {
						await setup(client);
						await insert(client, "subscriptions", second);
					},
					(client) => insert(client, "transactions", charge(second)),
				),
			).toBeNull();
		});

		test("a charge and a manual expense on the same day don't collide", async () => {
			expect(
				await refusalAfter(setup, (client) =>
					insert(
						client,
						"transactions",
						manual({
							occurred_on: "2026-10-05",
							occurred_at: "2026-10-05T06:30:00Z",
						}),
					),
				),
			).toBeNull();
		});

		test("unlinked charges on the same date never collide: null is distinct", async () => {
			expect(
				await refusalAfter(
					async (client) => {
						await insert(
							client,
							"transactions",
							charge(parent, { subscription_id: null }),
						);
					},
					(client) =>
						insert(
							client,
							"transactions",
							charge(parent, { subscription_id: null }),
						),
				),
			).toBeNull();
		});

		// BR-F05-02: catch-up inserts every missing charge with ON CONFLICT DO NOTHING.
		test("ON CONFLICT DO NOTHING with no target inserts nothing for a charged date", async () => {
			const counts = await asUser(async (client) => {
				await setup(client);
				const again = charge(parent);
				const columns = Object.keys(again);
				const result = await client.query(
					`INSERT INTO app.transactions (${columns.join(", ")})
					 VALUES (${columns.map((_, index) => `$${index + 1}`).join(", ")})
					 ON CONFLICT DO NOTHING`,
					Object.values(again),
				);
				const total = await client.query<{ n: number }>(
					"SELECT count(*)::int AS n FROM app.transactions",
				);
				return [result.rowCount, total.rows[0]?.n];
			});
			expect(counts).toEqual([0, 1]);
		});

		test("one statement inserts the missing dates and skips the charged one", async () => {
			const counts = await asUser(async (client) => {
				await setup(client);
				const result = await client.query(
					`INSERT INTO app.transactions
					   (id, user_id, created_at, updated_at, type, amount_minor, occurred_at,
					    occurred_on, category, payee, source, subscription_id, due_on, version)
					 SELECT gen_random_uuid(), $1, $2, $2, 'expense', 64900,
					        (d AT TIME ZONE 'Asia/Kolkata'), d::date, 'entertainment',
					        'Netflix', 'subscription', $3, d::date, 1
					 FROM generate_series('2026-09-05'::timestamp, '2026-12-05'::timestamp, interval '1 month') AS g(d)
					 ON CONFLICT DO NOTHING`,
					[user, GOLDEN_NOW, parent["id"]],
				);
				const total = await client.query<{ n: number }>(
					"SELECT count(*)::int AS n FROM app.transactions",
				);
				return [result.rowCount, total.rows[0]?.n];
			});
			// Sep, Nov and Dec are new; 5 October was already charged.
			expect(counts).toEqual([3, 4]);
		});
	});

	describe("deleting a Subscription (D-96, BR-F05-14)", () => {
		test("keeps its charges as ordinary expenses with the due date and without the link", async () => {
			const parent = subscription();
			const result = await asUser(async (client) => {
				await insert(client, "subscriptions", parent);
				await insert(client, "transactions", charge(parent));
				await insert(
					client,
					"transactions",
					charge(parent, {
						occurred_at: "2026-09-04T18:30:00Z",
						occurred_on: "2026-09-05",
						due_on: "2026-09-05",
						edited: true,
					}),
				);
				await client.query("DELETE FROM app.subscriptions WHERE id = $1", [
					parent["id"],
				]);
				return (
					await client.query(
						`SELECT user_id = $1 AS own, subscription_id, due_on::text, source, edited
						 FROM app.transactions ORDER BY due_on`,
						[user],
					)
				).rows;
			});
			expect(result).toEqual([
				{
					own: true,
					subscription_id: null,
					due_on: "2026-09-05",
					source: "subscription",
					edited: true,
				},
				{
					own: true,
					subscription_id: null,
					due_on: "2026-10-05",
					source: "subscription",
					edited: false,
				},
			]);
		});

		test("never nulls user_id: the column list limits SET NULL to subscription_id", async () => {
			const result = await owner.query<{ definition: string }>(
				`SELECT pg_get_constraintdef(oid) AS definition FROM pg_constraint
				 WHERE conname = 'transactions_subscription_fk'`,
			);
			expect(result.rows[0]?.definition).toContain(
				"ON DELETE SET NULL (subscription_id)",
			);
		});

		test("leaves the charges of other Subscriptions linked", async () => {
			const [first, second] = [subscription(), subscription()];
			const linked = await asUser(async (client) => {
				await insert(client, "subscriptions", first);
				await insert(client, "subscriptions", second);
				await insert(client, "transactions", charge(first));
				await insert(client, "transactions", charge(second));
				await client.query("DELETE FROM app.subscriptions WHERE id = $1", [
					first["id"],
				]);
				return (
					await client.query<{ subscription_id: string | null }>(
						"SELECT subscription_id FROM app.transactions ORDER BY subscription_id NULLS FIRST",
					)
				).rows.map((row) => row.subscription_id);
			});
			expect(linked).toEqual([null, second["id"]]);
		});

		test("the unlinked charges of a deleted Subscription can be charged again by a new one", async () => {
			const parent = subscription();
			const successor = subscription();
			expect(
				await refusalAfter(
					async (client) => {
						await insert(client, "subscriptions", parent);
						await insert(client, "transactions", charge(parent));
						await client.query(
							"DELETE FROM app.subscriptions WHERE id = $1",
							[parent["id"]],
						);
						await insert(client, "subscriptions", successor);
					},
					(client) => insert(client, "transactions", charge(successor)),
				),
			).toBeNull();
		});
	});

	test("a lookup by Subscription and date uses the unique index as the runtime role", async () => {
		// Under RLS an index serves a condition only when its operators are leakproof; plain
		// comparisons on uuid and date are (D-48). The scan is forced off the table so the
		// tiny test table doesn't hide a bad index.
		const plan = await asUser(async (client) => {
			await client.query("SET LOCAL enable_seqscan = off");
			const result = await client.query<{ "QUERY PLAN": string }>(
				`EXPLAIN SELECT id FROM app.transactions
				 WHERE subscription_id = $1 AND due_on > $2 AND NOT edited`,
				[randomUUID(), "2026-11-02"],
			);
			return result.rows.map((row) => row["QUERY PLAN"]).join("\n");
		});
		expect(plan).toContain("transactions_subscription_due_key");
		// Both conditions are index conditions, not filters on every row the index returns.
		expect(plan).toMatch(/Index Cond:[\s\S]*subscription_id[\s\S]*due_on/);
	});
});

describe("deleting the user", () => {
	test("removes Subscriptions, skips and linked charges without a foreign-key error", async () => {
		const doomed = await createUser(owner, "subscriptions-delete");
		await owner.query("BEGIN");
		try {
			const parent = subscription({}, doomed);
			await insert(owner, "subscriptions", parent);
			await insert(owner, "subscription_skips", skip(parent));
			await insert(owner, "transactions", charge(parent));
			await insert(
				owner,
				"transactions",
				charge(parent, {
					occurred_at: "2026-09-04T18:30:00Z",
					occurred_on: "2026-09-05",
					due_on: "2026-09-05",
					edited: true,
				}),
			);
			await owner.query(`DELETE FROM auth."user" WHERE id = $1`, [doomed]);
			for (const table of [
				"subscriptions",
				"subscription_skips",
				"transactions",
			]) {
				const left = await owner.query<{ count: string }>(
					`SELECT count(*) FROM app.${table} WHERE user_id = $1`,
					[doomed],
				);
				expect(Number(left.rows[0]?.count)).toBe(0);
			}
		} finally {
			await owner.query("ROLLBACK");
			await owner.query(`DELETE FROM auth."user" WHERE id = $1`, [doomed]);
		}
	});
});

describe("the migration that added them (0008)", () => {
	test("gave both tables row-level security, forced, with the two policies", async () => {
		const result = await owner.query<{
			relname: string;
			relrowsecurity: boolean;
			relforcerowsecurity: boolean;
		}>(
			`SELECT relname, relrowsecurity, relforcerowsecurity FROM pg_class
			 WHERE relnamespace = 'app'::regnamespace
			   AND relname IN ('subscriptions', 'subscription_skips') ORDER BY relname`,
		);
		expect(result.rows).toEqual([
			{
				relname: "subscription_skips",
				relrowsecurity: true,
				relforcerowsecurity: true,
			},
			{
				relname: "subscriptions",
				relrowsecurity: true,
				relforcerowsecurity: true,
			},
		]);
		const policies = await owner.query<{
			tablename: string;
			policyname: string;
		}>(
			`SELECT tablename, policyname FROM pg_policies
			 WHERE schemaname = 'app' AND tablename IN ('subscriptions', 'subscription_skips')
			 ORDER BY tablename, policyname`,
		);
		expect(policies.rows).toEqual([
			{ tablename: "subscription_skips", policyname: "owner_isolation" },
			{ tablename: "subscription_skips", policyname: "system_access" },
			{ tablename: "subscriptions", policyname: "owner_isolation" },
			{ tablename: "subscriptions", policyname: "system_access" },
		]);
	});

	test("every Subscription constraint the tables rely on exists", async () => {
		const result = await owner.query<{ conname: string }>(
			`SELECT conname FROM pg_constraint
			 WHERE contype <> 'n' AND conrelid IN ('app.subscriptions'::regclass, 'app.subscription_skips'::regclass,
			                    'app.transactions'::regclass)
			   AND (conname LIKE 'subscription%' OR conname LIKE 'transactions_subscription%'
			        OR conname IN ('transactions_charge_link', 'transactions_due_on_is_occurred_on'))
			 ORDER BY conname`,
		);
		expect(result.rows.map((row) => row.conname)).toEqual([
			"subscription_skips_pkey",
			"subscription_skips_subscription_fk",
			"subscription_skips_user_id_subscription_id_due_on_key",
			"subscription_skips_user_id_user_id_fk",
			"subscriptions_amount_range",
			"subscriptions_cadence_values",
			"subscriptions_category_kind_fk",
			"subscriptions_charges_from_not_before_start",
			"subscriptions_end_after_start",
			"subscriptions_name_text",
			"subscriptions_note_text",
			"subscriptions_pause_pair",
			"subscriptions_pkey",
			"subscriptions_user_id_id_key",
			"subscriptions_user_id_user_id_fk",
			"subscriptions_version_positive",
			"transactions_charge_link",
			"transactions_due_on_is_occurred_on",
			"transactions_subscription_fk",
		]);
	});
});
