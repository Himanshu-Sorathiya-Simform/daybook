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

// T3: the edges of the header and the body, through the wrapper (BR-P2-17, BR-P2-18, API-4).
describe("the If-Match header's forms", () => {
	/** A PATCH with `header` as the If-Match, sent as written. */
	const send = (id: string, header: string, input: unknown = { payee: "Mine" }) =>
		call(PATCH, `/api/transactions/${id}`, {
			method: "PATCH",
			params: { id },
			cookie: golden.cookie,
			body: input,
			headers: { "if-match": header },
		});

	test.each([
		['W/"1"', "a weak validator"],
		['"01"', "a leading zero"],
		['"0"', "version 0"],
		["1", "no quotes"],
		['""', "an empty version"],
		['"1", "2"', "two values"],
		['"-1"', "a negative version"],
		['"1.0"', "a fraction"],
		['"1e0"', "an exponent"],
		['"2147483648"', "one past the largest integer"],
		['"12345678901"', "eleven digits"],
		["*", "the wildcard"],
	])("%s gets 400 and changes nothing: %s", async (header) => {
		const id = await fresh();
		const { status, body } = await send(id, header);
		expect(status).toBe(400);
		expect(errorOf(body).code).toBe("bad_request");
		expect(await read(id)).toMatchObject({ payee: "Chai Point", version: 1 });
	});

	test('"2147483647", the largest version, is well formed and stale: 409 with the row', async () => {
		const id = await fresh();
		const { status, body } = await send(id, '"2147483647"');
		expect(status).toBe(409);
		expect(errorOf(body).details).toMatchObject({ current: { id, version: 1 } });
	});
});

describe("the body's forms", () => {
	const raw = (id: string, rawBody: string) =>
		call(PATCH, `/api/transactions/${id}`, {
			method: "PATCH",
			params: { id },
			cookie: golden.cookie,
			rawBody,
			headers: { "if-match": '"1"' },
		});

	test("an empty object gets 422: send at least one change", async () => {
		const id = await fresh();
		const { status, body } = await patch(id, {});
		expect(status).toBe(422);
		expect(errorOf(body).fields).toEqual({ _body: "Send at least one change." });
	});

	test.each([
		["null", "null"],
		["an array", "[]"],
		["a string", '"payee"'],
		["a number", "5"],
		["true", "true"],
	])("%s gets 422 on the body as a whole", async (_name, text) => {
		const id = await fresh();
		const { status, body } = await raw(id, text);
		expect(status).toBe(422);
		expect(Object.keys(errorOf(body).fields)).toEqual(["_body"]);
		expect(await read(id)).toMatchObject({ version: 1 });
	});

	test.each([
		["an empty body", ""],
		["an unfinished object", '{"payee":'],
		["single quotes", "{'payee': 'x'}"],
		["a trailing comma", '{"payee": "x",}'],
	])("%s gets 400, not 422: it is not JSON", async (_name, text) => {
		const id = await fresh();
		const { status, body } = await raw(id, text);
		expect(status).toBe(400);
		expect(errorOf(body).code).toBe("bad_request");
	});

	// B4, D-491: nesting beyond 32 levels is refused before the body is hashed or checked.
	test("a body nested 33 levels deep, and one 30,000 deep, get 400", async () => {
		const id = await fresh();
		let nested: unknown = 1;
		for (let level = 0; level < 33; level++) nested = { payee: nested };
		expect((await patch(id, nested)).status).toBe(400);
		const deep = await raw(id, "[".repeat(30_000) + "]".repeat(30_000));
		expect(deep.status).toBe(400);
		expect(errorOf(deep.body).code).toBe("bad_request");
		expect(await read(id)).toMatchObject({ version: 1 });
	});

	test("a body nested 31 levels is still read, and refused as a body of the wrong shape", async () => {
		const id = await fresh();
		let nested: unknown = 1;
		for (let level = 0; level < 31; level++) nested = { payee: nested };
		expect((await patch(id, nested)).status).toBe(422);
	});
});

describe("the id, and other users' rows (BR-P2-21, SEC-2)", () => {
	test("an id in capitals edits the row, and the answer holds it in lowercase", async () => {
		const id = await fresh();
		const { status, body } = await patch(id.toUpperCase(), {
			payee: "Capitals",
		});
		expect(status).toBe(200);
		expect(body).toMatchObject({ data: { id, payee: "Capitals", version: 2 } });
	});

	// A 409 would say the row exists, so a wrong version on another user's row is a 404.
	test.each(["1", "2", "99"])(
		"another user's row with If-Match %s gets 404, never 409, and stays unchanged",
		async (version) => {
			const { status, body } = await patch(
				other.id(24),
				{ payee: "Mine" },
				{ version },
			);
			expect(status).toBe(404);
			expect(errorOf(body).code).toBe("not_found");
			expect(errorOf(body).details).toEqual({});
			const theirs = await call(GET, `/api/transactions/${other.id(24)}`, {
				cookie: other.cookie,
				params: { id: other.id(24) },
			});
			expect(theirs.body).toMatchObject({
				data: { payee: "Swiggy", version: 1 },
			});
		},
	);

	test("a row that does not exist gets the same 404 as another user's, whatever the version", async () => {
		const answers = await Promise.all([
			patch(uuidV7At(GOLDEN_NOW), { payee: "x" }, { version: "1" }),
			patch(uuidV7At(GOLDEN_NOW), { payee: "x" }, { version: "99" }),
			patch(other.id(24), { payee: "x" }, { version: "99" }),
		]);
		expect(answers.map(({ status }) => status)).toEqual([404, 404, 404]);
		expect(
			new Set(
				answers.map(({ body }) => JSON.stringify(errorOf(body).details)),
			),
		).toEqual(new Set(["{}"]));
	});
});

describe("a key reused (BR-P2-18, D-432)", () => {
	// The request hash is the method, the path with its query and the body: If-Match is not in
	// it, so a replay is answered from the stored answer whatever version it names.
	test("with another If-Match, it is the same request and gets the stored answer", async () => {
		const id = await fresh();
		const key = randomUUIDv7();
		const first = await patch(id, { payee: "Once" }, { key, version: "1" });
		const same = await patch(id, { payee: "Once" }, { key, version: "1" });
		const other = await patch(id, { payee: "Once" }, { key, version: "7" });
		expect(first.status).toBe(200);
		expect(same).toMatchObject({ status: 200, body: first.body });
		expect(other).toMatchObject({ status: 200, body: first.body });
		expect(await read(id)).toMatchObject({ payee: "Once", version: 2 });
	});

	test("with a body of the same meaning written in another order, it is the same request", async () => {
		const id = await fresh();
		const key = randomUUIDv7();
		const first = await patch(id, { payee: "Once", note: "n" }, { key });
		const again = await patch(id, { note: "n", payee: "Once" }, { key });
		expect(again).toMatchObject({ status: 200, body: first.body });
		expect(await read(id)).toMatchObject({ version: 2 });
	});

	test("with a different body it is 422 idempotency_key_reused, and the row is as the first left it", async () => {
		const id = await fresh();
		const key = randomUUIDv7();
		await patch(id, { payee: "First" }, { key });
		const { status, body } = await patch(
			id,
			{ payee: "Second" },
			{ key, version: "2" },
		);
		expect(status).toBe(422);
		expect(errorOf(body).code).toBe("idempotency_key_reused");
		expect(await read(id)).toMatchObject({ payee: "First", version: 2 });
	});

	test("on another id it is 422 idempotency_key_reused: the path is in the hash", async () => {
		const first = await fresh();
		const second = await fresh();
		const key = randomUUIDv7();
		await patch(first, { payee: "Same" }, { key });
		const { status, body } = await patch(second, { payee: "Same" }, { key });
		expect(status).toBe(422);
		expect(errorOf(body).code).toBe("idempotency_key_reused");
		expect(await read(second)).toMatchObject({
			payee: "Chai Point",
			version: 1,
		});
	});
});
