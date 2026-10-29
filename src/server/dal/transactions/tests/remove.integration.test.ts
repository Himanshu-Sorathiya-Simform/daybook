import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

import { GOLDEN_NOW } from "../../../../../seed/golden";
import { loadGolden, type LoadedGolden } from "../../../../../seed/load-golden";
import { ApiError } from "../../../api/errors";
import { runtimePool } from "../../../db/pools";
import { createUser } from "../../../db/tests/private-rows";
import { parseOwnerEnv } from "../../../env";
import { getTransaction } from "../get";
import { deleteTransaction } from "../remove";
import {
	addExpense,
	afterFirstStatement,
	asUser,
	goldenContext,
	uuidV7At,
} from "./helpers";

/** `deleteTransaction` (F03 section 11, BR-F03-05, BR-F03-18; D-487) through the runtime role
 * and RLS. Every case rolls back unless it says otherwise. */

let owner: Client;
let golden: LoadedGolden;
let other: LoadedGolden;

beforeAll(async () => {
	owner = new Client({
		connectionString: parseOwnerEnv(process.env).DATABASE_URL_OWNER,
	});
	await owner.connect();
	golden = await loadGolden(owner, await createUser(owner, "delete"));
	other = await loadGolden(owner, await createUser(owner, "delete-other"));
});

afterAll(async () => {
	await owner?.query(`DELETE FROM auth."user" WHERE id = ANY($1)`, [
		[golden?.userId, other?.userId].filter(Boolean),
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

/** Deletes `id` at `If-Match` `version` as the golden user, then reads it back. */
function deleteAndRead(id: string, version = 1) {
	const ctx = goldenContext(golden.userId);
	return asUser(golden.userId, async (tx) => {
		await deleteTransaction(tx, ctx, id, version);
		return getTransaction(tx, id);
	});
}

describe("a delete", () => {
	// golden #24: Swiggy, 640.00 on 19 October.
	test("removes the row after locking the profile", async () => {
		const { result, statements } = await deleteAndRead(golden.id(24));
		expect(result).toBeNull();
		// The profile lock and the delete; then the test's read.
		expect(statements).toBe(3);
	});

	// golden #12: the Sunrise Apartments charge. At M1 a charge has no link to delete with it.
	test("removes a charge like any row", async () => {
		expect((await deleteAndRead(golden.id(12))).result).toBeNull();
	});

	// BR-F03-18: demo rows are deleted like other rows.
	test("removes a demo row", async () => {
		const ctx = goldenContext(golden.userId);
		const { result } = await asUser(golden.userId, async (tx) => {
			const id = await addExpense(tx, golden.userId, {
				payee: "Demo Cafe",
				amountMinor: 30000,
				occurredOn: "2026-11-02",
				demo: true,
			});
			await deleteTransaction(tx, ctx, id, 1);
			return getTransaction(tx, id);
		});
		expect(result).toBeNull();
	});
});

describe("versions and missing rows (BR-P2-21, BR-F03-25)", () => {
	test("a stale version gets 409 with the current row and currency, and deletes nothing", async () => {
		const ctx = goldenContext(golden.userId);
		const { result, statements } = await asUser(golden.userId, async (tx) => {
			const current = await getTransaction(tx, golden.id(24));
			const answer = await refusal(
				deleteTransaction(tx, ctx, golden.id(24), 2),
			);
			return {
				current,
				answer,
				after: await getTransaction(tx, golden.id(24)),
			};
		});
		expect(result.answer).toEqual({
			code: "version_conflict",
			fields: {},
			details: { current: { ...result.current, currency: "INR" } },
		});
		expect(result.after).toEqual(result.current);
		// The test's read; the lock, the delete that matched nothing and the re-read; the test's read.
		expect(statements).toBe(5);
	});

	test("another user's row and an unknown id get 404, and leave the other user's row", async () => {
		const ctx = goldenContext(golden.userId);
		for (const id of [other.id(24), uuidV7At(GOLDEN_NOW)]) {
			const { result } = await asUser(golden.userId, (tx) =>
				refusal(deleteTransaction(tx, ctx, id, 1)),
			);
			expect(result).toMatchObject({ code: "not_found" });
		}
		const { rows } = await owner.query(
			"SELECT count(*)::int AS n FROM app.transactions WHERE id = $1",
			[other.id(24)],
		);
		expect(rows[0]).toEqual({ n: 1 });
	});

	test("an id that is not a UUID gets 404 before any statement", async () => {
		const ctx = goldenContext(golden.userId);
		const { result, statements } = await asUser(golden.userId, (tx) =>
			refusal(deleteTransaction(tx, ctx, "24", 1)),
		);
		expect(result).toMatchObject({ code: "not_found" });
		expect(statements).toBe(0);
	});

	/** A committed row of the golden user's, changed by `between` once the delete has locked the
	 * profile. These rows stay until the user is deleted. */
	async function race(between: (id: string) => Promise<unknown>) {
		const id = uuidV7At(GOLDEN_NOW);
		await owner.query(
			`INSERT INTO app.transactions (id, user_id, created_at, updated_at, type, amount_minor,
			   occurred_at, occurred_on, category, payee, source, version)
			 VALUES ($1, $2, $3, $3, 'expense', 30000, $3, '2026-11-02', 'food', 'Chai Point', 'manual', 1)`,
			[id, golden.userId, GOLDEN_NOW],
		);
		const ctx = goldenContext(golden.userId);
		const { result } = await asUser(golden.userId, (tx) =>
			refusal(
				deleteTransaction(
					afterFirstStatement(tx, () => between(id)),
					ctx,
					id,
					1,
				),
			),
		);
		return { id, refusal: result };
	}

	test("a row changed after the lock gets 409 with the other device's row", async () => {
		const { id, refusal: answer } = await race((id) =>
			owner.query(
				`UPDATE app.transactions SET payee = 'Theirs', version = 2 WHERE id = $1`,
				[id],
			),
		);
		expect(answer).toMatchObject({
			code: "version_conflict",
			details: {
				current: { id, payee: "Theirs", version: 2, currency: "INR" },
			},
		});
	});

	test("a row deleted after the lock gets 404", async () => {
		const { refusal: answer } = await race((id) =>
			owner.query(`DELETE FROM app.transactions WHERE id = $1`, [id]),
		);
		expect(answer).toMatchObject({ code: "not_found" });
	});
});
