import { randomUUIDv7 } from "node:crypto";
import { Client } from "pg";
import {
	afterAll,
	afterEach,
	beforeAll,
	beforeEach,
	describe,
	expect,
	test,
	vi,
} from "vitest";

import { GOLDEN_NOW } from "../../../../seed/golden";
import { loadGolden, type LoadedGolden } from "../../../../seed/load-golden";
import { call } from "@/server/api/tests/call";
import { signedInUser } from "@/server/auth/tests/sessions";
import { runtimePool } from "@/server/db/pools";
import { uuidV7At } from "@/server/dal/transactions/tests/helpers";
import { parseOwnerEnv } from "@/server/env";
import { GET as getOne } from "../[id]/route";
import { GET, POST } from "../route";

/** `POST /api/transactions` (F03 section 11, BR-F03-20) through the route wrapper, a real
 * session and the golden clock: idempotency, the schema's refusals and the stored row. The
 * date rules are tested on `createTransaction` itself, at other clocks. */

let owner: Client;
let golden: LoadedGolden & { cookie: string };
let noProfile: { id: string; cookie: string };

beforeAll(async () => {
	owner = new Client({
		connectionString: parseOwnerEnv(process.env).DATABASE_URL_OWNER,
	});
	await owner.connect();
	const user = await signedInUser(owner, "create-route");
	golden = { ...(await loadGolden(owner, user.id)), cookie: user.cookie };
	noProfile = await signedInUser(owner, "create-route-new");
});

afterAll(async () => {
	await owner?.query(`DELETE FROM auth."user" WHERE id = ANY($1)`, [
		[golden?.userId, noProfile?.id].filter(Boolean),
	]);
	await owner?.end();
	await runtimePool().end();
});

beforeEach(() => {
	vi.useFakeTimers({ toFake: ["Date"], now: new Date(GOLDEN_NOW) });
});

afterEach(() => {
	vi.useRealTimers();
});

/** A create body as the client sends it: an expense at the golden clock. */
const body = (fields: Record<string, unknown> = {}) => ({
	id: uuidV7At(GOLDEN_NOW),
	type: "expense",
	amountMinor: 30000,
	currency: "INR",
	occurredAt: "2026-11-02T06:10:00.000Z",
	occurredOn: "2026-11-02",
	createdAt: GOLDEN_NOW,
	category: "food",
	payee: "Chai Point",
	...fields,
});

const post = (
	input: unknown,
	{ cookie = golden.cookie, key }: { cookie?: string; key?: string } = {},
) =>
	call(POST, "/api/transactions", {
		method: "POST",
		cookie,
		body: input,
		...(key ? { headers: { "idempotency-key": key } } : {}),
	});

const errorOf = (body: unknown) =>
	(body as { error: { code: string; fields: Record<string, string> } }).error;

// golden P1: Chai Point, 300.00 of food at 11:40 IST on 2 November, now confirmed.
test("creates the row: 201 with the row and the profile currency", async () => {
	const input = body();
	const { status, body: answer } = await post(input);
	expect(status).toBe(201);
	expect(answer).toEqual({
		data: {
			id: input.id,
			type: "expense",
			amountMinor: 30000,
			occurredAt: "2026-11-02T06:10:00.000Z",
			occurredOn: "2026-11-02",
			category: "food",
			goalId: null,
			payee: "Chai Point",
			description: null,
			note: null,
			source: "manual",
			demo: false,
			subscriptionId: null,
			dueOn: null,
			edited: false,
			version: 1,
			createdAt: GOLDEN_NOW,
			updatedAt: GOLDEN_NOW,
			currency: "INR",
		},
	});
	// The list and the by-id endpoint read it back.
	const one = await call(getOne, `/api/transactions/${input.id}`, {
		cookie: golden.cookie,
		params: { id: input.id },
	});
	expect(one.body).toEqual(answer);
});

describe("idempotency (AC-F03-05, golden invariant 4)", () => {
	test("replaying a create with the same key makes one row and answers the same", async () => {
		const input = body();
		const key = randomUUIDv7();
		const first = await post(input, { key });
		const again = await post(input, { key });
		expect(first.status).toBe(201);
		expect(again).toMatchObject({ status: 201, body: first.body });
		const { rows } = await owner.query(
			"SELECT count(*)::int AS n FROM app.transactions WHERE id = $1",
			[input.id],
		);
		expect(rows[0]).toEqual({ n: 1 });
	});

	test("a new key with the same id answers 200 with the existing row", async () => {
		const input = body();
		const first = await post(input);
		const again = await post({ ...input, amountMinor: 1 });
		expect(again.status).toBe(200);
		expect(again.body).toEqual(first.body);
	});

	test("the same key with another body gets 422 idempotency_key_reused", async () => {
		const key = randomUUIDv7();
		await post(body(), { key });
		const { status, body: answer } = await post(body(), { key });
		expect(status).toBe(422);
		expect(errorOf(answer).code).toBe("idempotency_key_reused");
	});
});

describe("the schema's refusals", () => {
	// AC-F03-07: golden #26's instant, 19:00 UTC on 31 October, is 1 November in India.
	test("occurredOn must fit occurredAt: 2026-11-01 passes, 2026-11-02 is refused", async () => {
		const fits = await post(
			body({
				occurredAt: "2026-10-31T19:00:00.000Z",
				occurredOn: "2026-11-01",
			}),
		);
		expect(fits.status).toBe(201);
		const { status, body: answer } = await post(
			body({
				occurredAt: "2026-10-31T19:00:00.000Z",
				occurredOn: "2026-11-02",
			}),
		);
		expect(status).toBe(422);
		expect(errorOf(answer)).toMatchObject({
			code: "validation_failed",
			fields: { occurredOn: "The date doesn't match the time." },
		});
	});

	// AC-F03-09
	test.each([
		[
			"a payee on a goal_contribution",
			{
				type: "goal_contribution",
				goalId: "0199a000-0000-7000-8001-000000000001",
				category: undefined,
			},
			{ payee: "Goal Transactions have no payee." },
		],
		[
			"an income with category food",
			{ type: "income" },
			{ category: "Choose a category." },
		],
		[
			"an expense without a payee",
			{ payee: undefined },
			{ payee: "Enter who you paid, or who paid you." },
		],
		[
			"an amount of zero",
			{ amountMinor: 0 },
			{ amountMinor: "Enter an amount above zero." },
		],
		[
			"an amount above the INR maximum",
			{ amountMinor: 100000000000 },
			{ amountMinor: "The largest amount is 999,999,999.99." },
		],
	])("%s gets 422 on its field", async (_label, change, fields) => {
		const { status, body: answer } = await post(body(change));
		expect(status).toBe(422);
		expect(errorOf(answer)).toMatchObject({ code: "validation_failed", fields });
	});

	// AC-F03-12, BR-F03-19
	test.each([
		"source",
		"demo",
		"edited",
		"subscriptionId",
		"dueOn",
		"version",
		"updatedAt",
	])("%s sent by the client is refused by name", async (field) => {
		const { status, body: answer } = await post(body({ [field]: null }));
		expect(status).toBe(422);
		expect(errorOf(answer).fields).toMatchObject({
			[field]: "Daybook sets this field.",
		});
	});

	// AC-F03-13
	test("a USD create for an INR profile gets 422 currency_mismatch", async () => {
		const { status, body: answer } = await post(body({ currency: "USD" }));
		expect(status).toBe(422);
		expect(errorOf(answer).code).toBe("currency_mismatch");
	});
});

// BR-F03-12: trimmed, NFC, empty description and note stored as null, CRLF as LF.
test("stores text as BR-F03-12 says", async () => {
	const { body: answer } = await post(
		body({
			payee: "  Café Ümit  ",
			description: "   ",
			note: "line one\r\nline two",
		}),
	);
	expect(answer).toMatchObject({
		data: { payee: "Café Ümit", description: null, note: "line one\nline two" },
	});
});

test("a create shows in the list and the summary", async () => {
	const before = await call(
		GET,
		"/api/transactions?from=2026-11-02&to=2026-11-02",
		{
			cookie: golden.cookie,
		},
	);
	const input = body({ payee: "Listed" });
	await post(input);
	const after = await call(
		GET,
		"/api/transactions?from=2026-11-02&to=2026-11-02",
		{
			cookie: golden.cookie,
		},
	);
	const ids = (answer: unknown) =>
		(answer as { data: { items: { id: string }[] } }).data.items.map(
			({ id }) => id,
		);
	expect(ids(after.body)).toHaveLength(ids(before.body).length + 1);
	expect(ids(after.body)).toContain(input.id);
});

describe("the wrapper's refusals", () => {
	test("no Idempotency-Key gets 400", async () => {
		const { status } = await call(POST, "/api/transactions", {
			method: "POST",
			cookie: golden.cookie,
			body: body(),
			headers: { "idempotency-key": null },
		});
		expect(status).toBe(400);
	});

	test("no session gets 401, and no profile 403 profile_required", async () => {
		expect(
			(await call(POST, "/api/transactions", { method: "POST", body: body() }))
				.status,
		).toBe(401);
		const { status, body: answer } = await post(body(), {
			cookie: noProfile.cookie,
		});
		expect(status).toBe(403);
		expect(errorOf(answer).code).toBe("profile_required");
	});
});
