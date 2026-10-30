import { sql } from "drizzle-orm";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

import { GOLDEN_NOW } from "../../../../../seed/golden";
import { loadGolden } from "../../../../../seed/load-golden";
import { ApiError, databaseErrorOf } from "../../../api/errors";
import { runtimePool } from "../../../db/pools";
import { createUser } from "../../../db/tests/private-rows";
import { parseOwnerEnv } from "../../../env";
import {
	afterFirstStatement,
	asUser,
	goldenContext,
	uuidV7At,
} from "../../transactions/tests/helpers";
import type { Tx } from "../../with-user";
import { createView } from "../create";
import { withUniqueName } from "../row";
import { addViews, viewBody } from "./helpers";

/** `createView` (F03 section 11, BR-F03-63, BR-F03-64; D-488) through the runtime role and RLS.
 * Every case rolls back. The limit and name races, which need two connections, are tested
 * through the endpoint. */

let owner: Client;
let userId: string;
let other: string;

beforeAll(async () => {
	owner = new Client({
		connectionString: parseOwnerEnv(process.env).DATABASE_URL_OWNER,
	});
	await owner.connect();
	userId = (await loadGolden(owner, await createUser(owner, "views"))).userId;
	other = (await loadGolden(owner, await createUser(owner, "views-other"))).userId;
});

afterAll(async () => {
	await owner?.query(`DELETE FROM auth."user" WHERE id = ANY($1)`, [
		[userId, other].filter(Boolean),
	]);
	await owner?.end();
	await runtimePool().end();
});

/** Runs `before`, then creates a view from `input`, as the golden user at the golden clock. */
function create(
	input: unknown,
	before: (tx: Tx) => Promise<unknown> = async () => {},
) {
	const ctx = goldenContext(userId);
	return asUser(userId, async (tx) => {
		await before(tx);
		return createView(tx, ctx, input);
	});
}

/** Resolves once a connection waits for the advisory lock on `key`, so a test can release it
 * knowing the create has reached it. */
async function waitForLockWaiter(key: string): Promise<void> {
	for (let attempt = 0; attempt < 100; attempt++) {
		const { rows } = await owner.query<{ waiting: boolean }>(
			`SELECT EXISTS (
			   SELECT 1 FROM pg_locks,
			     LATERAL (SELECT hashtextextended($1, 0) AS lock_key) AS k
			   WHERE locktype = 'advisory' AND NOT granted AND objsubid = 1
			     AND classid = ((lock_key >> 32) & 4294967295)::oid
			     AND objid = (lock_key & 4294967295)::oid) AS waiting`,
			[key],
		);
		if (rows[0]?.waiting) return;
		await new Promise((resolve) => setTimeout(resolve, 100));
	}
	throw new Error("No create waited for the limit lock.");
}

/** The ApiError a create throws, as code, fields and details. */
async function refusal(promise: Promise<unknown>) {
	try {
		await promise;
	} catch (error) {
		if (!(error instanceof ApiError)) throw error;
		return { code: error.code, fields: error.fields, details: error.details };
	}
	throw new Error("The create was not refused.");
}

const invalid = (fields: Record<string, string>) => ({
	code: "validation_failed",
	fields,
	details: {},
});

const TAKEN = "You already have a view with this name.";

describe("a create", () => {
	test("stores the view at version 1, recorded at the request clock, and answers it", async () => {
		const input = viewBody();
		const { result, statements } = await create(input);
		expect(result).toEqual({
			created: true,
			view: {
				id: input["id"],
				name: "Food last month",
				filter: { range: "last_month", cat: ["food"] },
				sort: "date",
				dir: "desc",
				group: "day",
				version: 1,
				createdAt: GOLDEN_NOW,
				updatedAt: GOLDEN_NOW,
				currency: "INR",
			},
		});
		// The id lookup, the limit lock, the count, the insert.
		expect(statements).toBe(4);
	});

	// D-493: with a sent currency the profile is locked, and the answer carries what it read.
	test("a sent currency answers the currency it locked, even when the request read another", async () => {
		const ctx = goldenContext(userId, { currency: "USD" });
		const { result } = await asUser(userId, (tx) =>
			createView(tx, ctx, viewBody({ currency: "INR" })),
		);
		expect(result.view.currency).toBe("INR");
	});

	// B5, BR-P2-20: a create's id carries its time, at most 5 minutes past the request clock.
	test("an id whose time is past the request clock plus 5 minutes gets 422 on id", async () => {
		const ahead = (minutes: number) =>
			uuidV7At(new Date(Date.parse(GOLDEN_NOW) + minutes * 60_000));
		expect(await refusal(create(viewBody({ id: ahead(6) })))).toEqual(
			invalid({
				id: "This item's time is in the future. Check your device's clock.",
			}),
		);
		expect(
			await refusal(
				create(viewBody({ id: "ffffffff-ffff-7fff-bfff-ffffffffffff" })),
			),
		).toMatchObject({
			code: "validation_failed",
			fields: {
				id: "This item's time is in the future. Check your device's clock.",
			},
		});
		expect((await create(viewBody({ id: ahead(5) }))).result.created).toBe(true);
	});

	test("a future id is checked after the currency, before the limit", async () => {
		const ahead = uuidV7At(new Date(Date.parse(GOLDEN_NOW) + 10 * 60_000));
		expect(
			(await refusal(create(viewBody({ id: ahead, currency: "USD" })))).code,
		).toBe("currency_mismatch");
		expect(
			(
				await refusal(
					create(viewBody({ id: ahead }), (tx) =>
						addViews(tx, userId, 20),
					),
				)
			).code,
		).toBe("validation_failed");
	});

	// AC-F03-48: lists are stored sorted and deduplicated.
	test("stores the filter normalized, and checks a sent currency under the profile lock", async () => {
		const { result, statements } = await create(
			viewBody({
				filter: {
					cat: ["shopping", "food", "food"],
					minMinor: 50000,
					type: [],
				},
				sort: "amount",
				group: "category",
				currency: "INR",
			}),
		);
		expect(result.view).toMatchObject({
			filter: { cat: ["food", "shopping"], minMinor: 50000 },
			sort: "amount",
			group: "category",
		});
		expect(result.view.filter).not.toHaveProperty("type");
		// The lookup, the profile lock, the limit lock, the count, the insert.
		expect(statements).toBe(5);
	});

	// AC-F03-47
	test('stores " Food " as "Food"', async () => {
		const { result } = await create(viewBody({ name: " Food " }));
		expect(result.view.name).toBe("Food");
	});

	test("lowercases the id", async () => {
		const input = viewBody();
		const { result } = await create({
			...input,
			id: String(input["id"]).toUpperCase(),
		});
		expect(result.view.id).toBe(input["id"]);
	});
});

// AC-F03-45, API-5, BR-F03-63's create order.
describe("an id the user already has", () => {
	test("answers that view, unchanged, whatever the body now says", async () => {
		const input = viewBody();
		const { result, statements } = await create(
			{ id: input["id"], name: "", filter: { month: 10 } },
			(tx) => createView(tx, goldenContext(userId), input),
		);
		expect(result).toMatchObject({
			created: false,
			view: { id: input["id"], name: "Food last month", version: 1 },
		});
		// The first create's four; then the lookup alone.
		expect(statements).toBe(5);
	});

	test("answers that view at 20 views, with a name another view now has", async () => {
		const id = uuidV7At(GOLDEN_NOW);
		const { result } = await create(
			viewBody({ id, name: "View 3" }),
			async (tx) => {
				await addViews(tx, userId, 19);
				// The 20th view: this id, first created as "Mine".
				await createView(
					tx,
					goldenContext(userId),
					viewBody({ id, name: "Mine" }),
				);
			},
		);
		expect(result).toMatchObject({ created: false, view: { id, name: "Mine" } });
	});

	test("an id committed by another request after the lookup answers that view", async () => {
		const input = viewBody({ name: "Mine" });
		const ctx = goldenContext(userId);
		const { result, statements } = await asUser(userId, (tx) =>
			createView(
				afterFirstStatement(tx, () =>
					owner.query(
						`INSERT INTO app.transaction_views (id, user_id, created_at, updated_at, name,
						   filter, sort, dir, group_by, version)
						 VALUES ($1, $2, $3, $3, 'Theirs first', '{}', 'date', 'desc', 'day', 1)`,
						[input["id"], userId, GOLDEN_NOW],
					),
				),
				ctx,
				input,
			),
		);
		expect(result).toMatchObject({
			created: false,
			view: { id: input["id"], name: "Theirs first" },
		});
		// The lookup, the limit lock, the count, the insert that did nothing, the re-read.
		expect(statements).toBe(5);
		// The other request's view is committed; the limit tests count this user's views.
		await owner.query("DELETE FROM app.transaction_views WHERE id = $1", [
			input["id"],
		]);
	});

	// B7, AC-F03-46: a request holding the limit lock creates this id; the create waits on the
	// lock, then counts 20 with that view among them. It is this create, done: 200, not 422.
	test("at 19 views, the same id committed by the lock's holder answers that view", async () => {
		const input = viewBody({ name: "Mine" });
		const key = `${userId}:transactions.views`;
		const holder = new Client({
			connectionString: parseOwnerEnv(process.env).DATABASE_URL_OWNER,
		});
		await holder.connect();
		try {
			await holder.query("BEGIN");
			await holder.query(
				"SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
				[key],
			);
			await holder.query(
				`INSERT INTO app.transaction_views (id, user_id, created_at, updated_at, name,
				   filter, sort, dir, group_by, version)
				 VALUES ($1, $2, $3, $3, 'Theirs first', '{}', 'date', 'desc', 'day', 1)`,
				[input["id"], userId, GOLDEN_NOW],
			);
			const ctx = goldenContext(userId);
			const pending = asUser(userId, async (tx) => {
				await addViews(tx, userId, 19);
				return createView(tx, ctx, input);
			});
			await waitForLockWaiter(key);
			await holder.query("COMMIT");
			const { result, statements } = await pending;
			expect(result).toMatchObject({
				created: false,
				view: { id: input["id"], name: "Theirs first", currency: "INR" },
			});
			// The test's insert; the lookup, the lock, the count of 20 and the re-read.
			expect(statements).toBe(5);
		} finally {
			await holder.query("ROLLBACK").catch(() => {});
			await holder.end();
			await owner.query("DELETE FROM app.transaction_views WHERE id = $1", [
				input["id"],
			]);
		}
	});

	test("finds the view by an uppercase id too", async () => {
		const input = viewBody();
		const { result } = await create(
			{ ...input, id: String(input["id"]).toUpperCase() },
			(tx) => createView(tx, goldenContext(userId), input),
		);
		expect(result).toMatchObject({ created: false, view: { id: input["id"] } });
	});

	test("another user's id gets 409 id_conflict", async () => {
		const taken = uuidV7At(GOLDEN_NOW);
		await owner.query(
			`INSERT INTO app.transaction_views (id, user_id, created_at, updated_at, name, filter,
			   sort, dir, group_by, version)
			 VALUES ($1, $2, $3, $3, 'Theirs', '{}', 'date', 'desc', 'day', 1)`,
			[taken, other, GOLDEN_NOW],
		);
		expect(await refusal(create(viewBody({ id: taken })))).toMatchObject({
			code: "id_conflict",
		});
	});
});

describe("the limit (BR-F03-63, AC-F03-46)", () => {
	test("a 21st view gets 422 limit_reached", async () => {
		expect(
			await refusal(create(viewBody(), (tx) => addViews(tx, userId, 20))),
		).toEqual({ code: "limit_reached", fields: {}, details: {} });
	});

	test("a 20th view passes", async () => {
		const { result } = await create(viewBody(), (tx) =>
			addViews(tx, userId, 19),
		);
		expect(result.created).toBe(true);
	});

	test("counts only the user's own views", async () => {
		await owner.query(
			`INSERT INTO app.transaction_views (id, user_id, created_at, updated_at, name, filter,
			   sort, dir, group_by, version)
			 SELECT gen_random_uuid(), $1, $2, $2, 'Theirs ' || n, '{}', 'date', 'desc', 'day', 1
			 FROM generate_series(1, 20) AS n`,
			[other, GOLDEN_NOW],
		);
		const { result } = await create(viewBody(), (tx) =>
			addViews(tx, userId, 19),
		);
		expect(result.created).toBe(true);
	});
});

describe("names (BR-F03-63, AC-F03-47)", () => {
	test('"food" after "Food" gets 422 on name', async () => {
		expect(
			await refusal(
				create(viewBody({ name: "food" }), (tx) =>
					createView(
						tx,
						goldenContext(userId),
						viewBody({ name: "Food" }),
					),
				),
			),
		).toEqual(invalid({ name: TAKEN }));
	});

	test("another user's view of the same name is no conflict", async () => {
		await owner.query(
			`INSERT INTO app.transaction_views (id, user_id, created_at, updated_at, name, filter,
			   sort, dir, group_by, version)
			 VALUES (gen_random_uuid(), $1, $2, $2, 'Shared name', '{}', 'date', 'desc', 'day', 1)`,
			[other, GOLDEN_NOW],
		);
		const { result } = await create(viewBody({ name: "Shared name" }));
		expect(result.created).toBe(true);
	});

	test.each([
		["ALL TRANSACTIONS", TAKEN],
		["a".repeat(41), "Use 40 characters or fewer."],
		["", "Enter a name."],
		["   ", "Enter a name."],
		["Food\u0007", "Remove unsupported characters."],
	])("%j gets 422 on name", async (name, message) => {
		expect(await refusal(create(viewBody({ name })))).toEqual(
			invalid({ name: message }),
		);
	});

	test("any other database error passes through the name check unchanged", async () => {
		const { result } = await asUser(userId, (tx) =>
			withUniqueName(() => tx.execute(sql`SELECT 1 / 0`)).catch(
				(error: unknown) => error,
			),
		);
		expect(result).not.toBeInstanceOf(ApiError);
		expect(databaseErrorOf(result)?.code).toBe("22012");
	});

	test("a 40-character name passes", async () => {
		const { result } = await create(viewBody({ name: "a".repeat(40) }));
		expect(result.view.name).toHaveLength(40);
	});
});

// AC-F03-48, BR-F03-64: each refusal carries its field path.
describe("filters and the list fields", () => {
	test.each([
		[{ filter: { range: "custom" } }, "filter.range"],
		[
			{
				filter: {
					range: "last_month",
					from: "2026-10-01",
					to: "2026-10-31",
				},
			},
			"filter.range",
		],
		[{ filter: { cat: ["food", "pizza"] } }, "filter.cat.1"],
		[{ filter: { minMinor: 0 }, currency: "INR" }, "filter.minMinor"],
		[
			{ filter: { minMinor: 2000, maxMinor: 1000 }, currency: "INR" },
			"filter.minMinor",
		],
		// D-492: an unknown key is named itself.
		[{ filter: { month: "2026-10" } }, "filter.month"],
		[{ sort: "amount", group: "day" }, "group"],
		[{ filter: { minMinor: 1000 } }, "currency"],
	])("%j gets 422 on %s", async (change, path) => {
		const answer = await refusal(create(viewBody(change)));
		expect(answer.code).toBe("validation_failed");
		expect(Object.keys(answer.fields)).toEqual([path]);
	});

	// D-492
	test('an unknown key gets "Remove this field." at its own path', async () => {
		expect(
			await refusal(
				create(viewBody({ filter: { month: "2026-10" }, position: 2 })),
			),
		).toEqual(
			invalid({
				"filter.month": "Remove this field.",
				position: "Remove this field.",
			}),
		);
	});

	// AC-F03-48
	test("minMinor with currency USD for an INR profile gets currency_mismatch", async () => {
		expect(
			await refusal(
				create(viewBody({ filter: { minMinor: 1000 }, currency: "USD" })),
			),
		).toMatchObject({ code: "currency_mismatch" });
	});

	test("a currency sent without amounts is checked too", async () => {
		expect(await refusal(create(viewBody({ currency: "USD" })))).toMatchObject({
			code: "currency_mismatch",
		});
	});

	test("a body that is not an object gets 422", async () => {
		for (const input of [null, [], "view"]) {
			expect((await refusal(create(input))).code).toBe("validation_failed");
		}
	});
});

describe("the check order (BR-F03-63)", () => {
	test("the shape comes before the limit", async () => {
		expect(
			(
				await refusal(
					create(viewBody({ name: "" }), (tx) => addViews(tx, userId, 20)),
				)
			).code,
		).toBe("validation_failed");
	});

	test("the currency comes before the limit", async () => {
		expect(
			(
				await refusal(
					create(viewBody({ currency: "USD" }), (tx) =>
						addViews(tx, userId, 20),
					),
				)
			).code,
		).toBe("currency_mismatch");
	});

	test("the limit comes before the name", async () => {
		expect(
			(
				await refusal(
					create(viewBody({ name: "View 1" }), (tx) =>
						addViews(tx, userId, 20),
					),
				)
			).code,
		).toBe("limit_reached");
	});
});
