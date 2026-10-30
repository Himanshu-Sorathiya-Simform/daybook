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
import { loadGolden } from "../../../../seed/load-golden";
import { call } from "@/server/api/tests/call";
import { signedInUser } from "@/server/auth/tests/sessions";
import { runtimePool } from "@/server/db/pools";
import { viewBody } from "@/server/dal/transaction-views/tests/helpers";
import { parseOwnerEnv } from "@/server/env";
import { GET, POST } from "../route";

/** `GET` and `POST /api/transaction-views` (F03 section 11, BR-F03-63, BR-F03-64; D-488)
 * through the route wrapper, real sessions and the golden clock. Each test has its own users,
 * where views commit and the limit or the list counts them. */

type User = { id: string; cookie: string };

let owner: Client;
const users: string[] = [];
let noProfile: User;
/** Shared by tests whose views don't count against one another: refusals and distinct names. */
let shared: User;

beforeAll(async () => {
	owner = new Client({
		connectionString: parseOwnerEnv(process.env).DATABASE_URL_OWNER,
	});
	await owner.connect();
	noProfile = await signedInUser(owner, "views-route-new");
	users.push(noProfile.id);
	shared = await user("views-shared");
});

afterAll(async () => {
	await owner?.query(`DELETE FROM auth."user" WHERE id = ANY($1)`, [users]);
	await owner?.end();
	await runtimePool().end();
});

beforeEach(() => {
	vi.useFakeTimers({ toFake: ["Date"], now: new Date(GOLDEN_NOW) });
});

afterEach(() => {
	vi.useRealTimers();
});

/** A signed-in user with the golden profile (INR, India) and `views` committed views named
 * "View 1" and on. */
async function user(label: string, views = 0): Promise<User> {
	const signedIn = await signedInUser(owner, label);
	users.push(signedIn.id);
	await loadGolden(owner, signedIn.id);
	await owner.query(
		`INSERT INTO app.transaction_views (id, user_id, created_at, updated_at, name, filter,
		   sort, dir, group_by, version)
		 SELECT gen_random_uuid(), $1, $2::timestamptz - interval '1 hour' + n * interval '1 minute',
		   $2::timestamptz - interval '1 hour' + n * interval '1 minute', 'View ' || n, '{}', 'date',
		   'desc', 'day', 1
		 FROM generate_series(1, $3::int) AS n`,
		[signedIn.id, GOLDEN_NOW, views],
	);
	return signedIn;
}

const post = (who: User, input: unknown, key?: string) =>
	call(POST, "/api/transaction-views", {
		method: "POST",
		cookie: who.cookie,
		body: input,
		...(key ? { headers: { "idempotency-key": key } } : {}),
	});

const list = async (who: User) =>
	(
		(await call(GET, "/api/transaction-views", { cookie: who.cookie })) as {
			body: {
				data: { items: { id: string; name: string }[]; currency: string };
			};
		}
	).body.data;

const errorOf = (body: unknown) =>
	(body as { error: { code: string; fields: Record<string, string> } }).error;

// AC-F03-45
describe("creating and listing views", () => {
	test("a create answers 201 with version 1 and the currency, and the list shows it", async () => {
		const me = await user("views-create");
		const input = viewBody();
		const { status, body } = await post(me, input);
		expect(status).toBe(201);
		expect(body).toEqual({
			data: {
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
		const { currency, ...rest } = (body as { data: Record<string, unknown> })
			.data;
		expect(await list(me)).toEqual({ items: [rest], currency });
	});

	test("the list is in creation order and never holds All Transactions", async () => {
		const me = await user("views-order", 2);
		await post(me, viewBody({ name: "Third" }));
		const { items } = await list(me);
		expect(items.map(({ name }) => name)).toEqual(["View 1", "View 2", "Third"]);
	});

	test("an empty list still answers the currency", async () => {
		expect(await list(await user("views-empty"))).toEqual({
			items: [],
			currency: "INR",
		});
	});

	test("the same id again answers 200 with the stored view, at 20 views and with its name taken", async () => {
		const me = await user("views-retry", 19);
		const input = viewBody({ name: "Mine" });
		const first = await post(me, input);
		expect(first.status).toBe(201);
		// Now at 20, and "View 1" is another view's name.
		const again = await post(me, { ...input, name: "View 1" });
		expect(again).toMatchObject({ status: 200, body: first.body });
		expect((await list(me)).items).toHaveLength(20);
	});

	test("replaying a create with the same key answers the same 201, with one view", async () => {
		const me = await user("views-replay");
		const key = randomUUIDv7();
		const input = viewBody();
		const first = await post(me, input, key);
		const again = await post(me, input, key);
		expect([first.status, again.status]).toEqual([201, 201]);
		expect(again.body).toEqual(first.body);
		expect((await list(me)).items).toHaveLength(1);
	});
});

// AC-F03-46
describe("the limit", () => {
	test("with 20 views, a create gets 422 limit_reached", async () => {
		const me = await user("views-full", 20);
		const { status, body } = await post(me, viewBody());
		expect(status).toBe(422);
		expect(errorOf(body)).toMatchObject({
			code: "limit_reached",
			message: "You have 20 views. Delete one to save another.",
		});
	});

	test("with 19, two creates sent at once leave exactly 20: one 201, one limit_reached", async () => {
		const me = await user("views-race", 19);
		const answers = await Promise.all([
			post(me, viewBody({ name: "First" })),
			post(me, viewBody({ name: "Second" })),
		]);
		expect(answers.map(({ status }) => status).sort()).toEqual([201, 422]);
		const refused = answers.find(({ status }) => status === 422);
		expect(errorOf(refused?.body).code).toBe("limit_reached");
		expect((await list(me)).items).toHaveLength(20);
	});
});

// AC-F03-47
describe("names", () => {
	test('" Food " is stored as "Food", and "food" then gets 422 on name', async () => {
		const me = shared;
		expect(await post(me, viewBody({ name: " Food " }))).toMatchObject({
			status: 201,
			body: { data: { name: "Food" } },
		});
		const { status, body } = await post(me, viewBody({ name: "food" }));
		expect(status).toBe(422);
		expect(errorOf(body)).toMatchObject({
			code: "validation_failed",
			fields: { name: "You already have a view with this name." },
		});
	});

	test("two creates of one new name sent at once: one 201, one 422 on name", async () => {
		const me = shared;
		const answers = await Promise.all([
			post(me, viewBody({ name: "Groceries" })),
			post(me, viewBody({ name: "GROCERIES" })),
		]);
		expect(answers.map(({ status }) => status).sort()).toEqual([201, 422]);
		const refused = answers.find(({ status }) => status === 422);
		expect(errorOf(refused?.body).fields).toEqual({
			name: "You already have a view with this name.",
		});
	});

	// Every name refusal is tested on createView; this one shows the wrapper's answer.
	test('"ALL TRANSACTIONS" gets 422 on name', async () => {
		const { status, body } = await post(
			shared,
			viewBody({ name: "ALL TRANSACTIONS" }),
		);
		expect(status).toBe(422);
		expect(errorOf(body).fields).toEqual({
			name: "You already have a view with this name.",
		});
	});
});

// AC-F03-48
describe("filters", () => {
	// Every filter refusal is tested on createView; this one shows the path in the answer.
	test('cat ["food", "pizza"] gets 422 on filter.cat.1', async () => {
		const { status, body } = await post(
			shared,
			viewBody({ filter: { cat: ["food", "pizza"] } }),
		);
		expect(status).toBe(422);
		expect(errorOf(body).fields).toEqual({
			"filter.cat.1": "Choose a category.",
		});
	});

	// AC-F03-48, D-492: the unknown key itself, in the answer the client reads.
	test("an unknown key such as month gets 422 on filter.month", async () => {
		const { status, body } = await post(
			shared,
			viewBody({ filter: { month: "2026-10" } }),
		);
		expect(status).toBe(422);
		expect(errorOf(body).fields).toEqual({
			"filter.month": "Remove this field.",
		});
	});

	test("minMinor with currency USD for an INR profile gets 422 currency_mismatch", async () => {
		const me = shared;
		const { status, body } = await post(
			me,
			viewBody({ filter: { minMinor: 1000 }, currency: "USD" }),
		);
		expect(status).toBe(422);
		expect(errorOf(body).code).toBe("currency_mismatch");
	});

	test('cat ["shopping", "food", "food"] is stored as ["food", "shopping"]', async () => {
		const me = shared;
		const { body } = await post(
			me,
			viewBody({ filter: { cat: ["shopping", "food", "food"] } }),
		);
		expect(body).toMatchObject({
			data: { filter: { cat: ["food", "shopping"] } },
		});
	});
});

// AC-F03-53
test("one user's list never shows another's views", async () => {
	const a = await user("views-a", 2);
	const b = await user("views-b");
	await post(a, viewBody({ name: "A's own" }));
	expect((await list(b)).items).toEqual([]);
	expect((await list(a)).items).toHaveLength(3);
});

test("another user's id gets 409 id_conflict", async () => {
	const a = await user("views-id-a");
	const b = await user("views-id-b");
	const input = viewBody();
	await post(a, input);
	const { status, body } = await post(b, { ...input, name: "B's" });
	expect(status).toBe(409);
	expect(errorOf(body).code).toBe("id_conflict");
});

describe("the wrapper's refusals", () => {
	test("no session gets 401, and no profile 403 profile_required", async () => {
		expect(
			(
				await call(POST, "/api/transaction-views", {
					method: "POST",
					body: viewBody(),
				})
			).status,
		).toBe(401);
		expect(
			(await call(GET, "/api/transaction-views", { cookie: noProfile.cookie }))
				.status,
		).toBe(403);
		const { status, body } = await post(noProfile, viewBody());
		expect(status).toBe(403);
		expect(errorOf(body).code).toBe("profile_required");
	});

	test("a JSON body that is not an object gets 422", async () => {
		const me = shared;
		const { status, body } = await post(me, ["not", "a", "view"]);
		expect(status).toBe(422);
		expect(errorOf(body).code).toBe("validation_failed");
	});
});
