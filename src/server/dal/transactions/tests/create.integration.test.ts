import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

import { GOLDEN_NOW } from "../../../../../seed/golden";
import { loadGolden, type LoadedGolden } from "../../../../../seed/load-golden";
import {
	type TransactionCreateBody,
	transactionCreateSchema,
} from "@/lib/transactions/schemas";
import { ApiError } from "../../../api/errors";
import { runtimePool } from "../../../db/pools";
import { createUser } from "../../../db/tests/private-rows";
import { parseOwnerEnv } from "../../../env";
import type { Profile } from "../../context";
import { createTransaction } from "../create";
import { asUser, goldenContext, uuidV7At } from "./helpers";

/** `createTransaction` (F03 section 11, BR-F03-05 to BR-F03-10, BR-F03-20) through the runtime
 * role and RLS. Every case rolls back, at its own request clock. */

let owner: Client;
let golden: LoadedGolden;
let other: string;

beforeAll(async () => {
	owner = new Client({
		connectionString: parseOwnerEnv(process.env).DATABASE_URL_OWNER,
	});
	await owner.connect();
	golden = await loadGolden(owner, await createUser(owner, "create"));
	other = (await loadGolden(owner, await createUser(owner, "create-other")))
		.userId;
});

afterAll(async () => {
	await owner?.query(`DELETE FROM auth."user" WHERE id = ANY($1)`, [
		[golden?.userId, other].filter(Boolean),
	]);
	await owner?.end();
	await runtimePool().end();
});

/** A create body as the client sends it, made `minutes` before `now`, parsed by the schema. */
function body(
	now: string,
	fields: Record<string, unknown> = {},
): TransactionCreateBody {
	return transactionCreateSchema.parse({
		id: uuidV7At(now),
		type: "expense",
		amountMinor: 64000,
		currency: "INR",
		occurredAt: now,
		occurredOn: "2026-11-02",
		createdAt: now,
		category: "food",
		payee: "Swiggy",
		...fields,
	});
}

/** Runs a create at the request clock `now`, as the golden user unless `profile` changes. */
function create(
	now: string,
	input: TransactionCreateBody,
	profile: Partial<Profile> = {},
) {
	const ctx = { ...goldenContext(golden.userId, profile), now: new Date(now) };
	return asUser(golden.userId, (tx) => createTransaction(tx, ctx, input));
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

// The golden clock: 2026-11-02T12:00 IST.
const NOW = GOLDEN_NOW;

describe("a create", () => {
	test("stores the row as manual, not demo, version 1, and answers it", async () => {
		const input = body(NOW, { description: "Dinner", note: "With Asha" });
		const { result, statements } = await create(NOW, input);
		expect(result).toEqual({
			created: true,
			row: {
				id: input.id,
				type: "expense",
				amountMinor: 64000,
				occurredAt: NOW,
				occurredOn: "2026-11-02",
				category: "food",
				goalId: null,
				payee: "Swiggy",
				description: "Dinner",
				note: "With Asha",
				source: "manual",
				demo: false,
				subscriptionId: null,
				dueOn: null,
				edited: false,
				version: 1,
				createdAt: NOW,
				updatedAt: NOW,
			},
		});
		// The profile lock, then the insert.
		expect(statements).toBe(2);
	});

	// D-485: createdAt is the client's recording time; updatedAt is the request clock.
	test("keeps the client's createdAt and sets updatedAt from the request clock", async () => {
		const recorded = "2026-11-02T06:00:00.000Z";
		const { result } = await create(
			NOW,
			body(recorded, { createdAt: recorded }),
		);
		expect(result.row).toMatchObject({ createdAt: recorded, updatedAt: NOW });
	});

	// AC-F03-05, API-5: an id already the user's is that create, done before.
	test("an id the user already has answers that row, unchanged and not created", async () => {
		const input = body(NOW);
		const { result, statements } = await asUser(golden.userId, async (tx) => {
			const ctx = goldenContext(golden.userId);
			const first = await createTransaction(tx, ctx, input);
			const again = await createTransaction(tx, ctx, {
				...input,
				amountMinor: 1,
			});
			return { first, again };
		});
		expect(result.again).toEqual({ created: false, row: result.first.row });
		// Lock and insert, then lock, insert and the read that finds it.
		expect(statements).toBe(5);
	});

	// BR-P2-20: another user's id is hidden by RLS, so it cannot be answered.
	test("another user's id gets 409 id_conflict", async () => {
		const taken = uuidV7At(NOW);
		await owner.query(
			`INSERT INTO app.transactions (id, user_id, created_at, updated_at, type, amount_minor,
			   occurred_at, occurred_on, category, payee, source, version)
			 VALUES ($1, $2, $3, $3, 'expense', 100, $3, '2026-11-02', 'food', 'Theirs', 'manual', 1)`,
			[taken, other, NOW],
		);
		expect(
			await refusal(create(NOW, { ...body(NOW), id: taken })),
		).toMatchObject({
			code: "id_conflict",
		});
	});

	// AC-F03-13
	test("a currency other than the profile's gets 422 currency_mismatch", async () => {
		expect(
			await refusal(create(NOW, body(NOW, { currency: "USD" }))),
		).toMatchObject({ code: "currency_mismatch" });
	});

	// D-483: no user has a Goal until F06.
	test("a goalId gets 422 parent_missing on goalId", async () => {
		const input = body(NOW, {
			type: "goal_contribution",
			goalId: "0199a000-0000-7000-8001-000000000001",
			category: null,
			payee: null,
		});
		expect(await refusal(create(NOW, input))).toMatchObject({
			code: "parent_missing",
			fields: { goalId: "Choose a Goal." },
		});
	});
});

describe("the entry window (TIME-7, BR-F03-08)", () => {
	// AC-F03-06: recorded on 2026-10-16 (12:00 IST), the allowed dates run 6 to 16 October.
	const RECORDED = "2026-10-16T06:30:00.000Z";

	test("2026-10-05 gets date_out_of_window with the window; 2026-10-06 passes", async () => {
		const early = body(RECORDED, {
			occurredAt: "2026-10-05T06:30:00.000Z",
			occurredOn: "2026-10-05",
		});
		expect(await refusal(create(RECORDED, early))).toEqual({
			code: "date_out_of_window",
			fields: { occurredOn: "Choose today or one of the 10 days before." },
			details: { firstOn: "2026-10-06", lastOn: "2026-10-16" },
		});
		const first = body(RECORDED, {
			occurredAt: "2026-10-06T06:30:00.000Z",
			occurredOn: "2026-10-06",
		});
		expect((await create(RECORDED, first)).result.created).toBe(true);
	});

	test("reads the recording date in the profile zone", async () => {
		// 20:00 UTC on 15 October: 16 October in India, 15 October in Los Angeles.
		const recorded = "2026-10-15T20:00:00.000Z";
		const input = body(recorded, {
			occurredAt: recorded,
			occurredOn: "2026-10-16",
		});
		expect((await create(recorded, input)).result.created).toBe(true);
		expect(
			await refusal(
				create(recorded, input, { timezone: "America/Los_Angeles" }),
			),
		).toMatchObject({
			code: "date_out_of_window",
			details: { firstOn: "2026-10-05", lastOn: "2026-10-15" },
		});
	});

	// TIME-7: an offline create replays days later; its own recording date anchors the window.
	test("anchors to createdAt, however long ago the request clock moved on", async () => {
		const recorded = "2026-10-16T06:30:00.000Z";
		const input = body(recorded, {
			occurredAt: recorded,
			occurredOn: "2026-10-16",
		});
		expect((await create(NOW, input)).result.created).toBe(true);
	});
});

describe("future times (BR-F03-09, BR-P2-20, TIME-7)", () => {
	const at = (minutes: number) =>
		new Date(Date.parse(NOW) + minutes * 60000).toISOString();

	// AC-F03-06: an occurredAt 10 minutes ahead is refused.
	test("occurredAt past createdAt plus 5 minutes gets validation_failed on occurredAt", async () => {
		expect(
			await refusal(create(NOW, body(NOW, { occurredAt: at(10) }))),
		).toEqual({
			code: "validation_failed",
			fields: { occurredAt: "The time can't be in the future." },
			details: {},
		});
		expect(
			(await create(NOW, body(NOW, { occurredAt: at(5) }))).result.created,
		).toBe(true);
	});

	test("createdAt past the request clock plus 5 minutes gets date_out_of_window", async () => {
		const input = body(NOW, { createdAt: at(6), occurredAt: at(6) });
		expect(await refusal(create(NOW, input))).toMatchObject({
			code: "date_out_of_window",
			fields: { createdAt: "The recording time can't be in the future." },
		});
		const edge = body(NOW, { createdAt: at(5), occurredAt: at(5) });
		expect((await create(NOW, edge)).result.created).toBe(true);
	});

	test("an id whose time is past the request clock plus 5 minutes gets 422 on id", async () => {
		const input = { ...body(NOW), id: uuidV7At(at(6)) };
		expect(await refusal(create(NOW, input))).toMatchObject({
			code: "validation_failed",
			fields: {
				id: "This item's time is in the future. Check your device's clock.",
			},
		});
		expect(
			(await create(NOW, { ...body(NOW), id: uuidV7At(at(5)) })).result
				.created,
		).toBe(true);
	});

	test("names the id and occurredAt together when both are ahead", async () => {
		const input = { ...body(NOW, { occurredAt: at(10) }), id: uuidV7At(at(10)) };
		expect((await refusal(create(NOW, input))).fields).toEqual({
			id: "This item's time is in the future. Check your device's clock.",
			occurredAt: "The time can't be in the future.",
		});
	});
});

describe("the check order (F03 section 11)", () => {
	test("the currency is checked before the dates", async () => {
		const input = body(NOW, {
			currency: "USD",
			occurredAt: "2026-10-01T06:30:00.000Z",
			occurredOn: "2026-10-01",
		});
		expect((await refusal(create(NOW, input))).code).toBe("currency_mismatch");
	});

	test("the dates are checked before the Goal", async () => {
		const input = body(NOW, {
			type: "goal_withdrawal",
			goalId: "0199a000-0000-7000-8001-000000000002",
			category: null,
			payee: null,
			occurredAt: "2026-10-01T06:30:00.000Z",
			occurredOn: "2026-10-01",
		});
		expect((await refusal(create(NOW, input))).code).toBe("date_out_of_window");
	});
});
