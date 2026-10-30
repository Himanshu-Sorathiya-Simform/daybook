import { sql } from "drizzle-orm";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

import { GOLDEN_NOW } from "../../../../../seed/golden";
import { loadGolden } from "../../../../../seed/load-golden";
import { ApiError } from "../../../api/errors";
import { runtimePool } from "../../../db/pools";
import { createUser } from "../../../db/tests/private-rows";
import { parseOwnerEnv } from "../../../env";
import { asUser, goldenContext, uuidV7At } from "../../transactions/tests/helpers";
import type { Tx } from "../../with-user";
import { editView } from "../edit";
import { getView } from "../row";
import { addView } from "./helpers";

/** `editView` (F03 section 11, BR-F03-63, BR-F03-64, BR-F03-68; D-489) through the runtime role
 * and RLS. Every case rolls back, an hour after the golden clock. */

let owner: Client;
let userId: string;
let other: string;

beforeAll(async () => {
	owner = new Client({
		connectionString: parseOwnerEnv(process.env).DATABASE_URL_OWNER,
	});
	await owner.connect();
	userId = (await loadGolden(owner, await createUser(owner, "edit-views"))).userId;
	other = (await loadGolden(owner, await createUser(owner, "edit-views-other")))
		.userId;
});

afterAll(async () => {
	await owner?.query(`DELETE FROM auth."user" WHERE id = ANY($1)`, [
		[userId, other].filter(Boolean),
	]);
	await owner?.end();
	await runtimePool().end();
});

// An hour after the golden clock, so updatedAt differs from createdAt.
const LATER = "2026-11-02T07:30:00.000Z";

/** Adds "Food" (and any `extra` views) as the golden user, then edits "Food" with `input` at
 * `If-Match` `version`. `target` picks another id to edit. */
function edit(
	input: unknown,
	{
		version = 1,
		extra = [],
		target,
	}: {
		version?: number;
		extra?: string[];
		target?: (tx: Tx, food: string) => Promise<string>;
	} = {},
) {
	const ctx = { ...goldenContext(userId), now: new Date(LATER) };
	return asUser(userId, async (tx) => {
		const food = await addView(tx, userId);
		for (const name of extra)
			await addView(tx, userId, { name, id: uuidV7At(GOLDEN_NOW) });
		const id = target ? await target(tx, food) : food;
		return { id, view: await editView(tx, ctx, id, version, input) };
	});
}

/** The ApiError an edit throws, as code, fields and details. */
async function refusal(promise: Promise<unknown>) {
	try {
		await promise;
	} catch (error) {
		if (!(error instanceof ApiError)) throw error;
		return { code: error.code, fields: error.fields, details: error.details };
	}
	throw new Error("The edit was not refused.");
}

const invalid = (fields: Record<string, string>) => ({
	code: "validation_failed",
	fields,
	details: {},
});

const TAKEN = "You already have a view with this name.";

describe("a rename (BR-F03-69, AC-F03-47)", () => {
	test('"Food" to "FOOD" passes, raising version and setting updatedAt to the clock', async () => {
		const { result, statements } = await edit({ name: "FOOD" });
		expect(result.view).toEqual({
			id: result.id,
			name: "FOOD",
			filter: { range: "last_month", cat: ["food"] },
			sort: "date",
			dir: "desc",
			group: "day",
			version: 2,
			createdAt: GOLDEN_NOW,
			updatedAt: LATER,
			currency: "INR",
		});
		// The test's insert; then the update alone: no read first and no profile lock (D-489).
		expect(statements).toBe(2);
	});

	test("stores the name trimmed", async () => {
		const { result } = await edit({ name: "  Groceries " });
		expect(result.view.name).toBe("Groceries");
	});

	test.each([
		["Rent", TAKEN],
		["rent", TAKEN],
		["All Transactions", TAKEN],
		["", "Enter a name."],
		["a".repeat(41), "Use 40 characters or fewer."],
	])("to %j gets 422 on name", async (name, message) => {
		expect(await refusal(edit({ name }, { extra: ["Rent"] }))).toEqual(
			invalid({ name: message }),
		);
	});
});

describe("an update of the filter and list (BR-F03-68, AC-F03-52)", () => {
	const FOUR = {
		filter: { cat: ["shopping", "food", "food"], type: ["expense"] },
		sort: "amount",
		dir: "asc",
		group: "category",
	};

	test("the four together pass, stored normalized, and the name stays", async () => {
		const { result } = await edit(FOUR);
		expect(result.view).toMatchObject({
			name: "Food",
			filter: { cat: ["food", "shopping"], type: ["expense"] },
			sort: "amount",
			dir: "asc",
			group: "category",
			version: 2,
		});
		// The stored filter is replaced, not merged: the old range is gone.
		expect(result.view.filter).not.toHaveProperty("range");
	});

	test("the name and the four together pass", async () => {
		const { result } = await edit({ ...FOUR, name: "Big spends" });
		expect(result.view).toMatchObject({ name: "Big spends", group: "category" });
	});

	test("the filter alone gets 422: the four travel together", async () => {
		expect(await refusal(edit({ filter: FOUR.filter }))).toEqual(
			invalid({
				_body: "Send the filter, sort, direction and group together.",
			}),
		);
	});

	test("an empty body gets 422", async () => {
		expect(await refusal(edit({}))).toEqual(
			invalid({ _body: "Send at least one change." }),
		);
	});

	test("a body that is not an object gets 422", async () => {
		expect((await refusal(edit(null))).code).toBe("validation_failed");
	});

	test("day grouping with the amount sort gets 422 on group", async () => {
		expect(
			await refusal(edit({ ...FOUR, sort: "amount", group: "day" })),
		).toEqual(invalid({ group: "Day grouping needs the date sort." }));
	});
});

describe("amounts and the currency (BR-F03-64)", () => {
	const withAmount = (currency: string) => ({
		filter: { minMinor: 50000 },
		sort: "date",
		dir: "desc",
		group: "day",
		currency,
	});

	test("an amount filter in the profile currency passes under the profile lock", async () => {
		const { result, statements } = await edit(withAmount("INR"));
		expect(result.view.filter).toEqual({ minMinor: 50000 });
		// The test's insert; then the profile lock and the update.
		expect(statements).toBe(3);
	});

	test("an amount filter in USD for an INR profile gets currency_mismatch", async () => {
		expect(await refusal(edit(withAmount("USD")))).toMatchObject({
			code: "currency_mismatch",
		});
	});

	test("an amount filter without the currency gets 422 on currency", async () => {
		const body = {
			filter: { minMinor: 50000 },
			sort: "date",
			dir: "desc",
			group: "day",
		};
		expect(await refusal(edit(body))).toEqual(
			invalid({ currency: "Send the currency with the amount." }),
		);
	});

	// D-493: with a sent currency the profile is locked, and the answer carries what it read.
	test("a sent currency answers the currency it locked, even when the request read another", async () => {
		const ctx = goldenContext(userId, { currency: "USD" });
		const { result } = await asUser(userId, async (tx) => {
			const id = await addView(tx, userId);
			return {
				answer: await editView(tx, ctx, id, 1, {
					name: "Mine",
					currency: "INR",
				}),
				conflict: await refusal(
					editView(tx, ctx, id, 1, { name: "Again", currency: "INR" }),
				),
			};
		});
		expect(result.answer.currency).toBe("INR");
		expect(result.conflict).toMatchObject({
			code: "version_conflict",
			details: { current: { name: "Mine", currency: "INR" } },
		});
	});

	test("a rename with a currency in another currency is refused too", async () => {
		expect(await refusal(edit({ name: "Food", currency: "USD" }))).toMatchObject(
			{ code: "currency_mismatch" },
		);
	});
});

describe("versions and missing views (BR-P2-21, BR-F03-69)", () => {
	test("a stale version gets 409 with the stored view and currency", async () => {
		const ctx = goldenContext(userId);
		const { result, statements } = await asUser(userId, async (tx) => {
			const id = await addView(tx, userId);
			const answer = await refusal(editView(tx, ctx, id, 2, { name: "Mine" }));
			return { answer, current: await getView(tx, id) };
		});
		expect(result.answer).toEqual({
			code: "version_conflict",
			fields: {},
			details: { current: { ...result.current, currency: "INR" } },
		});
		expect(result.current).toMatchObject({ name: "Food", version: 1 });
		// The insert; the update that matched nothing and the re-read; the test's read.
		expect(statements).toBe(4);
	});

	test("a deleted view gets 404", async () => {
		expect(
			await refusal(
				edit(
					{ name: "Mine" },
					{
						target: async (tx, food) => {
							await tx.execute(
								sql`DELETE FROM app.transaction_views WHERE id = ${food}`,
							);
							return food;
						},
					},
				),
			),
		).toMatchObject({ code: "not_found" });
	});

	// AC-F03-53
	test("another user's view and an unknown id get 404, and the other user's view stays", async () => {
		const theirs = uuidV7At(GOLDEN_NOW);
		await owner.query(
			`INSERT INTO app.transaction_views (id, user_id, created_at, updated_at, name, filter,
			   sort, dir, group_by, version)
			 VALUES ($1, $2, $3, $3, 'Theirs', '{}', 'date', 'desc', 'day', 1)`,
			[theirs, other, GOLDEN_NOW],
		);
		for (const id of [theirs, uuidV7At(GOLDEN_NOW)]) {
			expect(
				await refusal(edit({ name: "Mine" }, { target: async () => id })),
			).toMatchObject({ code: "not_found" });
		}
		const { rows } = await owner.query(
			"SELECT name, version FROM app.transaction_views WHERE id = $1",
			[theirs],
		);
		expect(rows).toEqual([{ name: "Theirs", version: 1 }]);
	});

	test("an id that is not a UUID gets 404 before any statement", async () => {
		const ctx = goldenContext(userId);
		const { result, statements } = await asUser(userId, (tx) =>
			refusal(editView(tx, ctx, "food", 1, { name: "Mine" })),
		);
		expect(result).toMatchObject({ code: "not_found" });
		expect(statements).toBe(0);
	});
});

// T2
describe("edits at the edges (BR-F03-68, BR-F03-69)", () => {
	const CHANGE = {
		filter: { cat: ["shopping"] },
		sort: "amount",
		dir: "asc",
		group: "category",
	};

	test("a taken name sent with the four fields changes none of them", async () => {
		const ctx = { ...goldenContext(userId), now: new Date(LATER) };
		const { result } = await asUser(userId, async (tx) => {
			const food = await addView(tx, userId);
			await addView(tx, userId, { name: "Rent", id: uuidV7At(GOLDEN_NOW) });
			const before = await getView(tx, food);
			// The refused update is one statement; a savepoint lets the test read on afterwards.
			await tx.execute(sql`SAVEPOINT before_edit`);
			const answer = await refusal(
				editView(tx, ctx, food, 1, { ...CHANGE, name: "rent" }),
			);
			await tx.execute(sql`ROLLBACK TO SAVEPOINT before_edit`);
			return { answer, before, after: await getView(tx, food) };
		});
		expect(result.answer).toEqual(invalid({ name: TAKEN }));
		expect(result.after).toEqual(result.before);
		expect(result.after).toMatchObject({
			name: "Food",
			version: 1,
			sort: "date",
			group: "day",
		});
	});

	test.each(["Food", " Food ", "food", "FOOD"])(
		"a view renamed to %j, its own name, passes: it is not taken by itself",
		async (name) => {
			const { result } = await edit({ name });
			expect(result.view).toMatchObject({ name: name.trim(), version: 2 });
		},
	);

	test("a name that collides only after NFC with another view is refused", async () => {
		const answer = await refusal(
			edit({ name: "e\u0301cole" }, { extra: ["école"] }),
		);
		expect(answer).toEqual(invalid({ name: TAKEN }));
	});

	// Zod stops the cross-field checks of a body once a field's own transform has refused, so a
	// bad name is reported alone and the day-with-amount error follows once the name is fixed.
	test("a bad name hides the day-grouping error until the name is fixed", async () => {
		const body = {
			name: "",
			filter: { minMinor: 100 },
			sort: "amount",
			dir: "desc",
			group: "day",
			currency: "INR",
		};
		expect(await refusal(edit(body))).toEqual(
			invalid({ name: "Enter a name." }),
		);
		expect(await refusal(edit({ ...body, name: "Big spends" }))).toEqual(
			invalid({ group: "Day grouping needs the date sort." }),
		);
	});

	test("a bad name and an unknown field are both reported", async () => {
		expect(await refusal(edit({ name: "a".repeat(41), position: 1 }))).toEqual(
			invalid({
				name: "Use 40 characters or fewer.",
				position: "Remove this field.",
			}),
		);
	});

	test('the id "all", the built-in view, gets 404 before any statement', async () => {
		const ctx = goldenContext(userId);
		const { result, statements } = await asUser(userId, (tx) =>
			refusal(editView(tx, ctx, "all", 1, { name: "Mine" })),
		);
		expect(result).toMatchObject({ code: "not_found" });
		expect(statements).toBe(0);
	});

	test("a name of the built-in view is refused as taken, in any case", async () => {
		for (const name of [
			"All Transactions",
			"ALL TRANSACTIONS",
			"all transactions",
		]) {
			expect(await refusal(edit({ name }))).toEqual(invalid({ name: TAKEN }));
		}
	});

	test("an edit that sends the same four fields it has still raises the version", async () => {
		const { result } = await edit({
			filter: { range: "last_month", cat: ["food"] },
			sort: "date",
			dir: "desc",
			group: "day",
		});
		expect(result.view).toMatchObject({ version: 2, updatedAt: LATER });
	});
});
