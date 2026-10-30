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
import { addView, addViews, viewBody } from "./helpers";

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
		// B3, Q3, D-498
		["Food\ud800", "Remove unsupported characters."],
		["Food\u2028view", "Remove unsupported characters."],
		["\u200b\u200b", "Enter a name."],
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

	// B3, D-498: a lone surrogate in the search reached `jsonb`, which Postgres refuses with
	// 22P02, so the create answered 500 instead of naming the field.
	test.each(["cafe\ud800 bar", "cafe\udc00 bar"])(
		"a lone surrogate in q, %j, gets 422 on filter.q",
		async (q) => {
			expect(await refusal(create(viewBody({ filter: { q } })))).toEqual(
				invalid({ "filter.q": "Remove unsupported characters." }),
			);
		},
	);

	// Q3, D-498: a search of zero-width spaces is blank, so it is stored as absent.
	test("a search of zero-width spaces is stored as no search", async () => {
		const { result } = await create(viewBody({ filter: { q: "\u200b\u200b" } }));
		expect(result.view.filter).toEqual({});
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

// T2: names, filters and currencies at their edges (BR-F03-63, BR-F03-64, D-497).
describe("names that collide the way Postgres compares them", () => {
	// The unique index is on lower(name) under the built-in C.UTF-8, which maps one code point to
	// one, and a name is stored in NFC. Each pair is two spellings of one name.
	test.each([
		["école", "ÉCOLE", "a capital with an accent"],
		["école", "e\u0301cole", "a decomposed accent, which NFC composes"],
		["ÉCOLE", "école", "the other way round"],
		[
			"οδοσ",
			"ΟΔΟΣ",
			"a capital sigma, which Postgres lowers to σ at the end too",
		],
		["İstanbul", "istanbul", "the dotted capital I"],
		["ß", "\u1e9e", "the capital sharp s"],
		["Food", "  FOOD  ", "spaces round a different case"],
	])("%j and %j are one name: %s", async (existing, name) => {
		expect(
			await refusal(
				create(viewBody({ name }), (tx) =>
					addView(tx, userId, { name: existing }),
				),
			),
		).toEqual(invalid({ name: TAKEN }));
	});

	test.each([
		["οδοσ", "οδος", "the final sigma ς is another letter"],
		["Food", "Foods", "a longer name"],
		["Food", "F00d", "a zero for an o"],
		["ae", "\u00e6", "æ is not ae"],
	])("%j and %j are two names: %s", async (existing, name) => {
		const { result } = await create(viewBody({ name }), (tx) =>
			addView(tx, userId, { name: existing }),
		);
		expect(result.created).toBe(true);
	});
});

describe("names, edge cases", () => {
	test("40 astral characters pass and 41 are refused, counting code points", async () => {
		const { result } = await create(viewBody({ name: "\u{1f44d}".repeat(40) }));
		expect([...result.view.name]).toHaveLength(40);
		expect(
			await refusal(create(viewBody({ name: "\u{1f44d}".repeat(41) }))),
		).toEqual(invalid({ name: "Use 40 characters or fewer." }));
	});

	test.each([
		[" All Transactions ", "spaces round the built-in name"],
		["ALL TRANSACTIONS", "capitals"],
		["all transactions", "lowercase"],
		["ALL TRANSACTİONS", "a dotted capital I, which Postgres lowers to i"],
	])("%j is refused as the built-in name: %s", async (name) => {
		expect(await refusal(create(viewBody({ name })))).toEqual(
			invalid({ name: TAKEN }),
		);
	});

	test.each([
		["All  Transactions", "two spaces inside"],
		["All Transaction", "no s"],
		["All Transactions 2", "a number after it"],
		["All-Transactions", "a hyphen"],
	])("%j is a different name from the built-in one: %s", async (name) => {
		expect((await create(viewBody({ name }))).result.created).toBe(true);
	});

	test.each([
		["Food\nview", "a line feed"],
		["Food\r\nview", "a carriage return and line feed"],
		["Food\u2028view", "a line separator"],
		["Food\tview", "a tab"],
		["Food\ud800view", "a lone surrogate"],
	])("%j is refused: %s", async (name) => {
		expect(await refusal(create(viewBody({ name })))).toEqual(
			invalid({ name: "Remove unsupported characters." }),
		);
	});

	test("a name of zero-width spaces is empty", async () => {
		expect(await refusal(create(viewBody({ name: "\u200b\u200b" })))).toEqual(
			invalid({ name: "Enter a name." }),
		);
	});
});

describe("filters, edge cases (BR-F03-64)", () => {
	const stored = async (
		filter: Record<string, unknown>,
		extra: Record<string, unknown> = {},
	) => (await create(viewBody({ filter, ...extra }))).result.view.filter;

	test("minMinor equal to maxMinor is one amount and is kept", async () => {
		expect(
			await stored({ minMinor: 5000, maxMinor: 5000 }, { currency: "INR" }),
		).toEqual({
			minMinor: 5000,
			maxMinor: 5000,
		});
	});

	test("one past the largest amount is refused with the largest, and the largest passes", async () => {
		expect(
			await stored({ maxMinor: 99_999_999_999 }, { currency: "INR" }),
		).toEqual({ maxMinor: 99_999_999_999 });
		expect(
			await refusal(
				create(
					viewBody({
						filter: { maxMinor: 100_000_000_000 },
						currency: "INR",
					}),
				),
			),
		).toEqual(
			invalid({ "filter.maxMinor": "The largest amount is 999,999,999.99." }),
		);
		expect(
			await refusal(
				create(
					viewBody({
						filter: { minMinor: 100_000_000_000 },
						currency: "INR",
					}),
				),
			),
		).toEqual(
			invalid({ "filter.minMinor": "The largest amount is 999,999,999.99." }),
		);
	});

	test.each([
		[{ from: "2026-10-01" }, "only a first date"],
		[{ to: "2026-10-31" }, "only a last date"],
	] as [Record<string, string>, string][])("%j is refused: %s", async (filter) => {
		expect(await refusal(create(viewBody({ filter })))).toEqual(
			invalid({
				"filter.from": "Send both dates, the first on or before the second.",
			}),
		);
	});

	test("one day, the same date twice, is a range of one day", async () => {
		expect(await stored({ from: "2026-10-01", to: "2026-10-01" })).toEqual({
			from: "2026-10-01",
			to: "2026-10-01",
		});
	});

	test.each([
		["", {}, "an empty search is no search"],
		["   ", {}, "a blank search is none"],
		["649", { q: "649" }, "a number of 3 digits"],
		["12", { q: "12" }, "a number of 2 digits is an amount, so it is kept"],
		["1,00,000", { q: "1,00,000" }, "an Indian amount"],
		["swiggy", { q: "swiggy" }, "text"],
		["a".repeat(100), { q: "a".repeat(100) }, "100 characters"],
		["\u{1f44d}".repeat(100), { q: "\u{1f44d}".repeat(100) }, "100 emoji"],
		// D-501: not an amount, but five characters of text, which a search takes.
		["0,001", { q: "0,001" }, "a thousandth written the German way is text"],
		[
			"1,0",
			{ q: "1,0" },
			"a broken amount of 3 characters is long enough as text",
		],
	] as [string, Record<string, unknown>, string][])(
		"a search of %j is stored as %j: %s",
		async (q, expected) => {
			expect(await stored({ q })).toEqual(expected);
		},
	);

	test.each([
		["ab", "Type at least 3 characters, or an amount.", "two letters"],
		["a".repeat(101), "Use 100 characters or fewer.", "101 characters"],
		["\u{1f44d}".repeat(101), "Use 100 characters or fewer.", "101 emoji"],
	])("a search of %j is refused: %s", async (q, message) => {
		expect(await refusal(create(viewBody({ filter: { q } })))).toEqual(
			invalid({ "filter.q": message }),
		);
	});

	test("lists are sorted and deduplicated, and an empty one is dropped", async () => {
		expect(
			await stored({ type: ["income", "expense", "income"], cat: [] }),
		).toEqual({
			type: ["expense", "income"],
		});
		expect(
			await stored({ type: [], cat: ["shopping", "food", "shopping"] }),
		).toEqual({
			cat: ["food", "shopping"],
		});
	});

	test("a Goal of any case, or a version 4 UUID, is kept in lowercase", async () => {
		const goal = "F47AC10B-58CC-4372-A567-0E02B2C3D479";
		expect(await stored({ goal })).toEqual({ goal: goal.toLowerCase() });
		expect(await stored({ sub: goal })).toEqual({ sub: goal.toLowerCase() });
	});

	test.each([
		[{ goal: "not-a-uuid" }, "filter.goal", "Use a UUID."],
		[
			{ sub: "F47AC10B-58CC-4372-A567-0E02B2C3D47" },
			"filter.sub",
			"Use a UUID.",
		],
		[{ src: "demo" }, "filter.src", "Choose a source."],
		[{ src: "" }, "filter.src", "Choose a source."],
		[{ cat: null }, "filter.cat", "Choose a category."],
		[{ type: null }, "filter.type", "Choose a type."],
		[{ cat: "food" }, "filter.cat", "Choose a category."],
	])("%j is refused at %s", async (filter, path, message) => {
		expect(await refusal(create(viewBody({ filter })))).toEqual(
			invalid({ [path]: message }),
		);
	});

	test("src manual and subscription are kept", async () => {
		expect(await stored({ src: "manual" })).toEqual({ src: "manual" });
		expect(await stored({ src: "subscription" })).toEqual({
			src: "subscription",
		});
	});
});

describe("a profile in yen or Kuwaiti dinars (MON-2, MON-5)", () => {
	/** A create in a profile of `currency`, which is set on the profile for this transaction. */
	function createIn(currency: "JPY" | "KWD", input: unknown) {
		const ctx = goldenContext(userId, { currency });
		return asUser(userId, async (tx) => {
			await tx.execute(sql`UPDATE app.profile SET currency = ${currency}`);
			return createView(tx, ctx, input);
		});
	}

	test.each([
		["JPY", 999_999_999, "The largest amount is 999,999,999."],
		["KWD", 999_999_999_999, "The largest amount is 999,999,999.999."],
	] as const)(
		"%s: the largest amount, %i, passes and one more is refused",
		async (currency, max, message) => {
			const { result } = await createIn(
				currency,
				viewBody({ filter: { maxMinor: max }, currency }),
			);
			expect(result.view.filter).toEqual({ maxMinor: max });
			expect(
				await refusal(
					createIn(
						currency,
						viewBody({ filter: { maxMinor: max + 1 }, currency }),
					),
				),
			).toEqual(invalid({ "filter.maxMinor": message }));
		},
	);

	test.each(["JPY", "KWD"] as const)(
		"%s: a short numeric search is kept, since it can be an amount",
		async (currency) => {
			const { result } = await createIn(
				currency,
				viewBody({ filter: { q: "12" } }),
			);
			expect(result.view.filter).toEqual({ q: "12" });
		},
	);

	test("a currency of another kind than the profile's is refused, whichever it is", async () => {
		expect(
			await refusal(
				createIn(
					"JPY",
					viewBody({ filter: { minMinor: 100 }, currency: "INR" }),
				),
			),
		).toMatchObject({ code: "currency_mismatch" });
		expect(
			await refusal(
				createIn(
					"KWD",
					viewBody({ filter: { minMinor: 100 }, currency: "JPY" }),
				),
			),
		).toMatchObject({ code: "currency_mismatch" });
	});
});
