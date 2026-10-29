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

import { GOLDEN_NOW, GOLDEN_SUBSCRIPTIONS } from "../../../../../seed/golden";
import { loadGolden, type LoadedGolden } from "../../../../../seed/load-golden";
import { call } from "@/server/api/tests/call";
import { signedInUser } from "@/server/auth/tests/sessions";
import { runtimePool } from "@/server/db/pools";
import { uuidV7At } from "@/server/dal/transactions/tests/helpers";
import { parseOwnerEnv } from "@/server/env";
import { GET as list } from "../../route";
import { GET as summary } from "../../summary/route";
import { DELETE, GET, PATCH } from "../route";

/** `DELETE /api/transactions/[id]` (F03 section 11, BR-F03-17, BR-F03-25; D-487) through the
 * route wrapper, a real session and the golden clock. */

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
	golden = await goldenUser("delete-route");
	other = await goldenUser("delete-route-other");
	noProfile = await signedInUser(owner, "delete-route-new");
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

/** A committed expense of the golden user's at version 1: Chai Point, 300.00 on 2 November. */
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

const remove = (
	id: string,
	input: unknown = {},
	{
		version = "1",
		cookie = golden.cookie,
		key,
	}: { version?: string | null; cookie?: string | null; key?: string } = {},
) =>
	call(DELETE, `/api/transactions/${id}`, {
		method: "DELETE",
		params: { id },
		body: input,
		...(cookie === null ? {} : { cookie }),
		headers: {
			"if-match": version === null ? null : `"${version}"`,
			...(key ? { "idempotency-key": key } : {}),
		},
	});

const read = (id: string, cookie = golden.cookie) =>
	call(GET, `/api/transactions/${id}`, { cookie, params: { id } });

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

test("answers 204 with no body, and the row is gone", async () => {
	const id = await fresh();
	const { status, body, headers } = await remove(id);
	expect(status).toBe(204);
	expect(body).toBeNull();
	expect(headers.get("content-type")).toBeNull();
	expect((await read(id)).status).toBe(404);
});

// golden #24: Swiggy, 640.00 of food on 19 October.
test("a delete leaves the list and the summary", async () => {
	const october = "?from=2026-10-01&to=2026-10-31";
	const totals = async () =>
		(
			(await call(summary, `/api/transactions/summary${october}`, {
				cookie: golden.cookie,
			})) as { body: { data: { count: number; spendingMinor: number } } }
		).body.data;
	const ids = async () =>
		(
			(await call(list, `/api/transactions${october}`, {
				cookie: golden.cookie,
			})) as { body: { data: { items: { id: string }[] } } }
		).body.data.items.map(({ id }) => id);
	const before = await totals();
	expect((await remove(golden.id(24))).status).toBe(204);
	const after = await totals();
	expect(after.count).toBe(before.count - 1);
	expect(after.spendingMinor).toBe(before.spendingMinor - 64000);
	expect(await ids()).not.toContain(golden.id(24));
});

// golden #12 and #16: the Sunrise Apartments and Netflix charges.
describe("a charge (BR-F03-17; D-487)", () => {
	test("deletes with its hint", async () => {
		const { status } = await remove(golden.id(12), {
			subscriptionId: GOLDEN_SUBSCRIPTIONS.sunrise.id,
			dueOn: "2026-10-01",
		});
		expect(status).toBe(204);
		expect((await read(golden.id(12))).status).toBe(404);
	});

	test("deletes without a hint", async () => {
		expect((await remove(golden.id(16))).status).toBe(204);
	});

	test.each([
		[
			{ subscriptionId: GOLDEN_SUBSCRIPTIONS.netflix.id },
			{ dueOn: "Send the Subscription and due date together." },
		],
		[
			{ dueOn: "2026-10-05" },
			{ subscriptionId: "Send the Subscription and due date together." },
		],
		[
			{ subscriptionId: "netflix", dueOn: "2026-10-05" },
			{ subscriptionId: "Use a UUIDv7 id." },
		],
	])("%j gets 422 with %j and deletes nothing", async (input, fields) => {
		const id = await fresh();
		const { status, body } = await remove(id, input);
		expect(status).toBe(422);
		expect(errorOf(body)).toMatchObject({ code: "validation_failed", fields });
		expect((await read(id)).status).toBe(200);
	});

	test("any other field gets 422", async () => {
		const id = await fresh();
		const { status, body } = await remove(id, { version: 1 });
		expect(status).toBe(422);
		expect(Object.keys(errorOf(body).fields)).toEqual(["_body"]);
	});
});

describe("If-Match, missing rows and replay (BR-P2-18, BR-P2-21, BR-F03-25)", () => {
	test("a stale version gets 409 with GET's row in details.current, and the row stays", async () => {
		const id = await fresh();
		await call(PATCH, `/api/transactions/${id}`, {
			method: "PATCH",
			cookie: golden.cookie,
			params: { id },
			body: { payee: "Edited" },
			headers: { "if-match": '"1"' },
		});
		const { status, body } = await remove(id);
		expect(status).toBe(409);
		const current = (await read(id)).body as { data: unknown };
		expect(errorOf(body)).toMatchObject({
			code: "version_conflict",
			details: { current: current.data },
		});
		expect(current.data).toMatchObject({ payee: "Edited", version: 2 });
	});

	test("a second delete gets 404", async () => {
		const id = await fresh();
		await remove(id);
		const { status, body } = await remove(id);
		expect(status).toBe(404);
		expect(errorOf(body).code).toBe("not_found");
	});

	test("another user's row and a non-UUID id get 404, and the other user's row stays", async () => {
		for (const id of [other.id(24), "not-an-id"]) {
			expect((await remove(id)).status).toBe(404);
		}
		expect((await read(other.id(24), other.cookie)).status).toBe(200);
	});

	test("replaying a delete with the same key answers 204 again without a second delete", async () => {
		const id = await fresh();
		const key = randomUUIDv7();
		const first = await remove(id, {}, { key });
		const again = await remove(id, {}, { key });
		expect([first.status, again.status]).toEqual([204, 204]);
		expect(again.body).toBeNull();
	});

	test("no If-Match gets 400 and deletes nothing", async () => {
		const id = await fresh();
		expect((await remove(id, {}, { version: null })).status).toBe(400);
		expect((await read(id)).status).toBe(200);
	});
});

describe("the wrapper's refusals", () => {
	test("no session gets 401, and no profile 403 profile_required", async () => {
		const id = await fresh();
		expect((await remove(id, {}, { cookie: null })).status).toBe(401);
		const { status, body } = await remove(id, {}, { cookie: noProfile.cookie });
		expect(status).toBe(403);
		expect(errorOf(body).code).toBe("profile_required");
		expect((await read(id)).status).toBe(200);
	});
});
