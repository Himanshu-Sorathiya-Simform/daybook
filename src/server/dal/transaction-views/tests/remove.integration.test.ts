import { Client } from "pg";
import { afterAll, beforeAll, expect, test } from "vitest";

import { GOLDEN_NOW } from "../../../../../seed/golden";
import { loadGolden } from "../../../../../seed/load-golden";
import { ApiError } from "../../../api/errors";
import { runtimePool } from "../../../db/pools";
import { createUser } from "../../../db/tests/private-rows";
import { parseOwnerEnv } from "../../../env";
import { asUser, goldenContext, uuidV7At } from "../../transactions/tests/helpers";
import { deleteView } from "../remove";
import { getView } from "../row";
import { addView } from "./helpers";

/** `deleteView` (F03 section 11, BR-F03-69; D-489) through the runtime role and RLS. Every case
 * rolls back. */

let owner: Client;
let userId: string;
let other: string;

beforeAll(async () => {
	owner = new Client({
		connectionString: parseOwnerEnv(process.env).DATABASE_URL_OWNER,
	});
	await owner.connect();
	userId = (await loadGolden(owner, await createUser(owner, "delete-views")))
		.userId;
	other = (await loadGolden(owner, await createUser(owner, "delete-views-other")))
		.userId;
});

afterAll(async () => {
	await owner?.query(`DELETE FROM auth."user" WHERE id = ANY($1)`, [
		[userId, other].filter(Boolean),
	]);
	await owner?.end();
	await runtimePool().end();
});

/** The ApiError a delete throws, as code, fields and details. */
async function refusal(promise: Promise<unknown>) {
	try {
		await promise;
	} catch (error) {
		if (!(error instanceof ApiError)) throw error;
		return { code: error.code, fields: error.fields, details: error.details };
	}
	throw new Error("The delete was not refused.");
}

test("removes the view without locking the profile", async () => {
	const ctx = goldenContext(userId);
	const { result, statements } = await asUser(userId, async (tx) => {
		const id = await addView(tx, userId);
		await deleteView(tx, ctx, id, 1);
		return getView(tx, id);
	});
	expect(result).toBeNull();
	// The insert; the delete alone; the test's read.
	expect(statements).toBe(3);
});

test("a stale version gets 409 with the view and currency, and deletes nothing", async () => {
	const ctx = goldenContext(userId);
	const { result } = await asUser(userId, async (tx) => {
		const id = await addView(tx, userId);
		const answer = await refusal(deleteView(tx, ctx, id, 2));
		return { answer, current: await getView(tx, id) };
	});
	expect(result.current).toMatchObject({ name: "Food", version: 1 });
	expect(result.answer).toEqual({
		code: "version_conflict",
		fields: {},
		details: { current: { ...result.current, currency: "INR" } },
	});
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
	const ctx = goldenContext(userId);
	for (const id of [theirs, uuidV7At(GOLDEN_NOW)]) {
		const { result } = await asUser(userId, (tx) =>
			refusal(deleteView(tx, ctx, id, 1)),
		);
		expect(result).toMatchObject({ code: "not_found" });
	}
	const { rows } = await owner.query(
		"SELECT count(*)::int AS n FROM app.transaction_views WHERE id = $1",
		[theirs],
	);
	expect(rows[0]).toEqual({ n: 1 });
});

test("an id that is not a UUID gets 404 before any statement", async () => {
	const ctx = goldenContext(userId);
	const { result, statements } = await asUser(userId, (tx) =>
		refusal(deleteView(tx, ctx, "food", 1)),
	);
	expect(result).toMatchObject({ code: "not_found" });
	expect(statements).toBe(0);
});
