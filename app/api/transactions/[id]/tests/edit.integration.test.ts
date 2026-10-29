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

import { GOLDEN_NOW } from "../../../../../seed/golden";
import { loadGolden, type LoadedGolden } from "../../../../../seed/load-golden";
import { call } from "@/server/api/tests/call";
import { signedInUser } from "@/server/auth/tests/sessions";
import { runtimePool } from "@/server/db/pools";
import { uuidV7At } from "@/server/dal/transactions/tests/helpers";
import { parseOwnerEnv } from "@/server/env";
import { GET, PATCH } from "../route";

/** `PATCH /api/transactions/[id]` (F03 section 11, BR-F03-23) through the route wrapper, a real
 * session and the golden clock: the schema's refusals, `If-Match`, idempotency and the answer.
 * The merged-row, window and charge rules are tested on `editTransaction` itself. */

let owner: Client;
let golden: LoadedGolden & { cookie: string };
let other: LoadedGolden & { cookie: string };
let noProfile: { id: string; cookie: string };

async function goldenUser(label: string) {
	const user = await signedInUser(owner, label);
	return { ...(await loadGolden(owner, user.id)), cookie: user.cookie };
}

beforeAll(async () => {
	owner = new Client({
		connectionString: parseOwnerEnv(process.env).DATABASE_URL_OWNER,
	});
	await owner.connect();
	golden = await goldenUser("edit-route");
	other = await goldenUser("edit-route-other");
	noProfile = await signedInUser(owner, "edit-route-new");
});

afterAll(async () => {
	await owner?.query(`DELETE FROM auth."user" WHERE id = ANY($1)`, [
		[golden?.userId, other?.userId, noProfile?.id].filter(Boolean),
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

/** A committed expense of the golden user's, recorded at the golden clock: Chai Point, 300.00
 * of food at 11:40 IST on 2 November, at version 1. */
async function fresh(): Promise<string> {
	const id = uuidV7At(GOLDEN_NOW);
	await owner.query(
		`INSERT INTO app.transactions (id, user_id, created_at, updated_at, type, amount_minor,
		   occurred_at, occurred_on, category, payee, source, version)
		 VALUES ($1, $2, $3, $3, 'expense', 30000, '2026-11-02T06:10:00Z', '2026-11-02', 'food',
		   'Chai Point', 'manual', 1)`,
		[id, golden.userId, GOLDEN_NOW],
	);
	return id;
}

const patch = (
	id: string,
	input: unknown,
	{
		version = "1",
		cookie = golden.cookie,
		key,
	}: { version?: string | null; cookie?: string | null; key?: string } = {},
) =>
	call(PATCH, `/api/transactions/${id}`, {
		method: "PATCH",
		params: { id },
		body: input,
		...(cookie === null ? {} : { cookie }),
		headers: {
			"if-match": version === null ? null : `"${version}"`,
			...(key ? { "idempotency-key": key } : {}),
		},
	});

const read = async (id: string) =>
	(
		(await call(GET, `/api/transactions/${id}`, {
			cookie: golden.cookie,
			params: { id },
		})) as { body: { data: Record<string, unknown> } }
	).body.data;

const errorOf = (body: unknown) =>
	(
		body as {
			error: {
				code: string;
				fields: Record<string, string>;
				details: Record<string, unknown>;
			};
		}
	).error;

test("answers 200 with the edited row and the profile currency, as GET then reads it", async () => {
	const id = await fresh();
	const { status, body } = await patch(id, {
		amountMinor: 32000,
		currency: "INR",
		payee: "  Chai Point Café  ",
		note: "With Asha",
	});
	expect(status).toBe(200);
	expect(body).toEqual({
		data: {
			id,
			type: "expense",
			amountMinor: 32000,
			occurredAt: "2026-11-02T06:10:00.000Z",
			occurredOn: "2026-11-02",
			category: "food",
			goalId: null,
			payee: "Chai Point Café",
			description: null,
			note: "With Asha",
			source: "manual",
			demo: false,
			subscriptionId: null,
			dueOn: null,
			edited: false,
			version: 2,
			createdAt: GOLDEN_NOW,
			updatedAt: GOLDEN_NOW,
			currency: "INR",
		},
	});
	expect(await read(id)).toEqual((body as { data: unknown }).data);
});

// golden #12: the Sunrise Apartments charge.
describe("a charge (BR-F03-16, D-486)", () => {
	test("takes a new amount and payee", async () => {
		const id = golden.id(12);
		const { status, body } = await patch(id, {
			amountMinor: 1850000,
			currency: "INR",
			payee: "Sunrise Apts",
		});
		expect(status).toBe(200);
		expect(body).toMatchObject({
			data: {
				amountMinor: 1850000,
				payee: "Sunrise Apts",
				source: "subscription",
				version: 2,
			},
		});
	});

	test("refuses a new type, date or time with 422 on each field", async () => {
		const id = golden.id(12);
		const { version } = (await read(id)) as { version: number };
		const { status, body } = await patch(
			id,
			{
				type: "income",
				occurredAt: "2026-10-01T18:30:00Z",
				occurredOn: "2026-10-02",
			},
			{ version: String(version) },
		);
		expect(status).toBe(422);
		expect(errorOf(body)).toMatchObject({
			code: "validation_failed",
			fields: {
				type: "A charge's type can't change.",
				occurredAt: "This Transaction's date and time can't change.",
				occurredOn: "This Transaction's date and time can't change.",
			},
		});
	});
});

describe("If-Match and missing rows (BR-P2-21, BR-F03-25)", () => {
	test("a stale version gets 409 with GET's row in details.current", async () => {
		const id = await fresh();
		await patch(id, { payee: "First" });
		const { status, body } = await patch(id, { payee: "Second" });
		expect(status).toBe(409);
		expect(errorOf(body)).toMatchObject({
			code: "version_conflict",
			details: { current: await read(id) },
		});
		expect(await read(id)).toMatchObject({ payee: "First", version: 2 });
	});

	test("no If-Match gets 400", async () => {
		const id = await fresh();
		const { status } = await patch(id, { payee: "Mine" }, { version: null });
		expect(status).toBe(400);
	});

	test("another user's row, a deleted row and a non-UUID id get 404", async () => {
		const deleted = await fresh();
		await owner.query(`DELETE FROM app.transactions WHERE id = $1`, [deleted]);
		for (const id of [other.id(24), deleted, "not-an-id"]) {
			const { status, body } = await patch(id, { payee: "Mine" });
			expect(status).toBe(404);
			expect(errorOf(body).code).toBe("not_found");
		}
		expect(
			(
				await call(GET, `/api/transactions/${other.id(24)}`, {
					cookie: other.cookie,
					params: { id: other.id(24) },
				})
			).body,
		).toMatchObject({ data: { payee: "Swiggy", version: 1 } });
	});
});

// AC-F03-05's rule for every mutation (BR-P2-18).
test("replaying an edit with the same key answers the same and raises version once", async () => {
	const id = await fresh();
	const key = randomUUIDv7();
	const first = await patch(id, { payee: "Once" }, { key });
	const again = await patch(id, { payee: "Once" }, { key });
	expect(first.status).toBe(200);
	expect(again).toMatchObject({ status: 200, body: first.body });
	expect(await read(id)).toMatchObject({ version: 2 });
});

describe("the schema's refusals (BR-F03-19, BR-F03-23)", () => {
	// AC-F03-12, BR-F03-19
	test.each([
		"source",
		"demo",
		"edited",
		"subscriptionId",
		"dueOn",
		"version",
		"updatedAt",
		"id",
	])("%s sent by the client is refused by name", async (field) => {
		const { status, body } = await patch(await fresh(), {
			payee: "Mine",
			[field]: null,
		});
		expect(status).toBe(422);
		expect(errorOf(body).fields).toMatchObject({
			[field]: "Daybook sets this field.",
		});
	});

	// AC-F03-06: a PATCH that carries createdAt is refused.
	test("createdAt gets 422: the recording time can't change", async () => {
		const { status, body } = await patch(await fresh(), {
			createdAt: GOLDEN_NOW,
		});
		expect(status).toBe(422);
		expect(errorOf(body).fields).toMatchObject({
			createdAt: "The recording time can't change.",
		});
	});

	test.each([
		[{}, { _body: "Send at least one change." }],
		[{ amountMinor: 100 }, { currency: "Send the currency with the amount." }],
		[
			{ occurredOn: "2026-11-02" },
			{ occurredAt: "Send the date and time together." },
		],
	])("%j gets 422 with %j", async (input, fields) => {
		const { status, body } = await patch(await fresh(), input);
		expect(status).toBe(422);
		expect(errorOf(body)).toMatchObject({ code: "validation_failed", fields });
	});
});

describe("the wrapper's refusals", () => {
	test("no session gets 401, and no profile 403 profile_required", async () => {
		const id = await fresh();
		expect((await patch(id, { payee: "Mine" }, { cookie: null })).status).toBe(
			401,
		);
		const { status, body } = await patch(
			id,
			{ payee: "Mine" },
			{
				cookie: noProfile.cookie,
			},
		);
		expect(status).toBe(403);
		expect(errorOf(body).code).toBe("profile_required");
	});
});
